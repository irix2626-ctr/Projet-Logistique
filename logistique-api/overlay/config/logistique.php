<?php

return [
    'api_version' => '1.0.0',

    // Taille de page fixe (README : 100 lignes par page).
    'per_page' => 100,

    // Durée de vie d'un jeton Sanctum (SEC-2.5).
    'token_ttl_days' => (int) env('TOKEN_TTL_DAYS', 30),

    // Version minimale du client desktop acceptée sur /sync/* (SEC-4.12).
    'min_client_version' => env('MIN_CLIENT_VERSION', '0.0.0'),

    'sync_batch_max' => 500,

    'upload_max_kb' => (int) env('UPLOAD_MAX_KB', 10240),

    // LOT-AAAA-Pxx-00001 ; P00 est réservé au serveur (lots de report d'archivage).
    'lot_number_pattern' => '/^LOT-\d{4}-P\d{2,}-\d{5}$/',

    // Un poste sans synchronisation depuis ce délai est signalé avant archivage (D5).
    'unsynced_after_hours' => (int) env('UNSYNCED_AFTER_HOURS', 24),

    'etats' => ['fonctionnel', 'non_fonctionnel'],

    // Compte administrateur créé par le seeder.
    'admin' => [
        'identifiant' => env('ADMIN_IDENTIFIANT', 'admin'),
        'nom' => env('ADMIN_NOM', 'Administrateur'),
    ],
];
