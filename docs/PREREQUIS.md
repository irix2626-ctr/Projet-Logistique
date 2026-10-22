# PREREQUIS : mise en place de l'environnement technique

> **Destinataire : un agent IA** (IDE, terminal) chargé de préparer la machine du développeur.
> Le projet : application desktop de logistique et traçabilité (client **Tauri v2** + API **Laravel 13** + MySQL).
> Documents liés : `README.md` (fonctionnel), `ROADMAP.md`, `SECURITE.md`, `openapi.yaml`, `INSTALL.md` (API), `logistique-desktop/README.md` (client).

---

## 0. Règles de conduite de l'agent (à lire en premier)

1. **Vérifier avant d'installer.** Pour chaque prérequis : exécuter la commande `check`. Si elle réussit et que la version convient, **ne rien réinstaller**.
2. **Ordre imposé.** Respecter la section 3 : une étape dépend des précédentes.
3. **Un échec arrête la séquence.** Ne pas contourner : rapporter la commande, la sortie complète et la cause probable (section 9), puis demander.
4. **Ne jamais inventer** une valeur de la section 2 (choix humains, secrets, domaine). La demander à l'utilisateur.
5. **Secrets.** Ne jamais afficher, journaliser ni envoyer à un service externe : mots de passe, `.env`, clés privées, jeton d'API. Ne jamais les committer. Vérifier que `.gitignore` couvre `.env`, `*.key`, `*.pem`, `*.p12`, `*.pfx`.
6. **Actions sur un serveur distant (VPS), certificats, clés de signature : jamais sans confirmation explicite** de l'utilisateur, étape par étape (section 7).
7. **Pas de commandes destructrices** (`rm -rf`, `DROP DATABASE`, `git reset --hard`, `migrate:fresh`) hors dossiers de test, sans accord explicite.
8. **Système cible : Windows 10/11 64 bits, PowerShell.** Les commandes `winget` demandent parfois une élévation (administrateur) : le dire à l'utilisateur plutôt que d'échouer en silence.
9. **Rendre compte** avec le tableau de la section 8 (étape, commande, résultat, version obtenue).

---

## 1. Manifeste des prérequis (lecture machine)

```yaml
systeme:
  os: Windows 10/11 x64
  shell: PowerShell
  droits: administrateur (installations), utilisateur (usage courant)
  disque_libre_go: 15           # Rust + Visual Studio Build Tools + dépendances
  ram_go_min: 8
outils:
  - { id: git,        version_min: "2.40", check: "git --version" }
  - { id: node,       version_min: "22.13", check: "node --version", note: "LTS actuelle recommandée ; node:sqlite requis par les tests" }
  - { id: npm,        version_min: "10",   check: "npm --version" }
  - { id: rust,       version_min: "1.77", check: "rustc --version", note: "toolchain stable-x86_64-pc-windows-msvc" }
  - { id: cargo,      version_min: "1.77", check: "cargo --version" }
  - { id: vs_build_tools, check: "where link.exe", note: "charge de travail « Desktop development with C++ »" }
  - { id: webview2,   check: "voir §3.6" }
  - { id: herd,       check: "herd --version ou application Herd lancée", note: "PHP + Nginx + DNS .test + HTTPS local" }
  - { id: php,        version_min: "8.3", check: "php -v" }
  - { id: composer,   version_min: "2.7", check: "composer --version" }
  - { id: mysql,      version_min: "8.0", check: "mysql --version", note: "service Herd Pro ou MySQL Community Server" }
extensions_php: [pdo_mysql, pdo_sqlite, mbstring, openssl, fileinfo, ctype, tokenizer, xml, dom, curl, zip]
ports_libres: { vite: 1420, mysql: 3306, herd_http: 80, herd_https: 443 }
livrables_projet:
  - logistique-api.zip        # backend Laravel (code + scripts d'installation Herd)
  - logistique-desktop.zip    # client Tauri
reseau: acces internet requis pour npm, cargo, composer, winget (le client, lui, fonctionne hors-ligne)
decisions_humaines: voir §2
```

---

## 2. Informations à obtenir de l'utilisateur (ne jamais deviner)

| # | Information | Quand | Remarque |
| --- | --- | --- | --- |
| H1 | L'utilisateur a-t-il les **droits administrateur** sur cette machine ? | Avant §3 | Nécessaire pour Visual Studio Build Tools, Herd |
| H2 | Mot de passe MySQL de l'utilisateur `root` (souvent vide avec Herd) | §4 | À saisir par l'utilisateur dans `.env`, jamais transmis à l'agent s'il peut l'éviter |
| H3 | Chemin d'installation de Herd (par défaut `%USERPROFILE%\Herd`) | §4 | Option `-HerdDir` du script |
| H4 | Nom du poste et adresse du serveur (`https://logistique-api.test` en dev) | §5 | Saisis dans l'application au premier lancement |
| H5 | **Hébergeur VPS**, taille, **nom de domaine** | §7 | Décision D4 : VPS validé, fournisseur à choisir |
| H6 | **Certificat de signature de code** Windows | §7 | Achat par l'utilisateur ; ne pas en générer un faux |
| H7 | Dépôt Git distant (GitHub, GitLab…) et branche protégée | §7 | Pour la CI et les publications |

---

## 3. Poste de développement : installation (ordre strict)

Pour chaque outil : **Check → Install (si absent) → Verify**. Si un identifiant `winget` n'est pas trouvé, faire `winget search <nom>` et choisir l'éditeur officiel.

### 3.1 Git
- Check : `git --version`
- Install : `winget install --id Git.Git -e`
- Verify : `git --version` (nouveau terminal)

### 3.2 Node.js (LTS, ≥ 22.13)
- Check : `node --version` (doit être ≥ 22.13)
- Install : `winget install --id OpenJS.NodeJS.LTS -e`
- Verify : `node --version` et `npm --version` ; puis `node -e "require('node:sqlite'); console.log('node:sqlite OK')"` (doit afficher `node:sqlite OK`, un avertissement « experimental » est normal)

### 3.3 Outils de build C++ (indispensables à Rust sous Windows)
- Check : `where link.exe` dans « Developer PowerShell for VS », ou présence de `C:\Program Files (x86)\Microsoft Visual Studio\*\BuildTools`
- Install (administrateur) :
  `winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`
  (une version plus récente de Visual Studio Build Tools convient aussi)
- Verify : redémarrer le terminal ; la charge « Desktop development with C++ » doit être listée dans Visual Studio Installer.
- **Un redémarrage de session est souvent nécessaire.**

### 3.4 Rust (toolchain MSVC)
- Check : `rustc --version` et `cargo --version`
- Install : `winget install --id Rustlang.Rustup -e` puis, dans un **nouveau** terminal : `rustup default stable-x86_64-pc-windows-msvc`
- Verify : `rustc --version` (≥ 1.77) ; `rustup show` doit indiquer `stable-x86_64-pc-windows-msvc`
- Facultatif utile : `rustup component add clippy rustfmt`

### 3.5 Tauri CLI
- Aucune installation globale : le CLI est une dépendance du projet (`@tauri-apps/cli`, installée par `npm install`).
- Verify (après §5.2) : `npx tauri --version` (2.x)

### 3.6 WebView2 (moteur d'affichage de l'application)
- Check : sous Windows 11 il est présent. Sinon : `Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue` (une valeur `pv` = version installée)
- Install : `winget install --id Microsoft.EdgeWebView2Runtime -e`

### 3.7 Laravel Herd (PHP, Nginx, DNS `.test`, HTTPS local)
- Check : l'application Herd est installée et démarrée ; `php -v` répond.
- Install : télécharger l'installateur officiel sur https://herd.laravel.com (action utilisateur si `winget` ne le propose pas).
- Configurer : dans Herd, sélectionner **PHP 8.3 ou plus** (le projet exige Laravel 13).
- Verify :
  - `php -v` → `PHP 8.3.x` ou plus
  - `composer --version` → 2.x
  - `php -m` doit contenir : `pdo_mysql`, `pdo_sqlite`, `mbstring`, `openssl`, `fileinfo`, `ctype`, `tokenizer`, `xml`, `dom`, `curl`, `zip`. Si une extension manque : l'activer dans les réglages PHP de Herd (ne pas éditer `php.ini` à la main sans le dire).

### 3.8 MySQL 8
Deux options (l'utilisateur choisit, question H1/H2) :
- **Herd Pro** : activer le service MySQL dans l'onglet Services.
- **MySQL Community Server** : `winget search mysql` puis installer l'éditeur Oracle (identifiant attendu : `Oracle.MySQL`), service en démarrage automatique, port 3306.
- Verify : `mysql --version` (≥ 8.0) et `mysql -u root -e "SELECT VERSION();"` (ajouter `-p` si un mot de passe existe : le laisser saisir par l'utilisateur).

### 3.9 Outils d'audit (SECURITE.md SEC-9.7, SEC-1.10)
- `composer audit` : fourni par Composer (rien à installer).
- `npm audit` : fourni par npm.
- `cargo audit` : `cargo install cargo-audit --locked` (compilation de plusieurs minutes, acceptable).
- Détection de secrets : `winget install --id Gitleaks.Gitleaks -e` (sinon `winget search gitleaks`). Verify : `gitleaks version`.

### 3.10 IDE (VS Code recommandé)
Extensions utiles (installation : `code --install-extension <id>`) :

| Extension | Identifiant |
| --- | --- |
| Rust Analyzer | `rust-lang.rust-analyzer` |
| Tauri | `tauri-apps.tauri-vscode` |
| PHP Intelephense | `bmewburn.vscode-intelephense-client` |
| Laravel | `laravel.vscode-laravel` |
| EditorConfig | `editorconfig.editorconfig` |

**Documentation à jour (recommandé pour l'agent)** : brancher le serveur MCP **Context7** dans l'IDE et l'interroger pour Tauri v2, Laravel 13 (Sanctum, Eloquent) et rusqlite avant d'écrire du code qui en dépend.

---

## 4. Mise en place de l'API (Laravel sur Herd)

Prérequis : §3.1 à §3.8 vérifiés.

1. Dézipper `logistique-api.zip` dans un dossier de travail (hors du dossier Herd).
2. Dans PowerShell, depuis ce dossier : `.\setup.ps1` (options : `-Name`, `-HerdDir`, `-DbName`).
   Le script : crée le projet Laravel dans `%USERPROFILE%\Herd\logistique-api`, installe Sanctum (adapté aux UUID), copie le code, génère `.env` et `APP_KEY`, crée la base `logistique`, lance `migrate --seed` puis `php artisan test`.
3. **Le mot de passe de l'administrateur n'est affiché qu'une fois** dans la sortie du script : le **transmettre à l'utilisateur** et ne pas le conserver dans un fichier ni dans l'historique.
4. Éditer `.env` du projet API :
   - `DB_USERNAME` / `DB_PASSWORD` si MySQL n'est pas en `root` sans mot de passe (la saisie du mot de passe est faite par l'utilisateur) ;
   - **CORS pour le client en développement** (déjà dans `.env.example` de cette version) :
     `CORS_ALLOWED_ORIGINS=http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://localhost:1420`
   - puis `php artisan config:clear`.
5. HTTPS local : `herd secure logistique-api` (le site devient `https://logistique-api.test`).
6. Verify :

| Commande | Résultat attendu |
| --- | --- |
| `php artisan test` | tous les tests verts |
| `php artisan migrate:status` | toutes les migrations « Ran » |
| `curl https://logistique-api.test/api/v1/ping` | JSON avec `"status":"ok"` |
| `php artisan logistique:integrite` | « Intégrité OK : 0 anomalie. » |
| `curl https://logistique-api.test/.env` | **404** (jamais le contenu du fichier) |

---

## 5. Mise en place du client (Tauri)

Prérequis : §3.1 à §3.6 vérifiés ; l'API (§4) répond.

1. Dézipper `logistique-desktop.zip`, ouvrir le dossier `logistique-desktop` dans l'IDE.
2. `npm install` (installe Vite, Tauri CLI, ExcelJS, jsPDF, docx, Signature Pad, polices, etc.).
3. `npm test` → **42 tests verts** (logique locale, synchronisation, sécurité d'affichage).
4. `npm run tauri dev` : la **première compilation Rust dure plusieurs minutes** (SQLite est compilé avec l'application). Une fenêtre « Logistique et traçabilité » s'ouvre.
5. Au premier lancement, dans l'application : adresse du serveur `https://logistique-api.test`, nom du poste ; « Tester la connexion » ; se connecter **en ligne** avec `admin` et le mot de passe fourni ; changer le mot de passe (obligatoire).
6. Verify (fonctionnel) : créer une catégorie (Paramètres), enregistrer une entrée, effectuer une sortie signée, ouvrir Traçabilité, générer un Bon de sortie PDF, observer l'indicateur de synchronisation (« Synchronisé »).

---

## 6. Sécurité de l'environnement (obligatoire)

| Exigence | Action de l'agent |
| --- | --- |
| `.env` jamais versionné | Vérifier `git check-ignore -v .env` → ignoré |
| Pas de secrets dans le dépôt | Lancer `gitleaks detect` avant tout premier commit ; corriger toute alerte |
| Disque chiffré (la base SQLite locale ne l'est pas) | Vérifier BitLocker : `manage-bde -status` ; si absent, **informer** l'utilisateur (ne pas l'activer à sa place) |
| Pas de réutilisation de secrets entre environnements | Chaque `.env` a ses propres valeurs ; ne jamais copier celui de production |
| Dépendances saines | `composer audit`, `npm audit`, `cargo audit` : rapporter les vulnérabilités critiques |
| Mot de passe administrateur | Changé à la première connexion ; jamais écrit dans un fichier |

---

## 7. Phase 10 et 11 : production (NE PAS EXÉCUTER sans accord explicite)

Ces étapes modifient un serveur distant ou engagent des secrets. L'agent **prépare et propose**, l'utilisateur **valide chaque étape**.

### 7.1 Serveur VPS (décision D4 : VPS)
Prérequis humains : H5 (hébergeur, taille, domaine). Cible : **Ubuntu Server LTS**, 2 vCPU / 2 à 4 Go de RAM pour démarrer.

Contrôles/installations à proposer (adapter la version PHP : 8.3 minimum) :
```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx mysql-server ufw fail2ban unzip git certbot python3-certbot-nginx \
  php8.3-fpm php8.3-mysql php8.3-sqlite3 php8.3-mbstring php8.3-xml php8.3-curl php8.3-zip php8.3-bcmath php8.3-intl
# Composer : suivre https://getcomposer.org/download/ (vérifier l'empreinte du script)
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable
```
Exigences de SECURITE.md à respecter : SSH **par clé uniquement**, `root` interdit, utilisateur de déploiement non root, MySQL en écoute locale, racine web = dossier `public/`, `APP_DEBUG=false`, `.env` en `chmod 600`, HTTPS avec renouvellement automatique (certbot), sauvegardes MySQL quotidiennes **chiffrées et copiées hors du serveur**, **test de restauration**.

Fichiers fournis : `deploy/.env.production.example` (modèle de `.env`) et `deploy/mysql-grants.sql` (compte applicatif sans `DROP`/`ALTER`/`DELETE` sur les tables métier ; à exécuter **après** les migrations, après avoir remplacé les mots de passe).

Planification : `* * * * * cd /chemin/api && php artisan schedule:run >> /dev/null 2>&1`

### 7.2 Mises à jour automatiques du client (Tauri Updater)
- Générer la paire de clés **une seule fois**, sur la machine de l'utilisateur : `npx tauri signer generate -w "$HOME/.tauri/logistique.key"`.
- La **clé privée ne quitte jamais cette machine** ni le coffre de CI ; en faire **deux sauvegardes** hors dépôt. Sa perte bloque toute mise à jour future ; sa fuite permet d'installer un logiciel piégé.
- Mettre le **contenu** de la clé publique (pas un chemin) dans `plugins.updater.pubkey`, activer `bundle.createUpdaterArtifacts: true`, pointer `plugins.updater.endpoints` vers l'API en HTTPS.
- Le plugin Updater n'est **pas encore branché** dans le client : l'ajouter à ce moment-là (Rust + JS), en interrogeant la documentation Tauri v2.

### 7.3 Signature de code et installateur
- Prérequis humain H6 : certificat de signature de code Windows (l'agent n'en fabrique pas).
- Avant le build : `npm run set-csp -- https://api.votre-domaine.example` (limite la politique de sécurité à l'API de production).
- Build : `npm run tauri build` → installateur NSIS dans `src-tauri/target/release/bundle/nsis`.
- Le site de téléchargement doit être **protégé par connexion** ; ne jamais publier l'installateur sur un lien public.

### 7.4 CI (prérequis H7)
Pipeline minimal à proposer : tests API (`php artisan test`), tests client (`npm test`), `composer audit`, `npm audit`, `cargo audit`, `gitleaks`. Publication depuis une **branche protégée** uniquement.

---

## 8. Compte rendu attendu de l'agent

Remplir ce tableau et le transmettre à l'utilisateur :

| Étape | Outil / action | Commande de vérification | Résultat | Version / remarque |
| --- | --- | --- | --- | --- |
| 3.1 | Git | `git --version` | ✅ / ❌ | |
| 3.2 | Node.js | `node --version` | | |
| 3.3 | Build Tools C++ | `where link.exe` | | |
| 3.4 | Rust | `rustc --version` | | |
| 3.6 | WebView2 | clé de registre | | |
| 3.7 | Herd + PHP 8.3+ + Composer | `php -v`, `composer --version` | | |
| 3.8 | MySQL 8 | `mysql --version` | | |
| 3.9 | Outils d'audit | `cargo audit --version`, `gitleaks version` | | |
| 4 | API installée | `php artisan test` | | |
| 4 | HTTPS local | `curl …/api/v1/ping` | | |
| 5 | Client | `npm test` (42 tests), `npm run tauri dev` | | |

---

## 9. Dépannage (symptôme → cause → action)

| Symptôme | Cause probable | Action |
| --- | --- | --- |
| `linker 'link.exe' not found` | Build Tools C++ absents | §3.3, puis nouveau terminal |
| `error: failed to run custom build command` pendant la compilation Rust | Outils C++ ou Windows SDK incomplets | Réinstaller la charge « Desktop development with C++ » (avec Windows SDK) |
| La fenêtre reste blanche | WebView2 absent | §3.6 |
| `Port 1420 is already in use` | Un autre Vite tourne | Fermer l'ancien processus ; le port est fixe (`strictPort`) |
| Erreur CORS dans la console de l'application | Origine de dev non autorisée côté API | Ajouter `http://localhost:1420` à `CORS_ALLOWED_ORIGINS`, puis `php artisan config:clear` |
| `logistique-api.test` introuvable | Herd arrêté ou site non lié | Démarrer Herd ; le dossier doit être dans le dossier surveillé par Herd |
| Erreur de certificat HTTPS | Site non sécurisé dans Herd | `herd secure logistique-api` ; en dernier recours utiliser `http://` en développement |
| `SQLSTATE[HY000] [1045] Access denied` | Identifiants MySQL | Corriger `DB_USERNAME`/`DB_PASSWORD` dans `.env` (par l'utilisateur), `php artisan config:clear` |
| `could not find driver` | Extension `pdo_mysql` ou `pdo_sqlite` absente | Activer l'extension dans Herd (§3.7) |
| Composer : version de PHP insuffisante | Herd sur PHP < 8.3 | Choisir PHP 8.3+ dans Herd, ouvrir un nouveau terminal |
| `node:sqlite` introuvable (tests) | Node < 22.13 | §3.2 |
| « Ce poste n'est pas encore enregistré » dans l'application | Première connexion faite hors-ligne | Se connecter une fois **en ligne** (le serveur attribue le code du poste) |
| « Reconnexion requise » | Jeton serveur expiré ou révoqué | Menu > Se reconnecter ; les données locales sont conservées |
| Le jeton n'est pas retenu après fermeture | Gestionnaire d'identifiants Windows indisponible | Non bloquant : se reconnecter en ligne ; signaler à l'utilisateur |
| `winget` ne trouve pas un paquet | Identifiant différent | `winget search <nom>` puis éditeur officiel |

---

## 10. Critères de fin (tout doit être vrai)

- [ ] `node --version` ≥ 22.13, `rustc --version` ≥ 1.77, `php -v` ≥ 8.3, MySQL ≥ 8.0.
- [ ] API : `php artisan test` vert, `/api/v1/ping` répond en HTTPS, `/.env` renvoie 404.
- [ ] Client : `npm test` → 42 tests verts ; `npm run tauri dev` ouvre l'application.
- [ ] Connexion administrateur en ligne réussie, mot de passe changé, poste enregistré (code `P01`).
- [ ] Une entrée, une sortie signée et un bon de sortie PDF réalisés ; l'indicateur affiche « Synchronisé ».
- [ ] `gitleaks detect` sans alerte ; aucun secret dans le dépôt.
- [ ] L'utilisateur est informé de l'état de BitLocker.
- [ ] Les sections 7.x sont **préparées mais non exécutées** tant que l'utilisateur n'a pas répondu à H5, H6, H7.
