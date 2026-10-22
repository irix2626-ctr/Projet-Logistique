# Backend Logistique : installation sur Laravel Herd

Ce dossier contient le **code du projet** (`overlay/`) et deux scripts qui construisent un projet Laravel 13 complet dans votre dossier Herd. Le client desktop Tauri n'est pas inclus.

## Avant de commencer

- Laravel Herd installé, avec **PHP 8.3 ou plus** sélectionné.
- Un serveur **MySQL 8** local (service de Herd Pro, ou DBngin). Les tests, eux, n'en ont pas besoin (SQLite en mémoire).
- Un **nouveau terminal** après l'installation de Herd, pour que `php` et `composer` soient dans le PATH.

## Installation (une seule commande)

Windows (PowerShell) :

```powershell
.\setup.ps1
```

macOS / Linux :

```bash
bash setup.sh
```

Le script : crée le projet dans `Herd\logistique-api`, installe Sanctum (adapté aux UUID), copie le code, génère le `.env` et la clé, crée la base `logistique`, lance les migrations et les données de départ, puis exécute les tests.

**Le mot de passe de l'administrateur est affiché une seule fois** (bloc jaune, identifiant `admin`). Notez-le : le compte exige de changer ce mot de passe à la première connexion (`PUT /api/v1/auth/password`).

Si votre MySQL n'est pas accessible en `root` sans mot de passe, renseignez `DB_USERNAME` et `DB_PASSWORD` dans `.env`, puis : `php artisan migrate --seed`.

## Vérifier

```
http://logistique-api.test/api/v1/ping          (HTTPS : herd secure logistique-api)
php artisan test                                (doit être entièrement vert)
php artisan route:list --path=api
php artisan logistique:integrite                (doit afficher : 0 anomalie)
```

Premier appel de l'API (remplacez l'identifiant de structure par celui renvoyé par `GET /api/v1/structures`) :

```
POST /api/v1/auth/login
{ "structure_id": "...", "identifiant": "admin", "mot_de_passe": "...", "device_name": "PC dev" }
```

## Ce qui est implémenté (phases 1 à 7 de la roadmap, côté serveur)

| Zone | Contenu |
| --- | --- |
| Socle | API `/api/v1`, erreurs JSON uniformes, CORS strict, limites de débit, en-têtes de sécurité |
| Données | Migrations MySQL (compatibles SQLite), UUID fournis par le client, soft delete partout |
| Comptes | Connexion par structure, jetons Sanctum à durée limitée et à capacités, comptes gérés par l'admin, dernier admin protégé |
| Lots et stock | Entrées, stock calculé (jamais saisi), FIFO suggéré, correction et suppression sous règles |
| Sorties | Lot obligatoire, quantité plafonnée sous verrou, `pr_sr` et opérateur imposés, lecture seule (405) |
| Traçabilité | Journal unifié, cycle de vie d'un lot, Dashboard, contrôle d'intégrité |
| Synchronisation | `push` idempotent, `pull` par curseur (suppressions incluses), conflits de stock signalés, fichiers avec empreinte |
| Archivage | Export confirmé, archivage atomique, lots de report, réinitialisation protégée par mot de passe |
| Mises à jour | Manifeste Tauri Updater (`storage/app/updates/latest.json`) |
| Sécurité | Journal d'audit, tâches planifiées, SQL de droits MySQL de production (`deploy/`) |

## Choix à connaître

- **Numéros de lot** : le client génère `LOT-AAAA-Pxx-00001` (xx = code du poste attribué par `POST /devices`). Les lots de report d'archivage créés par le serveur utilisent `P00`.
- **`server_seq`** : c'est l'identifiant de la table `sync_log`, alimentée automatiquement à chaque écriture.
- **Postes** : un utilisateur n'est accepté dans une synchro que s'il s'est déjà connecté **en ligne** sur ce poste (`POST /devices` ou `device_id` à la connexion).
- **Postes non synchronisés** : l'archivage est bloqué si un poste n'a pas synchronisé depuis `UNSYNCED_AFTER_HOURS` (24 h), sauf `forcer_si_postes_non_synchronises`.
- **Messages de validation** : en anglais par défaut. Pour le français : `composer require laravel-lang/lang` puis `php artisan lang:add fr`.
- Deux routes s'ajoutent au contrat : `PUT /auth/password` et `GET /sorties/{id}/signature`.

## Tâches planifiées

En développement : `php artisan schedule:work`. En production : une entrée cron `* * * * * php artisan schedule:run` (purge des jetons expirés, contrôle d'intégrité nocturne).

## Production (VPS)

1. `deploy/.env.production.example` : modèle du `.env` (`APP_DEBUG=false`, `chmod 600`).
2. `deploy/mysql-grants.sql` : compte applicatif **sans DROP/ALTER/DELETE** sur les tables métier, journal d'audit en ajout seul. À exécuter après les migrations.
3. Le dossier public du serveur web doit être `public/`.
4. Voir `SECURITE.md` pour la liste de contrôle go-live.

## État de vérification

Ce code a été écrit **sans PHP ni accès réseau dans l'environnement de rédaction** : il n'a donc pas été exécuté. Une relecture des délimiteurs et des espaces de noms a été faite, mais **la première exécution de `php artisan test` est la vraie validation**. Envoyez-moi la sortie de toute erreur pour une correction immédiate.
