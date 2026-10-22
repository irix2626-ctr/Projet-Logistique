# Logistique et traçabilité : client desktop (Tauri v2)

Application Windows installable, **utilisable sans connexion** : toutes les écritures vont d'abord dans une base **SQLite locale**, puis sont envoyées au serveur Laravel (`logistique-api`) dès que la connexion revient.

> Ce dossier s'ouvre dans votre IDE. **Herd sert uniquement l'API** (le projet `logistique-api`) : le client ne se charge pas dans Herd, il se lance avec Tauri.

## Prérequis (Windows)

| Outil | Pourquoi |
| --- | --- |
| **Node.js 22.13 ou plus** | Vite, Tauri CLI, tests (`node:sqlite`) |
| **Rust** (via https://rustup.rs) | Compilation du cœur Tauri |
| **Outils de build C++ de Visual Studio** (« Desktop development with C++ ») | Requis par Rust sous Windows (et pour compiler SQLite) |
| **WebView2** | Déjà présent sous Windows 11 ; sinon : runtime Evergreen de Microsoft |

## Démarrer

```bash
npm install            # dépendances (Vite, Tauri CLI, ExcelJS, jsPDF, docx...)
npm test               # 42 tests de la logique locale, de la synchro et de la sécurité (sans Rust)
npm run tauri dev      # lance l'application (1re compilation Rust : plusieurs minutes)
```

### Brancher l'API de Herd

1. Dans le `.env` de `logistique-api`, autorisez l'origine du mode développement, puis `php artisan config:clear` :
   ```
   CORS_ALLOWED_ORIGINS=http://tauri.localhost,https://tauri.localhost,tauri://localhost,http://localhost:1420
   ```
2. Au premier lancement de l'application, l'écran **Configuration du poste** demande l'adresse du serveur : `https://logistique-api.test` (ou `http://…` si vous n'avez pas fait `herd secure`) et le nom du poste. Le bouton « Tester la connexion » vérifie `GET /api/v1/ping`.
3. Connectez-vous avec le compte `admin` créé par `php artisan migrate --seed` (mot de passe affiché une seule fois ; changement obligatoire à la première connexion). **Le premier lancement exige le serveur** : il attribue le code du poste (P01, P02…) qui sert à numéroter les lots hors-ligne.

## Ce que fait l'application

| Page | Contenu |
| --- | --- |
| Connexion | Structure + identifiant + mot de passe ; connexion hors-ligne possible pour un compte déjà connecté en ligne sur ce poste (30 jours maximum) |
| Dashboard | Valeur du stock, cartes par catégorie, état des machines, 100 derniers mouvements ; exports Excel / PDF / Word ; **Exporter et archiver** (admin) |
| Entrées | Création de lots (numéro automatique `LOT-AAAA-Pxx-00001`), pièces jointes libres |
| Stockage | Lots disponibles : Sortir / Modifier / Supprimer (refusé si le lot a des sorties) |
| Sorties | Registre en lecture seule, sortie manuelle, **Bon de sortie PDF signé** |
| Traçabilité | Journal unifié, cycle de vie d'un lot, exports Excel et PDF |
| Historique des exports | Les 20 derniers fichiers, ré-exportables |
| Paramètres (admin) | Comptes, catégories, synchronisation et conflits, réinitialisation protégée par mot de passe |

L'interface reprend **l'identité visuelle de la maquette** (couleurs, polices Bricolage Grotesque et IBM Plex Sans, composants) ; le « bon de livraison » en a été retiré.

## Architecture

```
src-tauri/            Rust : base SQLite (transactions réelles), coffre du jeton, fenêtre
  migrations/         Schéma local, source unique (chargé aussi par les tests Node)
  src/db.rs           db_select / db_execute / db_batch (tout ou rien)
  src/secret.rs       Jeton d'API dans le Gestionnaire d'identifiants Windows
src/
  core/               db (façade), session, secret, formats, UUID
  services/           Logique métier locale (lots, sorties, stock, trace, dashboard),
                      synchro (push / fichiers / pull), auth, exports, API
  ui/ + pages/        Interface (gabarits à échappement automatique)
tests/                Tests Node sur de vraies bases SQLite en mémoire
```

Règles clés (README du projet) appliquées ici : une sortie vise **toujours un lot** et ne peut pas dépasser son reste (contrôle **dans l'INSERT**, donc atomique) ; `pr_sr` et opérateur sont automatiques ; aucun coût unitaire ; suppression **logique** partout ; chaque écriture et son opération de synchro sont dans **une seule transaction**.

## Synchronisation (résumé)

- **Envoi** : opérations dans l'ordre, identifiants uniques (rejeu sans doublon), fusion des modifications en attente, signatures et pièces jointes ensuite avec leur empreinte SHA-256.
- **Réception** : curseur `server_seq`, suppressions incluses ; une modification locale en attente ou refusée n'est jamais écrasée.
- **Conflit de stock** (deux postes sortent la même quantité hors-ligne) : accepté puis signalé à l'administrateur (Paramètres > Synchronisation).
- Le jeton expiré ne supprime rien : « Reconnexion requise » dans le menu, puis la synchro reprend.

## Construire l'installateur

```bash
npm run set-csp -- https://api.votre-domaine.example   # limite la CSP à l'API de production
npm run tauri build                                    # installateur NSIS dans src-tauri/target/release/bundle/nsis
```

Restent pour la phase 10 de la roadmap : mises à jour automatiques signées (Tauri Updater), signature de code de l'installateur, site de téléchargement protégé.

## Sécurité (voir SECURITE.md)

CSP stricte, aucune ressource distante (polices embarquées), permissions Tauri minimales, jeton dans le coffre Windows (jamais dans SQLite), vérificateur de mot de passe hors-ligne salé (PBKDF2), verrouillage après 5 échecs, échappement automatique de tout texte affiché. **Activez BitLocker** sur les postes : la base locale n'est pas chiffrée.

## État de vérification

- ✅ **Testé** (Node, vraies bases SQLite) : règles de stock et de lot, file d'envoi atomique, synchronisation contre un faux serveur, authentification hors-ligne, historique des exports, jeu de données d'export, échappement HTML.
- ⚠️ **Non exécuté** dans l'environnement de rédaction (ni Rust, ni navigateur) : code Rust, interface, bibliothèques d'export. Une relecture des imports a été faite ; la première compilation (`npm run tauri dev`) est la vraie validation. En cas d'erreur, envoyez la sortie du terminal.
