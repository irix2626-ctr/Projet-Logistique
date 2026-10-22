<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Api\Concerns\Paginates;
use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\SyncConflict;
use App\Services\ArchiveService;
use App\Services\AuditService;
use App\Services\IntegrityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AdminController extends Controller
{
    use Paginates;

    private const CONFLICT_FIELDS = ['id', 'type', 'lot_id', 'sortie_id', 'detail', 'resolu', 'commentaire'];

    /** Archivage après export : l'export doit avoir réussi côté client (export_confirme). */
    public function archivage(Request $request, ArchiveService $archive): JsonResponse
    {
        $request->validate([
            'export_confirme' => ['required', 'accepted'],
            'mot_de_passe' => ['required', 'string'],
            'forcer_si_postes_non_synchronises' => ['sometimes', 'boolean'],
        ]);

        $this->verifyPassword($request);
        $this->assertDevicesSynced($request);

        return response()->json($archive->run($request->user(), 'export'));
    }

    public function reinitialisation(Request $request, ArchiveService $archive): JsonResponse
    {
        $request->validate([
            'mot_de_passe' => ['required', 'string'],
            'forcer_si_postes_non_synchronises' => ['sometimes', 'boolean'],
        ]);

        $this->verifyPassword($request);
        $this->assertDevicesSynced($request);

        return response()->json($archive->run($request->user(), 'reinitialisation'));
    }

    public function conflits(Request $request): JsonResponse
    {
        $request->validate(['resolu' => ['nullable', 'boolean']]);

        $query = SyncConflict::query()->orderByDesc('created_at')->orderByDesc('id');
        if ($request->has('resolu')) {
            $query->where('resolu', $request->boolean('resolu'));
        }

        $page = $query->cursorPaginate($this->pageSize());

        return response()->json($this->pageOf($page, fn ($c) => $this->conflict($c)));
    }

    public function resoudreConflit(Request $request, SyncConflict $conflit): JsonResponse
    {
        $data = $request->validate(['commentaire' => ['required', 'string', 'max:2000']]);

        $conflit->forceFill([
            'resolu' => true,
            'commentaire' => $data['commentaire'],
            'resolved_by' => $request->user()->getKey(),
            'resolved_at' => now(),
        ])->save();

        AuditService::log('conflit.resolu', $conflit, null, ['commentaire' => $data['commentaire']]);

        return response()->json($this->conflict($conflit));
    }

    public function integrite(IntegrityService $integrity): JsonResponse
    {
        return response()->json($integrity->check());
    }

    /** Opération destructrice : le mot de passe est revérifié côté serveur même avec un jeton valide (SEC-3.5). */
    private function verifyPassword(Request $request): void
    {
        if (! Hash::check((string) $request->input('mot_de_passe'), $request->user()->password)) {
            AuditService::log('operation_sensible.mot_de_passe_incorrect');

            throw new BusinessRuleException('Mot de passe incorrect.', 'MOT_DE_PASSE_INVALIDE', 403);
        }
    }

    /** D5 : avertir l'admin si des postes n'ont pas synchronisé récemment. */
    private function assertDevicesSynced(Request $request): void
    {
        if ($request->boolean('forcer_si_postes_non_synchronises')) {
            return;
        }

        $limit = now()->subHours(config('logistique.unsynced_after_hours'));

        $stale = Device::query()
            ->whereNull('revoked_at')
            ->where(fn ($q) => $q->whereNull('derniere_synchro')->orWhere('derniere_synchro', '<', $limit))
            ->get();

        if ($stale->isNotEmpty()) {
            $names = $stale->map(fn ($d) => $d->code_poste.' ('.$d->nom.')')->implode(', ');

            throw new BusinessRuleException(
                "Postes non synchronisés : {$names}. Faites-les synchroniser ou forcez l'opération (les opérations tardives seront acceptées puis signalées).",
                'POSTES_NON_SYNCHRONISES'
            );
        }
    }

    private function conflict(SyncConflict $c): array
    {
        return $c->only(self::CONFLICT_FIELDS) + ['created_at' => $c->created_at?->toIso8601String()];
    }
}
