<?php

namespace App\Support;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

/**
 * Règles de validation partagées entre les FormRequest (API en ligne) et le moteur de synchronisation.
 * Une opération de synchro est validée exactement comme une requête normale (SEC-6.1).
 */
class Rules
{
    public static function etat(): array
    {
        return ['required', Rule::in(config('logistique.etats'))];
    }

    public static function password(): Password
    {
        return Password::min(10)->letters()->numbers();
    }

    /** Fiche du lot. En mode partiel (mise à jour), "required" devient "sometimes". */
    public static function lotFiche(bool $partial = false): array
    {
        $rules = [
            'fournisseur' => ['required', 'string', 'max:190'],
            'description' => ['nullable', 'string', 'max:5000'],
            'usage' => ['required', 'string', 'max:255'],
            'etat_fonctionnement' => self::etat(),
            'no_serie_chassis' => ['nullable', 'string', 'max:190'],
            'code_bailleur_immatriculation' => ['nullable', 'string', 'max:190'],
            'structure_service' => ['nullable', 'string', 'max:190'],
            'observations' => ['nullable', 'string', 'max:5000'],
            'quantite_initiale' => ['required', 'integer', 'min:1', 'max:10000000'],
            'cout_total' => ['required', 'numeric', 'min:0', 'max:999999999999'],
        ];

        if ($partial) {
            foreach ($rules as $field => $set) {
                $rules[$field] = array_map(fn ($r) => $r === 'required' ? 'sometimes' : $r, $set);
            }
        }

        return $rules;
    }

    /** Correction d'un lot : fiche partielle + changement possible du matériel (désignation, catégorie, marque). */
    public static function lotUpdate(): array
    {
        return self::lotFiche(true) + [
            'materiel_id' => ['sometimes', 'uuid', Rule::exists('materiels', 'id')->whereNull('deleted_at')],
        ];
    }

    public static function lotCreate(?string $id): array
    {
        return array_merge([
            'id' => ['required', 'uuid'],
            'numero_lot' => [
                'required', 'string', 'regex:'.config('logistique.lot_number_pattern'),
                Rule::unique('lots', 'numero_lot')->ignore($id, 'id'),
            ],
            'materiel_id' => ['required', 'uuid', Rule::exists('materiels', 'id')->whereNull('deleted_at')],
        ], self::lotFiche());
    }

    public static function sortieStore(): array
    {
        return [
            'id' => ['required', 'uuid'],
            'lot_id' => ['required', 'uuid', 'exists:lots,id'],
            'quantite' => ['required', 'integer', 'min:1', 'max:10000000'],
            'nom_beneficiaire' => ['required', 'string', 'max:190'],
            'contact_beneficiaire' => ['nullable', 'string', 'max:190'],
            'fonction' => ['nullable', 'string', 'max:190'],
            'usage' => ['required', 'string', 'max:255'],
            'etat_fonctionnement' => self::etat(),
            'description' => ['nullable', 'string', 'max:5000'],
            'signature' => ['nullable', 'string', 'max:3000000'],
        ];
    }

    public static function categorie(?string $id): array
    {
        return [
            'id' => ['required', 'uuid'],
            'nom' => ['required', 'string', 'max:190', Rule::unique('categories', 'nom')->ignore($id, 'id')],
            'icone' => ['nullable', 'string', 'max:100'],
            'couleur_fond' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ];
    }

    public static function materiel(): array
    {
        return [
            'id' => ['required', 'uuid'],
            'designation' => ['required', 'string', 'max:190'],
            'categorie_id' => ['required', 'uuid', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'marque_modele' => ['nullable', 'string', 'max:190'],
        ];
    }

    public static function document(): array
    {
        return [
            'id' => ['required', 'uuid'],
            'rattache_type' => ['required', Rule::in(['lot', 'sortie'])],
            'rattache_id' => ['required', 'uuid'],
            'nom' => ['required', 'string', 'max:255'],
            'mime' => ['nullable', 'string', 'max:100'],
        ];
    }
}
