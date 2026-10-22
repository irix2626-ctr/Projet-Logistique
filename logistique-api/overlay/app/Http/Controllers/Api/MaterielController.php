<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Api\Concerns\Paginates;
use App\Http\Controllers\Controller;
use App\Models\Materiel;
use App\Support\Rules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MaterielController extends Controller
{
    use Paginates;

    private const FIELDS = ['id', 'designation', 'categorie_id', 'marque_modele'];

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'q' => ['nullable', 'string', 'max:100'],
            'categorie_id' => ['nullable', 'uuid'],
        ]);

        $query = Materiel::query();
        if ($q = $request->query('q')) {
            $query->where('designation', 'like', '%'.$q.'%');
        }
        if ($c = $request->query('categorie_id')) {
            $query->where('categorie_id', $c);
        }

        $page = $query->orderBy('designation')->orderBy('id')->cursorPaginate($this->pageSize());

        return response()->json($this->pageOf($page, fn ($m) => $m->only(self::FIELDS)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(Rules::materiel());

        $existing = Materiel::withTrashed()->find($data['id']);
        if ($existing) {
            return response()->json($existing->only(self::FIELDS));
        }

        return response()->json(Materiel::create($data)->only(self::FIELDS), 201);
    }

    public function update(Request $request, Materiel $materiel): JsonResponse
    {
        $data = $request->validate([
            'designation' => ['sometimes', 'string', 'max:190'],
            'categorie_id' => ['sometimes', 'uuid', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'marque_modele' => ['nullable', 'string', 'max:190'],
        ]);

        $materiel->update($data);

        return response()->json($materiel->only(self::FIELDS));
    }

    public function destroy(Materiel $materiel): JsonResponse
    {
        if ($materiel->lots()->exists()) {
            throw new BusinessRuleException('Ce matériel est utilisé par des lots.', 'MATERIEL_UTILISE');
        }

        $materiel->delete();

        return response()->json(null, 204);
    }
}
