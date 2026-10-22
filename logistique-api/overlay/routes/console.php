<?php

use Illuminate\Support\Facades\Schedule;

// Purge des jetons Sanctum expirés (SEC-2.9).
Schedule::command('sanctum:prune-expired --hours=24')->daily();

// Contrôle d'intégrité nocturne : objectif 0 anomalie (SEC-10.7).
Schedule::command('logistique:integrite')->dailyAt('02:00');
