<?php

namespace Database\Seeders;

use App\Models\Structure;
use Illuminate\Database\Seeder;

class StructureSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['Service central', 'PNLP', 'PNLT', 'PNLS', 'UCP-FM'] as $nom) {
            Structure::firstOrCreate(['nom' => $nom]);
        }
    }
}
