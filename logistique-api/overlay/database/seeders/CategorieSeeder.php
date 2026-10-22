<?php

namespace Database\Seeders;

use App\Models\Categorie;
use Illuminate\Database\Seeder;

class CategorieSeeder extends Seeder
{
    /** Catégories de départ : modifiables ensuite par l'administrateur. Icônes Lucide, fonds pastel. */
    public function run(): void
    {
        $categories = [
            ['Véhicules', 'car', '#E3F2FD'],
            ['Informatique', 'laptop', '#EDE7F6'],
            ['Mobilier', 'armchair', '#FFF3E0'],
            ['Équipement médical et laboratoire', 'stethoscope', '#E8F5E9'],
            ['Matériel de bureau', 'printer', '#FCE4EC'],
            ['Énergie et climatisation', 'zap', '#FFFDE7'],
            ['Autres', 'package', '#ECEFF1'],
        ];

        foreach ($categories as [$nom, $icone, $couleur]) {
            Categorie::firstOrCreate(['nom' => $nom], ['icone' => $icone, 'couleur_fond' => $couleur]);
        }
    }
}
