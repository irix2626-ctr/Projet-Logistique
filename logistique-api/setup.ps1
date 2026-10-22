<#
 Installation du backend Logistique sur Laravel Herd (Windows).
 Usage (PowerShell, dans ce dossier) :   .\setup.ps1
 Options : -Name logistique-api   -HerdDir "C:\Users\moi\Herd"   -DbName logistique
#>
param(
  [string]$Name = "logistique-api",
  [string]$HerdDir = (Join-Path $env:USERPROFILE "Herd"),
  [string]$DbName = "logistique"
)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$overlay = Join-Path $here "overlay"
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

foreach ($cmd in "php", "composer") {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "'$cmd' est introuvable dans le PATH. Ouvrez Laravel Herd, choisissez PHP 8.3 ou plus, puis relancez un NOUVEAU terminal."
  }
}
if (-not (Test-Path $HerdDir)) { throw "Dossier Herd introuvable : $HerdDir (utilisez -HerdDir)." }
if (-not (Test-Path $overlay)) { throw "Dossier 'overlay' introuvable à côté du script." }
$target = Join-Path $HerdDir $Name
if (Test-Path $target) { throw "Le dossier $target existe déjà : choisissez un autre -Name ou supprimez-le." }

Step "1/8  Création du projet Laravel dans $target"
Set-Location $HerdDir
composer create-project laravel/laravel $Name --prefer-dist --no-interaction
Set-Location $target

Step "2/8  Installation de Laravel Sanctum"
composer require laravel/sanctum --no-interaction
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider" --no-interaction

Step "3/8  Nettoyage des fichiers par défaut (avant la copie des nôtres)"
Get-ChildItem database/migrations -Filter "*create_users_table.php" -ErrorAction SilentlyContinue | Remove-Item -Force
Remove-Item database/factories/UserFactory.php -Force -ErrorAction SilentlyContinue
Remove-Item tests/Feature/ExampleTest.php, tests/Unit/ExampleTest.php -Force -ErrorAction SilentlyContinue

Step "4/8  Copie du code du projet"
robocopy $overlay $target /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Échec de la copie (robocopy code $LASTEXITCODE)." }

Step "5/8  Adaptation de Sanctum aux identifiants UUID"
$mig = Get-ChildItem database/migrations -Filter "*create_personal_access_tokens_table.php" | Select-Object -First 1
if (-not $mig) { throw "Migration Sanctum introuvable (create_personal_access_tokens_table)." }
$c = Get-Content $mig.FullName -Raw
if ($c -cnotmatch "uuidMorphs") {
  $c = $c -creplace "morphs\('tokenable'\)", "uuidMorphs('tokenable')"
  if ($c -cnotmatch "uuidMorphs") { throw "Impossible d'adapter la migration Sanctum : modifiez morphs('tokenable') en uuidMorphs('tokenable') à la main." }
  [System.IO.File]::WriteAllText($mig.FullName, $c, (New-Object System.Text.UTF8Encoding $false))
}
Add-Content -Path .gitignore -Value "`n# Secrets (SECURITE.md SEC-1.1)`n.env.*`n!.env.example`n*.pem`n*.key`n*.p12`n*.pfx"

Step "6/8  Configuration (.env)"
Copy-Item .env.example .env -Force
php artisan key:generate --force

Step "7/8  Base de données MySQL '$DbName'"
if (Get-Command mysql -ErrorAction SilentlyContinue) {
  & mysql -u root -e "CREATE DATABASE IF NOT EXISTS $DbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  if ($LASTEXITCODE -ne 0) { Write-Warning "Création automatique impossible : créez la base '$DbName' à la main, puis relancez 'php artisan migrate --seed'." }
} else {
  Write-Warning "Client 'mysql' introuvable. Créez la base '$DbName' (utf8mb4) avec le service MySQL de Herd Pro ou DBngin, vérifiez DB_USERNAME / DB_PASSWORD dans .env, puis lancez : php artisan migrate --seed"
}

Step "8/8  Migrations, données de départ et tests"
php artisan migrate --seed --force
if ($LASTEXITCODE -ne 0) { throw "Les migrations ont échoué : vérifiez la connexion MySQL dans .env." }
php artisan test

Write-Host "`nTerminé." -ForegroundColor Green
Write-Host "API : http://$Name.test/api/v1/ping   (pour HTTPS : herd secure $Name)"
Write-Host "Le mot de passe administrateur est affiché UNE SEULE FOIS dans le bloc jaune ci-dessus."
