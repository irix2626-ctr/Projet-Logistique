#!/usr/bin/env bash
# Installation du backend Logistique sur Laravel Herd (macOS / Linux).
# Usage : bash setup.sh [nom-du-projet] [dossier-herd] [nom-base]
set -euo pipefail

NAME="${1:-logistique-api}"
HERD_DIR="${2:-$HOME/Herd}"
DB_NAME="${3:-logistique}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OVERLAY="$HERE/overlay"
step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }

for cmd in php composer; do
  command -v "$cmd" >/dev/null || { echo "'$cmd' introuvable. Ouvrez Herd (PHP 8.3+) puis relancez un nouveau terminal."; exit 1; }
done
[ -d "$HERD_DIR" ] || { echo "Dossier Herd introuvable : $HERD_DIR"; exit 1; }
[ -d "$OVERLAY" ] || { echo "Dossier 'overlay' introuvable."; exit 1; }
TARGET="$HERD_DIR/$NAME"
[ ! -e "$TARGET" ] || { echo "$TARGET existe déjà."; exit 1; }

step "1/8  Création du projet Laravel dans $TARGET"
cd "$HERD_DIR"
composer create-project laravel/laravel "$NAME" --prefer-dist --no-interaction
cd "$TARGET"

step "2/8  Installation de Laravel Sanctum"
composer require laravel/sanctum --no-interaction
php artisan vendor:publish --provider="Laravel\\Sanctum\\SanctumServiceProvider" --no-interaction

step "3/8  Nettoyage des fichiers par défaut"
rm -f database/migrations/*create_users_table.php database/factories/UserFactory.php \
      tests/Feature/ExampleTest.php tests/Unit/ExampleTest.php

step "4/8  Copie du code du projet"
cp -R "$OVERLAY"/. "$TARGET"/

step "5/8  Adaptation de Sanctum aux identifiants UUID"
MIG="$(ls database/migrations/*create_personal_access_tokens_table.php | head -n1)"
grep -q "uuidMorphs" "$MIG" || sed -i.bak "s/morphs('tokenable')/uuidMorphs('tokenable')/" "$MIG"
rm -f "$MIG.bak"
grep -q "uuidMorphs" "$MIG" || { echo "Adaptez à la main : morphs('tokenable') -> uuidMorphs('tokenable') dans $MIG"; exit 1; }
printf '\n# Secrets (SECURITE.md SEC-1.1)\n.env.*\n!.env.example\n*.pem\n*.key\n*.p12\n*.pfx\n' >> .gitignore

step "6/8  Configuration (.env)"
cp .env.example .env
php artisan key:generate --force

step "7/8  Base de données MySQL '$DB_NAME'"
if command -v mysql >/dev/null; then
  mysql -u root -e "CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci" \
    || echo "Création impossible : créez la base '$DB_NAME' à la main."
else
  echo "Client mysql introuvable : créez la base '$DB_NAME' (Herd Pro / DBngin), vérifiez .env, puis : php artisan migrate --seed"
fi

step "8/8  Migrations, données de départ et tests"
php artisan migrate --seed --force
php artisan test

printf '\nTerminé. API : http://%s.test/api/v1/ping  (HTTPS : herd secure %s)\n' "$NAME" "$NAME"
echo "Le mot de passe administrateur est affiché UNE SEULE FOIS ci-dessus."
