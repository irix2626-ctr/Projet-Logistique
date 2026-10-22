<?php

namespace App\Console\Commands;

use App\Services\IntegrityService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class CheckIntegrity extends Command
{
    protected $signature = 'logistique:integrite';

    protected $description = "Contrôle d'intégrité des lots et des sorties (objectif : 0 anomalie).";

    public function handle(IntegrityService $integrity): int
    {
        $result = $integrity->check();

        if ($result['total'] > 0) {
            Log::error('Intégrité : anomalies détectées', $result);
            $this->error("{$result['total']} anomalie(s) détectée(s) :");
            foreach ($result['anomalies'] as $a) {
                $this->line(" - [{$a['type']}] {$a['detail']}");
            }

            return self::FAILURE;
        }

        $this->info('Intégrité OK : 0 anomalie.');

        return self::SUCCESS;
    }
}
