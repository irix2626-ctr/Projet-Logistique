# SECURITE : Application Desktop de Logistique & Traçabilité

> Complément du `README.md` (fonctionnel), de `ROADMAP.md` (planning) et de `openapi.yaml` (contrat d'API).
> Chaque exigence a un **ID** (`SEC-x.y`) et une **priorité** : **P0** = avant tout déploiement, **P1** = avant le pilote, **P2** = avant la v1.0.
> Rien dans ce document n'est facultatif en production ; seul l'ordre change.

---

## 0. Modèle de menaces

**Ce qu'on protège**

| Actif | Pourquoi c'est critique |
| --- | --- |
| Traçabilité des lots (critère n°1) | Falsifier une sortie ou un lot détruit la valeur du système |
| Quantités et coûts | Détournement de matériel, fraude |
| Comptes et jetons | Usurpation d'un `operateur` |
| Signatures et pièces jointes | Preuve de remise du matériel |
| Clé privée de mise à jour | Sa fuite permettrait d'installer un logiciel piégé sur tous les postes |
| Fichier `.env` | Contient tous les secrets du serveur |

**Qui peut attaquer** : un utilisateur interne malveillant ou négligent, quelqu'un qui vole un poste, un attaquant d'Internet (API exposée), un attaquant de la chaîne d'approvisionnement (dépendances, mises à jour).

**Principes**

1. **Moindre privilège** partout (utilisateur, base, permissions Tauri, jetons).
2. **Le client n'est jamais digne de confiance** : le serveur revalide tout et recalcule tout ce qui est dérivé.
3. **Rien ne se supprime physiquement** : imposé aussi par la base, pas seulement par le code.
4. **Tout est tracé** : qui, quoi, quand.
5. **Défense en profondeur** : si une couche tombe, la suivante retient.

---

## 1. Secrets et fichier `.env` (P0)

Le `.env` est le point le plus sensible du serveur : il contient la clé d'application, les accès à la base et les identifiants de services.

| ID | Exigence |
| --- | --- |
| SEC-1.1 | `.env` **jamais** dans Git : `.gitignore` contient `.env`, `.env.*` (sauf `.env.example`), `*.pem`, `*.key`, `*.p12`, `*.pfx`, `storage/*.key` |
| SEC-1.2 | `.env.example` contient **uniquement des valeurs factices** et la liste complète des variables |
| SEC-1.3 | **Un `.env` par environnement** (dev Herd, recette, production) avec des secrets **différents**. Jamais de données de production sur Herd |
| SEC-1.4 | Production : `APP_ENV=production`, **`APP_DEBUG=false`** (sinon les erreurs affichent configuration et secrets), `APP_URL` en `https://` |
| SEC-1.5 | `APP_KEY` générée par `php artisan key:generate`, **sauvegardée hors du serveur** (sa perte rend illisibles les données chiffrées) ; ne jamais la réutiliser entre environnements |
| SEC-1.6 | Appeler `env()` **uniquement dans `config/*.php`** ; en production, `php artisan config:cache` à chaque déploiement (une fois la configuration en cache, `env()` hors config renvoie `null`) |
| SEC-1.7 | Droits du fichier : lisible **seulement** par l'utilisateur qui exécute PHP (`chmod 600`, propriétaire dédié) |
| SEC-1.8 | **Le dossier public du serveur web est `public/`** : `.env`, `.git`, `storage/`, `vendor/` ne doivent jamais être accessibles par URL (test automatisé : `GET /.env` doit renvoyer 404) |
| SEC-1.9 | Pour transporter un `.env` en CI/déploiement : `php artisan env:encrypt` (chiffrement avec une clé conservée à part) ou un gestionnaire de secrets ; jamais par e-mail ou messagerie |
| SEC-1.10 | **Détection de fuite** : `gitleaks` (ou équivalent) en pré-commit et en CI ; en cas de fuite, appliquer la procédure 14 immédiatement |
| SEC-1.11 | **Rotation** : mot de passe de base et jetons de service tous les 6 mois et à chaque départ d'un administrateur |
| SEC-1.12 | Secrets hors du code : aucune clé, mot de passe ou URL privée codés en dur côté Laravel **ni côté Tauri** (le client ne contient aucun secret : tout binaire distribué peut être décompilé) |

**Inventaire des secrets**

| Secret | Où il vit | Sauvegarde |
| --- | --- | --- |
| `APP_KEY`, `DB_PASSWORD`, `.env` complet | Serveur, `chmod 600` | Coffre hors serveur |
| Clé privée de l'updater Tauri | Secret de CI / coffre | **Deux copies** hors dépôt |
| Certificat de signature de code | Coffre / HSM / secret de CI | Selon l'autorité émettrice |
| Mots de passe admin | Gestionnaire de mots de passe | Procédure de reprise |

---

## 2. Authentification et sessions (P0)

| ID | Exigence |
| --- | --- |
| SEC-2.1 | Mots de passe hachés avec **bcrypt ou Argon2id** (jamais MD5/SHA seuls) ; ajuster le coût pour ~250 ms sur le serveur |
| SEC-2.2 | Politique : 10 caractères minimum, refus des mots de passe courants, aucune limite haute absurde ; **changement obligatoire à la première connexion** d'un compte créé par l'admin |
| SEC-2.3 | **Limitation des tentatives de connexion** par couple `identifiant + IP` (ex. 5 par minute), puis blocage temporaire croissant ; limiteur dédié (`RateLimiter::for('login', …)`) |
| SEC-2.4 | Message d'erreur **identique** pour « identifiant inconnu » et « mauvais mot de passe » ; temps de réponse comparable |
| SEC-2.5 | **Jetons Sanctum** : durée de vie explicite à la création, par exemple `createToken($device, [$user->role], now()->addDays(30))` ; en complément, `expiration` dans `config/sanctum.php` |
| SEC-2.6 | **Capacités** (`admin`, `personnel`) contrôlées par les middlewares `abilities` / `ability` (alias enregistrés dans `bootstrap/app.php`) **et** par les Policies |
| SEC-2.7 | **Un jeton par poste et par connexion** ; nom du poste enregistré ; l'admin peut lister et révoquer |
| SEC-2.8 | **Révocation immédiate** : à la déconnexion, au changement de mot de passe, à la suppression ou désactivation du compte (`$user->tokens()->delete()`) |
| SEC-2.9 | Jetons expirés purgés automatiquement (commande de purge Sanctum planifiée) |
| SEC-2.10 | **Pas de réinitialisation de mot de passe par e-mail** : seul l'admin réinitialise (cohérent avec « comptes créés par l'admin ») |
| SEC-2.11 | **Dernier admin protégé** : impossible de supprimer ou rétrograder le dernier compte `admin` |
| SEC-2.12 | Compte admin initial créé par un seeder avec mot de passe **aléatoire affiché une seule fois** ; changement forcé |

### 2.bis Connexion hors-ligne (cas particulier du desktop) : P0

| ID | Exigence |
| --- | --- |
| SEC-2.13 | Après une première connexion en ligne, stocker localement un **vérificateur** du mot de passe : Argon2id/PBKDF2 avec sel unique et coût élevé, **jamais le mot de passe ni un simple SHA** |
| SEC-2.14 | Connexion hors-ligne autorisée **uniquement pour un utilisateur déjà connecté en ligne sur ce poste** |
| SEC-2.15 | **Durée hors-ligne maximale** (proposé : 30 jours) ; au-delà, reconnexion en ligne obligatoire |
| SEC-2.16 | **Verrouillage local** après 5 échecs consécutifs (délai croissant) |
| SEC-2.17 | Le **jeton Sanctum** est stocké dans un coffre sécurisé (Tauri Stronghold ou trousseau Windows ; vérifier l'état du plugin avant de figer le choix), **jamais en clair dans SQLite ni dans le stockage de la WebView** |
| SEC-2.18 | Jeton expiré pendant un séjour hors-ligne : l'**outbox est conservée** ; l'utilisateur se reconnecte, puis la synchronisation reprend. Une expiration ne doit jamais supprimer de données locales |
| SEC-2.19 | Déconnexion volontaire : efface le jeton ; l'outbox et les données restent |

---

## 3. Autorisation (P0)

| ID | Exigence |
| --- | --- |
| SEC-3.1 | **Matrice des droits** écrite et testée : `admin` = comptes, archivage, réinitialisation, conflits, intégrité ; `personnel` = entrées, sorties, consultation, exports |
| SEC-3.2 | **Policy sur chaque ressource** ; aucun contrôleur sans autorisation explicite |
| SEC-3.3 | **IDOR** : un UUID n'est pas un secret ; chaque accès à un lot, une sortie ou un document vérifie le droit, jamais seulement l'existence |
| SEC-3.4 | Réponses `403` pour droit insuffisant, `404` si la ressource n'existe pas ; ne jamais révéler l'existence via le message |
| SEC-3.5 | Opérations destructrices (archivage, réinitialisation) : **mot de passe revérifié côté serveur** même avec un jeton valide |
| SEC-3.6 | Tests automatisés : pour chaque route, un test « personnel » qui doit être refusé quand l'admin est requis |

---

## 4. Sécurité de l'API (P0)

| ID | Exigence |
| --- | --- |
| SEC-4.1 | **HTTPS partout**, redirection HTTP→HTTPS, **HSTS** ; TLS 1.2 minimum |
| SEC-4.2 | **Validation par `FormRequest`** sur chaque route ; jamais `$request->all()` dans un `create` / `update` |
| SEC-4.3 | **Protection contre l'affectation de masse** : `$fillable` explicite sur chaque modèle, jamais `$guarded = []` |
| SEC-4.4 | **Champs imposés par le serveur**, ignorés s'ils viennent du client : `operateur_id`, `pr_sr`, `date_entree`, `date_sortie`, `quantite_restante`, `valeur_restante`, `structure_id` (sauf cas de synchro, voir 6), `deleted_at`, `archive_batch_id`, `server_seq` |
| SEC-4.5 | **Injection SQL** : uniquement Eloquent ou requêtes paramétrées ; les colonnes de tri et de filtre viennent d'une **liste blanche** |
| SEC-4.6 | **Limitation de débit** par groupe de routes (exemples de départ : login 5/min, lecture 120/min, écriture 60/min, synchro 30/min, envoi de fichiers 20/min), clé = utilisateur sinon IP |
| SEC-4.7 | **CORS strict** : seule l'origine de la WebView Tauri est autorisée (sous Windows : `http://tauri.localhost`, à vérifier au premier build), jamais `*` |
| SEC-4.8 | **Jamais de secret dans l'URL** (jeton, mot de passe) ; les curseurs de pagination ne contiennent aucune donnée sensible |
| SEC-4.9 | Erreurs JSON génériques en production : **aucune trace de pile**, aucun nom de table ni chemin de serveur |
| SEC-4.10 | Taille maximale du corps de requête, nombre maximal d'opérations par lot de synchro (500, voir contrat), pagination bornée à 100 |
| SEC-4.11 | En-têtes de sécurité : `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` sur les réponses authentifiées |
| SEC-4.12 | **`X-Client-Version`** vérifié ; clients trop anciens refusés (426) pour forcer la mise à jour |
| SEC-4.13 | Routes de diagnostic (`/telescope`, `/horizon`, `/_debugbar`, `/ping` détaillé) **absentes ou protégées** en production |
| SEC-4.14 | **Règles métier appliquées côté serveur dans des transactions** : verrou sur le lot (`lockForUpdate`) avant toute sortie, quantité jamais supérieure au reste en ligne |

---

## 5. Base de données MySQL (P0)

| ID | Exigence |
| --- | --- |
| SEC-5.1 | **Utilisateur applicatif dédié, sans droit `DROP`, `ALTER`, `CREATE`** ; un autre compte, utilisé seulement pour les migrations |
| SEC-5.2 | **Aucun droit `DELETE` sur les tables métier** (`lots`, `sorties`, `documents`, `materiels`, `users`, `audit_logs`) : « rien n'est jamais supprimé physiquement » devient une garantie de la base. Le droit `DELETE` reste accordé aux tables techniques (jetons, cache, files) |
| SEC-5.3 | **Table `audit_logs` en ajout seul** (`INSERT` et `SELECT` uniquement, pas d'`UPDATE`) |
| SEC-5.4 | MySQL **non exposé à Internet** : écoute sur `127.0.0.1` ou réseau privé ; pare-feu ; si le serveur de base est distant, **TLS vers la base** |
| SEC-5.5 | Contraintes d'intégrité en base (clés étrangères, `NOT NULL` sur `sorties.lot_id`, `CHECK quantite > 0`), pas seulement dans le code |
| SEC-5.6 | Pas de compte `root` utilisé par l'application, pas de mot de passe vide, comptes anonymes supprimés |
| SEC-5.7 | **Sauvegardes** : voir section 11 |

---

## 6. Synchronisation (P0)

La synchro est la surface d'attaque la plus subtile : le client envoie des données **fabriquées hors-ligne**.

| ID | Exigence |
| --- | --- |
| SEC-6.1 | Chaque opération est validée **comme une requête normale** (mêmes `FormRequest`, mêmes règles) ; la synchro n'est jamais une porte dérobée |
| SEC-6.2 | **Liste blanche de tables et de champs** par opération ; une opération sur une table inconnue est rejetée |
| SEC-6.3 | Le serveur **recalcule** `quantite_restante`, valeurs et totaux ; il ignore toute valeur dérivée envoyée |
| SEC-6.4 | **`operateur_id` dans la synchro** : plusieurs utilisateurs peuvent travailler sur le même poste hors-ligne, donc l'opérateur voyage dans l'opération. Le serveur l'accepte **uniquement si** l'utilisateur existe, est actif, et s'est déjà authentifié en ligne sur ce `device_id` (même règle que SEC-2.14). Sinon l'opération est rejetée et consignée |
| SEC-6.5 | `pr_sr` revalidé : doit correspondre à la structure de l'opérateur de l'opération |
| SEC-6.6 | **Horodatage client non fiable** : sert à l'ordre local ; l'ordre officiel est `server_seq`. Une date manifestement absurde (futur lointain) est signalée |
| SEC-6.7 | **Idempotence** (`op_id`, UUID) pour que le rejeu d'une requête interceptée ou répétée soit sans effet |
| SEC-6.8 | **Postes enregistrés** (`devices`) : une synchro depuis un poste inconnu ou révoqué est refusée |
| SEC-6.9 | Les conflits (dépassement de stock, lot archivé, modification concurrente) sont **signalés, jamais ignorés en silence** |
| SEC-6.10 | Transfert des fichiers : empreinte **SHA-256** comparée à la réception ; fichier refusé si elle diffère |

---

## 7. Fichiers et pièces jointes (P0)

| ID | Exigence |
| --- | --- |
| SEC-7.1 | **Liste blanche de types** (PDF, JPG, PNG) vérifiée sur le **contenu réel** du fichier, pas sur l'extension |
| SEC-7.2 | **Taille maximale** par fichier et par enregistrement (ex. 10 Mo) ; quota par lot |
| SEC-7.3 | **Nom aléatoire** (UUID) à l'enregistrement ; le nom d'origine est stocké en base seulement |
| SEC-7.4 | Stockage **hors du dossier public** ; téléchargement uniquement par une route authentifiée et autorisée |
| SEC-7.5 | En-têtes de téléchargement : `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` |
| SEC-7.6 | Signatures : accepter **uniquement du PNG valide** de dimensions bornées |
| SEC-7.7 | Protection contre la traversée de chemin (`../`) : aucun chemin construit à partir d'une entrée client |
| SEC-7.8 | P2 : analyse antivirus des fichiers déposés (ClamAV) si le volume le justifie |

---

## 8. Client desktop Tauri (P0/P1)

| ID | Exigence |
| --- | --- |
| SEC-8.1 | **CSP stricte** dans `tauri.conf.json` : `default-src 'self'`, `connect-src` limité à `ipc:` et **l'URL exacte de l'API** ; pas de `unsafe-eval` ; **aucun CDN** |
| SEC-8.2 | **Tout est embarqué dans l'application** (Bootstrap, Lucide, polices) : la maquette charge Google Fonts en ligne, ce qui est interdit en production (l'application doit fonctionner hors-ligne et sans fuite de requêtes) |
| SEC-8.3 | **Permissions minimales** (`capabilities/default.json`) : seulement ce qui est utilisé (`sql:default`, `sql:allow-execute`, mises à jour, dialogues d'enregistrement). **Aucune** permission large sur le système de fichiers, aucune permission `shell` |
| SEC-8.4 | **Protocole d'assets** : désactivé, ou limité à un dossier précis ; jamais `**/*` |
| SEC-8.5 | `dangerousInsecureTransportProtocol` **interdit en production** (réservé au développement sur Herd) |
| SEC-8.6 | Outils de développement désactivés dans les builds de production |
| SEC-8.7 | **Anti-XSS** : jamais de `innerHTML` avec des données d'utilisateur ; échapper ou utiliser `textContent` (désignations, noms de bénéficiaires, fournisseurs sont du texte libre) |
| SEC-8.8 | Dépendances JS **figées par fichier de verrouillage** ; versions fixes ; pas de scripts distants |
| SEC-8.9 | **Aucun secret** dans le code client ; l'URL de l'API est la seule configuration |
| SEC-8.10 | Journaux locaux sans mots de passe, jetons ni signatures |

### 8.bis Données locales (SQLite) : P1

| ID | Exigence |
| --- | --- |
| SEC-8.11 | La base SQLite locale contient les données métier **non chiffrées** (le plugin SQL n'apporte pas de chiffrement intégré à ma connaissance, à vérifier). Mesure retenue : **chiffrement du disque (BitLocker)** obligatoire sur les postes, compte Windows protégé par mot de passe |
| SEC-8.12 | Fichier de base placé dans le dossier de données de l'application, droits limités à l'utilisateur Windows |
| SEC-8.13 | **Poste volé ou perdu** : l'admin désactive le compte et révoque les jetons du poste (SEC-2.8) ; risque résiduel sur les données locales atténué par BitLocker |
| SEC-8.14 | Aucun mot de passe, aucun jeton dans SQLite (seulement le vérificateur salé, SEC-2.13) |

---

## 9. Mises à jour et chaîne d'approvisionnement (P0 pour 9.1 à 9.5)

| ID | Exigence |
| --- | --- |
| SEC-9.1 | Clés générées par `tauri signer generate` ; la **clé publique** (contenu, pas un chemin) va dans `plugins.updater.pubkey` ; la vérification de signature **ne peut pas être désactivée** |
| SEC-9.2 | **Clé privée** : jamais dans le dépôt, jamais sur un poste de développeur non protégé ; stockée dans le coffre de CI ; **deux sauvegardes** (sa perte bloque toutes les mises à jour, sa fuite permet d'installer un logiciel piégé) |
| SEC-9.3 | `plugins.updater.endpoints` en **HTTPS** ; TLS imposé en production |
| SEC-9.4 | **Signature de code** de l'installateur Windows (certificat) ; certificat protégé comme une clé privée |
| SEC-9.5 | **Site de téléchargement protégé par connexion** ; l'installateur n'est jamais publié sur un lien public |
| SEC-9.6 | Publication par un **pipeline reproductible** depuis une branche protégée (revue obligatoire) ; personne ne publie depuis son poste |
| SEC-9.7 | `composer audit`, `npm audit`, `cargo audit` **en CI**, échec du pipeline sur vulnérabilité critique ; mises à jour de dépendances suivies (Dependabot ou équivalent) |
| SEC-9.8 | Dépendances limitées au strict nécessaire ; chaque ajout est justifié |
| SEC-9.9 | Plan de **retour arrière** : conserver la version précédente de l'installateur et du serveur |
| SEC-9.10 | **Serveur d'abord**, client ensuite : l'API reste rétro-compatible le temps de la migration |

---

## 10. Journalisation, audit et supervision (P1)

| ID | Exigence |
| --- | --- |
| SEC-10.1 | **Table `audit_logs`** (qui, quoi, quand, poste, IP, avant/après) pour : connexions réussies et échouées, création/modification/suppression de compte, modification de lot, archivage, réinitialisation, résolution de conflit, révocation de jeton |
| SEC-10.2 | Les journaux **ne contiennent jamais** de mot de passe, de jeton, ni de contenu de signature |
| SEC-10.3 | `operateur` enregistré sur **chaque écriture métier** (déjà exigé), jamais modifiable |
| SEC-10.4 | Journaux applicatifs avec **rotation** et conservation définie (ex. 12 mois) ; stockage protégé |
| SEC-10.5 | **Alertes** : 10 échecs de connexion en 5 minutes, tout archivage ou toute réinitialisation, conflit de stock, échec de sauvegarde, erreur 5xx répétée |
| SEC-10.6 | Horloge du serveur synchronisée (NTP) |
| SEC-10.7 | Le **contrôle d'intégrité** (`/admin/integrite`) est exécuté chaque nuit ; toute anomalie déclenche une alerte |

---

## 11. Sauvegarde et continuité (P0 pour 11.1 à 11.3)

| ID | Exigence |
| --- | --- |
| SEC-11.1 | **Sauvegarde MySQL quotidienne** + hebdomadaire conservée, **chiffrée**, copie **hors du serveur** |
| SEC-11.2 | Sauvegarde des fichiers (`storage/app` : pièces jointes et signatures) avec la même politique |
| SEC-11.3 | **Test de restauration documenté**, répété chaque trimestre (une sauvegarde jamais restaurée n'existe pas) |
| SEC-11.4 | Objectifs à fixer : perte de données maximale acceptée (RPO, ex. 24 h) et délai de remise en service (RTO, ex. 4 h) |
| SEC-11.5 | **Sauvegarde des secrets** : `APP_KEY`, clé privée de l'updater, certificat (voir inventaire section 1) |
| SEC-11.6 | **Serveur détruit** : les postes détiennent leurs données locales et leur outbox ; procédure de restauration puis resynchronisation décrite dans le guide admin |
| SEC-11.7 | Sauvegarde stockée sur un support **non accessible en écriture** par le serveur applicatif (protection contre un rançongiciel) |

---

## 12. Hébergement et infrastructure : VPS retenu (P0)

| ID | Exigence |
| --- | --- |
| SEC-12.1 | Accès au serveur par **clé SSH uniquement** (mot de passe désactivé, `root` interdit), pare-feu n'ouvrant que 80/443 (et SSH restreint) |
| SEC-12.2 | **Mises à jour de sécurité** du système et de PHP appliquées régulièrement ; **PHP 8.3 ou plus** (exigé par Laravel 13) |
| SEC-12.3 | PHP : `display_errors=Off`, fonctions dangereuses désactivées si possible ; PHP-FPM sous un **utilisateur dédié** |
| SEC-12.4 | Permissions : seuls `storage/` et `bootstrap/cache/` sont inscriptibles par PHP ; le code est en lecture seule |
| SEC-12.5 | **Herd = développement uniquement** : ne jamais exposer un `herd share` avec des données réelles, ne jamais utiliser Herd comme serveur de production |
| SEC-12.6 | Certificat TLS valide et **renouvellement automatique** ; surveillance de l'expiration (un certificat expiré bloque l'API et l'updater) |
| SEC-12.7 | Si Docker est retenu plus tard : images officielles à jour, conteneur non `root`, secrets injectés à l'exécution et non dans l'image |
| SEC-12.9 | **VPS** : utilisateur de déploiement **non root** avec `sudo` limité ; `fail2ban` (ou équivalent) sur SSH ; mises à jour de sécurité automatiques ; snapshots de l'hébergeur **en plus** des sauvegardes MySQL (SEC-11) |
| SEC-12.10 | Nom de domaine dédié, DNS protégé (double authentification chez le registrar) ; MySQL et PHP-FPM écoutent en local seulement |
| SEC-12.8 | Anti-DDoS de base / limitation côté serveur web ou fournisseur ; pas d'interface d'administration du serveur ouverte sur Internet |

---

## 13. Données personnelles (P1)

L'application stocke des **noms, contacts et signatures de bénéficiaires** : ce sont des données personnelles.

| ID | Exigence |
| --- | --- |
| SEC-13.1 | **Minimisation** : ne collecter que nom, contact, fonction et signature nécessaires à la preuve de remise |
| SEC-13.2 | Accès limité aux personnes habilitées (matrice SEC-3.1) ; signature visible seulement dans le bon de sortie et le détail de la sortie |
| SEC-13.3 | **Durée de conservation** définie (le soft delete conserve tout : décider combien de temps puis comment archiver durablement) |
| SEC-13.4 | Exports Excel/PDF : ils contiennent ces données ; sensibiliser les utilisateurs (stockage et partage des fichiers exportés) |
| SEC-13.5 | Vérifier avec le responsable juridique les obligations locales de protection des données (en Côte d'Ivoire, la loi de 2013 et l'autorité de régulation ARTCI : à valider par un juriste) |

---

## 14. Réponse aux incidents (P1)

| Incident | Actions immédiates | Ensuite |
| --- | --- | --- |
| **Poste volé / perdu** | Désactiver le compte, révoquer les jetons du poste, marquer le poste révoqué | Évaluer l'exposition (BitLocker actif ?), vérifier les opérations récentes |
| **Jeton compromis** | Révoquer le jeton, forcer le changement du mot de passe | Relire `audit_logs` de la période |
| **`.env` ou secret exposé** | Changer `DB_PASSWORD` et tous les secrets de service ; **révoquer tous les jetons** ; si `APP_KEY` exposée, planifier son remplacement (les sessions et valeurs chiffrées en dépendent, prévoir la migration) | Retirer le secret de l'historique Git, enquête |
| **Clé privée de l'updater exposée** | Incident **critique** : cesser toute publication, informer ; comme la clé publique est intégrée aux postes installés, une nouvelle clé exige une réinstallation manuelle | Rotation, nouvelle distribution contrôlée |
| **Rançongiciel / serveur détruit** | Isoler, restaurer la dernière sauvegarde saine (SEC-11) | Resynchronisation des postes, analyse |
| **Anomalie de traçabilité** | Contrôle d'intégrité, comparer avec les journaux d'audit | Corriger par une opération tracée, jamais par suppression |
| **Conflit de stock massif** | Geler les sorties du lot concerné, traiter via `/admin/conflits` | Corriger la cause (poste hors-ligne trop longtemps ?) |

Un **registre d'incidents** (date, description, cause, correction) est tenu par l'admin.

---

## 15. Correspondance avec l'OWASP API Security Top 10

| Risque OWASP | Couvert par |
| --- | --- |
| Autorisation défaillante au niveau objet (IDOR) | SEC-3.2, 3.3, 3.6 |
| Authentification défaillante | SEC-2.x, 2.bis |
| Autorisation au niveau propriété | SEC-4.3, 4.4 |
| Consommation de ressources non maîtrisée | SEC-4.6, 4.10, 7.2 |
| Autorisation au niveau fonction | SEC-3.1, 2.6 |
| Accès à des flux métier sensibles | SEC-3.5, 6.x (sorties, archivage) |
| Mauvaise configuration de sécurité | SEC-1.x, 4.9, 4.13, 12.x |
| Gestion d'inventaire inadéquate | SEC-4.12, 4.13 (versions et routes) |
| Consommation non sûre d'API tierces | SEC-9.7, 9.8 |

---

## 16. Tests de sécurité (P1)

| ID | Test | Quand |
| --- | --- | --- |
| SEC-16.1 | Matrice d'autorisation : chaque route × chaque rôle (Pest/PHPUnit) | CI, à chaque commit |
| SEC-16.2 | IDOR : accès à une ressource d'un autre contexte | CI |
| SEC-16.3 | Affectation de masse : envoyer `operateur_id`, `pr_sr`, `quantite_restante` dans les corps, vérifier qu'ils sont ignorés | CI |
| SEC-16.4 | Limitation de débit : le 6e login en une minute est refusé | CI |
| SEC-16.5 | Fichiers : exécutable renommé `.pdf`, fichier surdimensionné, nom piégé `../` | CI |
| SEC-16.6 | Exposition : `GET /.env`, `/.git/config`, `/storage/...` renvoient 404 | Déploiement |
| SEC-16.7 | Synchro : opération falsifiée (opérateur inconnu, table inconnue, quantité dérivée), rejeu, poste révoqué | CI |
| SEC-16.8 | Jetons : expiré, révoqué, mauvaise capacité | CI |
| SEC-16.9 | Analyse statique (Larastan/PHPStan niveau élevé), `composer/npm/cargo audit`, `gitleaks` | CI |
| SEC-16.10 | Scan dynamique de l'API (OWASP ZAP, à partir de `openapi.yaml`) sur l'environnement de recette | Avant le pilote |
| SEC-16.11 | **Test d'intrusion** par une personne extérieure au développement | Avant la v1.0 |

---

## 17. Plan par phase de la roadmap

| Phase ROADMAP | Exigences de sécurité à livrer |
| --- | --- |
| 0 Cadrage | SEC-1.1 à 1.3, 12.5 ; décision D4 ; gitleaks en pré-commit |
| 1 Socle serveur | SEC-1.4 à 1.8, 4.1, 4.2, 4.6, 4.7, 4.9, 4.11 ; CORS ; limiteurs |
| 2 Modèle de données | SEC-5.1 à 5.5 ; table `audit_logs` ; `$fillable` |
| 3 Authentification | SEC-2.x complet, 2.bis, 3.x ; audit des connexions |
| 4 Cœur métier | SEC-4.4, 4.14, 7.x ; tests 16.1 à 16.5 |
| 5 Traçabilité | SEC-10.7 (contrôle d'intégrité nocturne) |
| 6 Synchronisation | SEC-6.x complet ; test 16.7 |
| 7 Archivage | SEC-3.5, 10.1, 10.5 ; double confirmation |
| 8 Durcissement | Passage en revue de tout ce document, SEC-8.x, 13.x |
| 9 Recette | SEC-16.x complet, 16.10 |
| 10 Distribution | SEC-9.x complet, 12.6 |
| 11 Production | SEC-11.x (test de restauration), 12.x, 14 (procédures), 16.11 |

---

## 18. Liste de contrôle « go-live » (tout doit être coché)

- [ ] `APP_DEBUG=false`, `APP_ENV=production`, `config:cache` exécuté
- [ ] `.env` introuvable par URL, droits `600`, hors dépôt, sauvegardé
- [ ] HTTPS valide, HSTS actif, renouvellement du certificat automatique
- [ ] Utilisateur MySQL sans `DROP/ALTER/DELETE` sur les tables métier
- [ ] MySQL inaccessible depuis Internet
- [ ] Limiteurs de débit actifs, CORS limité à la WebView
- [ ] Matrice d'autorisation testée (CI verte)
- [ ] Jetons à durée limitée, révocation testée
- [ ] Connexion hors-ligne : vérificateur salé, durée maximale, verrouillage
- [ ] CSP stricte, permissions Tauri minimales, aucun CDN
- [ ] BitLocker activé sur tous les postes
- [ ] Clé privée de l'updater sauvegardée en deux endroits, absente du dépôt
- [ ] Installateur signé (code) et téléchargeable seulement après connexion
- [ ] Sauvegarde automatique **et restauration testée**
- [ ] Journal d'audit actif, alertes configurées
- [ ] Contrôle d'intégrité : **0 anomalie**
- [ ] Scan ZAP et test d'intrusion traités
- [ ] Procédures d'incident (section 14) et guide admin remis

---

## 19. Risques résiduels acceptés

| Risque | Pourquoi accepté | Atténuation |
| --- | --- | --- |
| Données locales lisibles par quelqu'un ayant le disque déchiffré et la session ouverte | Inhérent à une application hors-ligne | BitLocker, verrouillage de session Windows, révocation à distance |
| Administrateur malveillant | Il a les pleins pouvoirs métier | Journal d'audit en ajout seul, droits de base sans `DELETE`, deux admins minimum |
| Opération hors-ligne falsifiée avant synchro | Le serveur ne peut la juger qu'à la réception | Validation complète (section 6), conflits signalés, contrôle d'intégrité |
