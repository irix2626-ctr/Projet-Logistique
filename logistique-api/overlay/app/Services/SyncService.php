<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\Categorie;
use App\Models\Device;
use App\Models\Document;
use App\Models\Lot;
use App\Models\Materiel;
use App\Models\Sortie;
use App\Models\Structure;
use App\Models\SyncConflict;
use App\Models\SyncLog;
use App\Models\SyncOp;
use App\Models\User;
use App\Support\Rules;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Synchronisation hors-ligne.
 * - push : chaque opération est traitée seule, dans sa transaction ; une erreur ne bloque pas les autres.
 * - pull : changements depuis un curseur (server_seq = id de sync_log), suppressions incluses.
 * Le serveur revalide tout (mêmes règles que l'API) et recalcule tout ce qui est dérivé.
 */
class SyncService
{
    private const MODELS = [
        'structures' => Structure::class,
        'users' => User::class,
        'categories' => Categorie::class,
        'materiels' => Materiel::class,
        'lots' => Lot::class,
        'sorties' => Sortie::class,
        'documents' => Document::class,
    ];

    public function __construct(
        private LotService $lots,
        private SortieService $sorties,
        private StockService $stock,
    ) {
    }

    // ------------------------------------------------------------------ push

    public function push(Device $device, User $tokenUser, array $operations): array
    {
        $results = [];

        foreach ($operations as $op) {
            $results[] = $this->processOne($device, $tokenUser, $op);
        }

        $device->forceFill(['derniere_synchro' => now()])->save();

        return $results;
    }

    private function processOne(Device $device, User $tokenUser, array $op): array
    {
        $opId = $op['op_id'];

        if ($previous = SyncOp::find($opId)) {
            return $this->result($opId, ['status' => 'duplicate'], $previous->server_seq);
        }

        $record = true;

        try {
            $outcome = DB::transaction(fn () => $this->apply($device, $tokenUser, $op));
        } catch (BusinessRuleException $e) {
            $outcome = ['status' => 'rejected', 'message' => $e->getMessage()];
        } catch (ValidationException $e) {
            $outcome = ['status' => 'rejected', 'message' => collect($e->errors())->flatten()->implode(' ')];
        } catch (Throwable $e) {
            report($e);
            $outcome = ['status' => 'rejected', 'message' => 'Erreur interne : opération à rejouer.'];
            $record = false; // erreur transitoire : on ne la mémorise pas, le poste pourra réessayer
        }

        $seq = (int) DB::table('sync_log')->max('id');

        if ($record) {
            SyncOp::create(['op_id' => $opId, 'device_id' => $device->getKey(), 'status' => $outcome['status'], 'server_seq' => $seq]);
        }

        return $this->result($opId, $outcome, $seq);
    }

    private function result(string $opId, array $outcome, ?int $seq): array
    {
        return [
            'op_id' => $opId,
            'status' => $outcome['status'],
            'server_seq' => $seq,
            'conflict_id' => $outcome['conflict_id'] ?? null,
            'message' => $outcome['message'] ?? null,
        ];
    }

    private function apply(Device $device, User $tokenUser, array $op): array
    {
        $payload = $op['payload'] ?? [];
        $payload['id'] = $op['record_id'];
        $clientTs = Carbon::parse($op['client_ts']);
        $operator = $this->resolveOperator($device, $tokenUser, $payload, $clientTs);

        return match ($op['table']) {
            'lots' => $this->applyLot($op, $payload, $operator, $clientTs),
            'sorties' => $this->applySortie($op, $payload, $operator, $clientTs),
            'categories' => $this->applyCategorie($op, $payload, $operator),
            'materiels' => $this->applyMateriel($op, $payload, $operator),
            'documents' => $this->applyDocument($op, $payload, $operator),
            default => throw new BusinessRuleException('Table non synchronisable.', 'TABLE_INCONNUE', 422),
        };
    }

    /**
     * SEC-6.4 : l'opérateur voyage dans l'opération (plusieurs utilisateurs sur un même poste hors-ligne).
     * Accepté seulement s'il s'est déjà connecté EN LIGNE sur ce poste, et si son compte existait
     * encore au moment de l'opération.
     */
    private function resolveOperator(Device $device, User $tokenUser, array $payload, Carbon $clientTs): User
    {
        $id = $payload['operateur_id'] ?? $tokenUser->getKey();
        $user = User::withTrashed()->find($id);

        if (! $user) {
            throw new BusinessRuleException('Opérateur inconnu.', 'OPERATEUR_INVALIDE', 422);
        }
        if ($user->trashed() && $user->deleted_at->lte($clientTs)) {
            throw new BusinessRuleException('Compte opérateur supprimé avant cette opération.', 'OPERATEUR_INVALIDE', 422);
        }
        if (! $device->users()->where('users.id', $user->getKey())->exists()) {
            throw new BusinessRuleException('Opérateur jamais connecté en ligne sur ce poste.', 'OPERATEUR_NON_AUTORISE', 403);
        }

        return $user;
    }

    /** Une date absurde (futur lointain, trop ancienne) est remplacée par l'heure du serveur (SEC-6.6). */
    private function clampDate(mixed $value, Carbon $fallback): Carbon
    {
        $date = $value ? Carbon::parse($value) : $fallback;

        if ($date->gt(now()->addDay()) || $date->lt(now()->subDays(400))) {
            return now();
        }

        return $date;
    }

    private function applyLot(array $op, array $payload, User $operator, Carbon $clientTs): array
    {
        $id = $payload['id'];

        if ($op['operation'] === 'create') {
            $data = Validator::make($payload, Rules::lotCreate($id))->validate();
            [, $created] = $this->lots->create($data, $operator, $this->clampDate($payload['date_entree'] ?? null, $clientTs));

            return ['status' => $created ? 'accepted' : 'duplicate'];
        }

        if ($op['operation'] === 'update') {
            $lot = Lot::find($id) ?? throw new BusinessRuleException('Lot introuvable ou archivé.', 'LOT_INTROUVABLE', 404);
            $data = Validator::make($payload, Rules::lotUpdate())->validate();
            $status = 'accepted';
            $notes = [];

            // Modification concurrente : la plus récente l'emporte sur les champs de saisie, l'écart est consigné.
            if (isset($op['base_version']) && (int) $op['base_version'] !== $lot->version) {
                $status = 'conflict';
                $notes[] = "Lot {$lot->numero_lot} modifié sur deux postes (version {$op['base_version']} -> {$lot->version}).";
            }

            // Jamais pour les quantités sorties : la quantité initiale ne descend pas sous le total sorti.
            if (isset($data['quantite_initiale']) && $data['quantite_initiale'] < $this->stock->totalSorti($lot)) {
                unset($data['quantite_initiale']);
                $status = 'conflict';
                $notes[] = "Quantité initiale ignorée sur {$lot->numero_lot} : inférieure à ce qui est déjà sorti.";
            }

            $lot->fill($data);
            $lot->version = $lot->version + 1;
            $lot->save();

            $conflictId = null;
            if ($notes) {
                $conflictId = SyncConflict::create([
                    'type' => 'modification_concurrente',
                    'lot_id' => $lot->getKey(),
                    'detail' => implode(' ', $notes),
                ])->getKey();
            }

            return ['status' => $status, 'conflict_id' => $conflictId];
        }

        // delete
        $lot = Lot::find($id);
        if (! $lot) {
            return ['status' => 'duplicate'];
        }
        $this->lots->delete($lot); // refusé (LOT_AVEC_SORTIES) si le lot a des sorties

        return ['status' => 'accepted'];
    }

    private function applySortie(array $op, array $payload, User $operator, Carbon $clientTs): array
    {
        if ($op['operation'] !== 'create') {
            throw new BusinessRuleException('Les sorties sont en lecture seule : ni modification ni suppression.', 'SORTIE_LECTURE_SEULE', 405);
        }

        $data = Validator::make($payload, Rules::sortieStore())->validate();
        unset($data['signature']); // les signatures arrivent par /sync/fichiers

        [$sortie, $created, $conflictId] = $this->sorties->create(
            $data,
            $operator,
            fromSync: true,
            date: $this->clampDate($payload['date_sortie'] ?? null, $clientTs),
        );

        if (! $created) {
            return ['status' => 'duplicate'];
        }

        return ['status' => $conflictId ? 'conflict' : 'accepted', 'conflict_id' => $conflictId];
    }

    private function applyCategorie(array $op, array $payload, User $operator): array
    {
        if (! $operator->isAdmin()) {
            throw new BusinessRuleException('Seul un administrateur gère les catégories.', 'DROIT_INSUFFISANT', 403);
        }

        if ($op['operation'] === 'delete') {
            $categorie = Categorie::find($payload['id']);
            if ($categorie) {
                if ($categorie->materiels()->exists()) {
                    throw new BusinessRuleException('Catégorie utilisée par des matériels.', 'CATEGORIE_UTILISEE');
                }
                $categorie->delete();
            }

            return ['status' => 'accepted'];
        }

        $data = Validator::make($payload, Rules::categorie($payload['id']))->validate();
        Categorie::updateOrCreate(['id' => $data['id']], $data);

        return ['status' => 'accepted'];
    }

    private function applyMateriel(array $op, array $payload, User $operator): array
    {
        if ($op['operation'] === 'delete') {
            if (! $operator->isAdmin()) {
                throw new BusinessRuleException('Seul un administrateur supprime un matériel.', 'DROIT_INSUFFISANT', 403);
            }
            $materiel = Materiel::find($payload['id']);
            if ($materiel) {
                if ($materiel->lots()->exists()) {
                    throw new BusinessRuleException('Matériel utilisé par des lots.', 'MATERIEL_UTILISE');
                }
                $materiel->delete();
            }

            return ['status' => 'accepted'];
        }

        $data = Validator::make($payload, Rules::materiel())->validate();
        Materiel::updateOrCreate(['id' => $data['id']], $data);

        return ['status' => 'accepted'];
    }

    private function applyDocument(array $op, array $payload, User $operator): array
    {
        if ($op['operation'] === 'delete') {
            Document::find($payload['id'])?->delete();

            return ['status' => 'accepted'];
        }
        if ($op['operation'] === 'update') {
            throw new BusinessRuleException('Un document ne se modifie pas.', 'DOCUMENT_IMMUABLE', 405);
        }

        $data = Validator::make($payload, Rules::document())->validate();

        if (Document::withTrashed()->find($data['id'])) {
            return ['status' => 'duplicate'];
        }

        // L'enregistrement arrive d'abord ; le fichier suit par /sync/fichiers (chemin = null d'ici là).
        Document::create($data + ['operateur_id' => $operator->getKey()]);

        return ['status' => 'accepted'];
    }

    // ------------------------------------------------------------------ pull

    public function pull(Device $device, int $cursor, int $limit = 200): array
    {
        $rows = SyncLog::query()->where('id', '>', $cursor)->orderBy('id')->limit($limit + 1)->get();
        $hasMore = $rows->count() > $limit;
        $rows = $rows->take($limit);

        // Plusieurs changements du même enregistrement dans la fenêtre : on garde le dernier.
        $latest = $rows->groupBy(fn ($r) => $r->table_name.'|'.$r->record_id)->map(fn ($g) => $g->last());

        $changes = [];
        foreach ($latest->sortBy('id') as $row) {
            $class = self::MODELS[$row->table_name] ?? null;
            $record = $class ? $class::withTrashed()->find($row->record_id) : null;

            if ($record) {
                $changes[] = ['table' => $row->table_name, 'record' => $record->toArray(), 'server_seq' => $row->id];
            }
        }

        $device->forceFill(['derniere_synchro' => now()])->save();

        return [
            'changes' => $changes,
            'next_cursor' => $rows->isNotEmpty() ? (int) $rows->last()->id : $cursor,
            'has_more' => $hasMore,
        ];
    }
}
