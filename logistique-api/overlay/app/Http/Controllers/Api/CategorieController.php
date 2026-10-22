<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Categorie;
use App\Support\Rules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategorieController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(
            Categorie::query()->orderBy('nom')->get(['id', 'nom', 'icone', 'couleur_fond'])
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(Rules::categorie($request->input('id')));

        $existing = Categorie::withTrashed()->find($data['id']);
        if ($existing) {
            return response()->json($existing->only(['id', 'nom', 'icone', 'couleur_fond']));
        }

        $categorie = Categorie::create($data);

        return response()->json($categorie->only(['id', 'nom', 'icone', 'couleur_fond']), 201);
    }

    public function update(Request $request, Categorie $categorie): JsonResponse
    {
        $data = $request->validate([
            'nom' => ['sometimes', 'string', 'max:190', Rule::unique('categories', 'nom')->ignore($categorie->id, 'id')],
            'icone' => ['nullable', 'string', 'max:100'],
            'couleur_fond' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $categorie->update($data);

        return response()->json($categorie->only(['id', 'nom', 'icone', 'couleur_fond']));
    }

    public function destroy(Categorie $categorie): JsonResponse
    {
        if ($categorie->materiels()->exists()) {
            throw new BusinessRuleException('Cette catégorie est utilisée par des matériels.', 'CATEGORIE_UTILISEE');
        }

        $categorie->delete();

        return response()->json(null, 204);
    }
}
