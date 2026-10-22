# ROADMAP : Application Desktop de Logistique & Traçabilité

> Complément du `README.md` (référence fonctionnelle). Cette roadmap est **100 % orientée back-end** : API Laravel, base MySQL, base locale SQLite, synchronisation, sécurité, distribution.
> L'interface (maquette HTML) est **hors périmètre** : elle sera refaite. Seuls les contrats d'API et les règles métier comptent ici.
> Durées indicatives en **sprints d'une semaine** pour 1 à 2 développeurs.

---

## 0. Lecture de la roadmap

**Règles pour qu'il n'y ait aucun point mort**

1. Deux pistes avancent en parallèle : **Piste A = Laravel / MySQL (serveur)**, **Piste B = Tauri / SQLite (client)**. Chaque phase indique ce que chacune livre.
2. Le **contrat d'API** (OpenAPI, phase 1) est figé en premier : la piste B travaille sur des données simulées pendant que A construit.
3. Chaque tâche a un **ID** (ex. `A3.2`) utilisable dans les tickets et les prompts de l'IDE.
4. Une phase est terminée seulement si sa **Definition of Done** est remplie.

**Definition of Done (toute tâche)** : code + migration + test automatisé + règle métier respectée + `operateur` et soft delete vérifiés + documentation OpenAPI à jour.

### Vue d'ensemble

| Phase | Titre | Sprints | Jalon |
| --- | --- | --- | --- |
| 0 | Cadrage & environnement | S1 | |
| 1 | Socle serveur & contrat d'API | S1-S2 | |
| 2 | Modèle de données (MySQL + SQLite) | S2-S3 | |
| 3 | Authentification & comptes | S3-S4 | **M1** : connexion fonctionnelle |
| 4 | Cœur métier : lots, stock, sorties | S4-S6 | **M2** : cycle entrée → stock → sortie |
| 5 | Traçabilité & Dashboard (requêtes) | S6-S7 | |
| 6 | Synchronisation hors-ligne | S7-S10 | **M3** : 2 postes synchronisés |
| 7 | Export, archivage, réinitialisation | S10-S11 | **M4** : cycle d'archivage complet |
| 8 | Sécurité & durcissement | S11-S12 | |
| 9 | Tests, performance, recette | S12-S13 | |
| 10 | Distribution & mises à jour | S13-S14 | **M5** : v0.1 installable |
| 11 | Pilote & mise en production | S14-S16 | **M6** : v1.0 |

Les phases 8 et 9 démarrent **dès la phase 3** pour les tests et la sécurité de base ; leurs dernières tâches ferment simplement le chantier.

### Graphe de dépendances

```
0 → 1 → 2 → 3 → 4 → 5 ─┐
              │         ├→ 7 → 10 → 11
              └→ 6 ─────┘
8 et 9 : en continu, clôture après 7
```

---

## Phase 0 : Cadrage & environnement (S1)

**Objectif** : tout est installé, les décisions bloquantes sont prises.

| ID | Tâche | Piste |
| --- | --- | --- |
| 0.1 | Installer **Laravel Herd** (PHP, serveur local `.test`), MySQL 8 local (service Herd ou équivalent) | A |
| 0.2 | Créer le dépôt (monorepo : `/api` Laravel, `/desktop` Tauri, `/docs`) + conventions Git + CI de base | A+B |
| 0.3 | Installer Rust, Node, Tauri v2 CLI ; vérifier le build Windows | B |
| 0.4 | Installer **Laravel 13** (PHP 8.3 minimum) et sélectionner PHP 8.3 ou plus dans Herd | A |
| 0.5 | **Hébergement de production : VPS (décidé).** Choisir le fournisseur, la taille (2 vCPU / 2-4 Go de RAM pour démarrer, à ajuster), le nom de domaine et l'option de sauvegarde de l'hébergeur | A |
| 0.6 | Trancher les décisions ouvertes de la section 12 de cette roadmap | A+B |

**Note Herd**

- Herd est un **environnement de développement local** : il sert l'API en `https://nom.test` (HTTPS local via `herd secure`) et permet de partager temporairement le site (`herd share`) pour tester depuis un autre poste.
- Il ne remplace pas un serveur de production : le multi-postes exige un serveur **joignable en permanence**, en **HTTPS**, avec **sauvegardes** (l'updater Tauri impose TLS en production).
- Pendant le développement, l'API tourne sur Herd ; en production, elle tourne sur un **VPS** (décision D4).
- À vérifier : la WebView de Tauri doit faire confiance au certificat local de Herd ; sinon utiliser `herd share` ou, en dev uniquement, `dangerousInsecureTransportProtocol`.

**DoD** : `https://logistique-api.test` répond, `tauri dev` ouvre une fenêtre, décisions 0.4 à 0.6 consignées.

---

## Phase 1 : Socle serveur & contrat d'API (S1-S2)

**Objectif** : une API vide mais structurée, documentée, sécurisée par défaut.

| ID | Tâche | Piste |
| --- | --- | --- |
| A1.1 | Projet Laravel, `.env`, connexion MySQL, fuseau horaire et locale `fr` | A |
| A1.2 | Installer **Sanctum** (jetons API), publier migrations | A |
| A1.3 | API versionnée `/api/v1`, réponses JSON uniformes (succès/erreur, codes HTTP, format d'erreurs de validation) | A |
| A1.4 | **CORS** pour la WebView Tauri, limitation de débit (`throttle`) globale | A |
| A1.5 | Architecture en couches : `FormRequest` → `Controller` → `Service` → `Model` ; services métier : `LotService`, `SortieService`, `StockService`, `SyncService`, `ArchiveService` | A |
| A1.6 | Rédiger le **contrat OpenAPI** de toutes les routes (section 11) avant implémentation | A |
| A1.7 | Trait commun `operateur` (rempli depuis l'utilisateur authentifié) | A |
| B1.1 | Plugin SQL : `tauri add sql`, `cargo add tauri-plugin-sql --features sqlite`, `npm i @tauri-apps/plugin-sql` | B |
| B1.2 | Autoriser le plugin dans `capabilities/default.json` (`sql:default`, `sql:allow-execute`) | B |
| B1.3 | Couche d'accès aux données côté client (repositories) sur `Database.load('sqlite:logistique.db')` | B |
| B1.4 | Client HTTP avec jeton Bearer, détection en ligne / hors-ligne | B |

**DoD** : la route `/api/v1/ping` répond, la doc OpenAPI est générée, le client Tauri lit et écrit dans SQLite.

---

## Phase 2 : Modèle de données (S2-S3)

**Objectif** : schéma identique MySQL / SQLite, avec les règles d'intégrité.

### Tâches

| ID | Tâche | Piste |
| --- | --- | --- |
| A2.1 | Migrations MySQL : `structures`, `users`, `categories`, `materiels`, `lots`, `sorties`, `documents`, `historique_exports`, `devices`, `sync_conflicts` | A |
| A2.2 | **UUID** sur toutes les tables : l'identifiant est **fourni par le client** (créé hors-ligne), le serveur l'accepte et vérifie le format. Dans Eloquent, désactiver l'auto-incrément et accepter l'`id` entrant ; le trait `HasUuids` ne génère l'UUID que s'il est absent | A |
| A2.3 | `SoftDeletes` (`deleted_at`) sur tous les modèles ; `sync_status` côté client uniquement | A |
| A2.4 | Contraintes : clé étrangère `sorties.lot_id` **NOT NULL**, `quantite > 0`, `quantite_initiale > 0`, `cout_total >= 0`, index sur `lot_id`, `date_sortie`, `numero_lot`, `deleted_at`, `structure_id` | A |
| A2.5 | Seeders : 5 structures (PNLP, PNLT, PNLS, UCP-FM, Service central), catégories avec icône et couleur pastel, compte admin initial | A |
| A2.6 | **Vue / requête** `quantite_restante` = `quantite_initiale` − Σ sorties du lot. Jamais une colonne saisie | A |
| A2.7 | Génération de `numero_lot` au format `LOT-AAAA-Pxx-00001` (`Pxx` = code du poste, compteur par poste et par année, unique sans réseau) | A |
| B2.1 | Migrations SQLite équivalentes via `add_migrations("sqlite:logistique.db", …)` ; elles s'appliquent au premier `Database.load` | B |
| B2.2 | Tables locales supplémentaires : `sync_outbox`, `sync_state` (curseur de synchro), `session_locale` | B |
| B2.3 | **Test de parité** : même schéma logique des deux côtés (script qui compare colonnes et types) | A+B |

### Ajouts proposés au modèle (à valider, voir D2)

Le README les impose implicitement sans les nommer :

| Ajout | Raison |
| --- | --- |
| `lot.lot_origine_id` | Le report du stock restant « conserve la référence au lot d'origine » (README §6) : il faut une colonne pour la porter |
| `archive_batch_id` (sur lots, sorties, documents) | Regrouper ce qui a été archivé lors d'un export ou d'une réinitialisation, pour l'audit |
| `version` (entier, sur lots et utilisateurs) | Détecter les modifications concurrentes lors de la synchronisation |
| `server_seq` (entier croissant, côté serveur) | Curseur fiable de récupération (`pull`), indépendant des horloges des postes |
| Table `devices` (id, nom, code_poste, dernière synchro) | Identifier chaque poste, utile aux numéros de lot et au diagnostic |

**DoD** : migrations rejouables sur base vide (MySQL et SQLite), seeders OK, test de parité vert.

---

## Phase 3 : Authentification & comptes (S3-S4) : **Jalon M1**

**Objectif** : connexion par structure, comptes gérés par l'admin, y compris hors-ligne.

| ID | Tâche | Piste |
| --- | --- | --- |
| A3.1 | `POST /auth/login` : `structure_id` + identifiant/email + mot de passe + `device_name` → jeton Sanctum (le nom d'appareil est informatif) | A |
| A3.2 | Jetons avec **capacités** (`admin`, `personnel`) vérifiées par `tokenCan` ; rôle appliqué par **Policies** | A |
| A3.3 | `POST /auth/logout` (révocation du jeton), `GET /auth/me` | A |
| A3.4 | Comptes (admin seulement) : créer, modifier, supprimer (soft delete) ; structure = celle de l'admin connecté ; rôle par défaut `personnel` ; **pas d'inscription libre** | A |
| A3.5 | Mot de passe haché (bcrypt/argon2), règle de complexité, limitation des tentatives de connexion | A |
| A3.6 | Compte supprimé ou désactivé : son jeton est révoqué à la prochaine synchro | A |
| B3.1 | Stockage du jeton dans un **coffre sécurisé du système** (pas en clair dans SQLite) | B |
| B3.2 | **Connexion hors-ligne** : après une première connexion réussie, conserver un **condensé du mot de passe** (haché avec sel) dans SQLite pour valider l'identité sans réseau | B |
| B3.3 | Session locale : id, structure, nom de l'utilisateur ; injectés automatiquement comme `operateur` et `pr_sr` | B |
| B3.4 | Premier lancement : connexion **obligatoirement en ligne** (amorçage des données) | B |

**DoD** : un admin crée un compte, ce compte se connecte en ligne puis hors-ligne ; un `personnel` reçoit un 403 sur les routes admin.

---

## Phase 4 : Cœur métier : lots, stock, sorties (S4-S6) : **Jalon M2**

**Objectif** : le cycle complet **entrée → lot → stock → sortie** respecte 100 % des règles.

### 4.1 Référentiels et pièces jointes

| ID | Tâche |
| --- | --- |
| A4.1 | CRUD `categories` et `materiels` (catalogue), recherche par désignation |
| A4.2 | `documents` : envoi de fichiers (PDF, images), validation du type et de la taille, rattachement polymorphe (`lot` ou `sortie`), stockage Laravel Storage. **Aucun type « bon de livraison »** |
| A4.3 | Signature du bénéficiaire : image enregistrée en fichier, chemin dans `sortie.signature_path` |

### 4.2 Entrées (création de lots)

| ID | Tâche |
| --- | --- |
| A4.4 | `POST /lots` : crée le lot, génère `numero_lot`, fixe `operateur_id` et `date_entree` automatiquement, **le lot est immédiatement disponible** |
| A4.5 | Validation : désignation, catégorie, quantité > 0, coût total ≥ 0 ; champs fiche technique facultatifs sauf règles métier confirmées |
| A4.6 | Champs `usage` (usage prévu) et `etat_fonctionnement` enregistrés sur le lot |
| A4.7 | Liste paginée (**100 par page**, pagination par curseur), recherche et filtres : période, catégorie, fournisseur, état, structure |

### 4.3 Stockage

| ID | Tâche |
| --- | --- |
| A4.8 | `GET /stock` : lots avec `quantite_restante > 0`, calculée, jamais lue d'une colonne saisie |
| A4.9 | `PUT /lots/{id}` : correction de saisie ; **refuser** une `quantite_initiale` inférieure à la quantité déjà sortie |
| A4.10 | `DELETE /lots/{id}` : soft delete, **refusé si le lot a des sorties** (code 409 avec message explicite) |
| A4.11 | Valeur du lot = `cout_total × quantite_restante / quantite_initiale`, **calculée à la demande** |

### 4.4 Sorties

| ID | Tâche |
| --- | --- |
| A4.12 | `GET /lots/suggestion?materiel=…` : renvoie le lot **le plus ancien disponible** (FIFO) ; l'utilisateur peut en choisir un autre |
| A4.13 | `POST /sorties` : `lot_id` **obligatoire**, `quantite ≤ quantite_restante`, bénéficiaire (nom, contact, fonction), `usage`, `etat_fonctionnement`, description facultative, signature |
| A4.14 | `pr_sr` renseigné **automatiquement** avec la structure de l'utilisateur connecté, non modifiable par le client |
| A4.15 | **Concurrence** : dans une transaction, verrouiller la ligne du lot (`lockForUpdate`), recalculer le reste, puis insérer. Deux sorties simultanées ne peuvent pas dépasser le stock |
| A4.16 | Sorties **en lecture seule** : aucune route PUT/DELETE ; toute tentative renvoie 405 |
| A4.17 | Données du **Bon de Sortie** (fiche technique, numéro de lot, PR/SR, bénéficiaire, opérateur, signature) exposées par `GET /sorties/{id}/bon` ; le PDF est généré côté client |

### 4.5 Règles métier à tester (liste de contrôle)

- [ ] Une sortie sans lot est impossible.
- [ ] Une sortie supérieure au reste est refusée.
- [ ] `quantite_restante` ne descend jamais sous 0 sur le serveur.
- [ ] Un lot avec sorties ne peut pas être supprimé.
- [ ] La quantité initiale ne peut pas passer sous le total déjà sorti.
- [ ] `operateur` est rempli sur chaque écriture.
- [ ] Aucun champ de coût unitaire n'existe nulle part.

**DoD** : scénario de bout en bout automatisé : créer lot → sortir en deux fois → tenter de dépasser → tenter de supprimer → vérifier le reste et la valeur au prorata.

---

## Phase 5 : Traçabilité & Dashboard, côté requêtes (S6-S7)

**Objectif** : exposer tout ce qui permet de **tracer 100 % des lots** et d'alimenter le tableau de bord. Les mêmes calculs existent côté SQLite pour le mode hors-ligne.

| ID | Tâche | Piste |
| --- | --- | --- |
| A5.1 | **Journal unifié** `GET /tracabilite` : entrées + sorties dans une seule liste (vue `UNION`), triée par date, paginée à 100 | A |
| A5.2 | Recherche sur toutes les colonnes : période, matériel, catégorie, lot, PR/SR, opérateur, bénéficiaire | A |
| A5.3 | **Cycle de vie d'un lot** `GET /lots/{id}/cycle` : arrivage → sorties successives → reste | A |
| A5.4 | Contrôle d'intégrité `GET /admin/integrite` : détecte tout lot incohérent (somme des sorties > quantité initiale, sortie orpheline, lot sans opérateur). Objectif : **0 anomalie** = critère n°1 vérifiable | A |
| A5.5 | `GET /dashboard` : valeur totale du stock (prorata), cartes par catégorie (quantité totale + nombre d'articles), état des machines (fonctionnel / non fonctionnel), **100 derniers mouvements sans pagination** | A |
| A5.6 | Exclusions respectées : aucune route d'alertes/seuils, de consolidation annuelle ou de recherche du Dashboard | A |
| B5.1 | Requêtes SQLite équivalentes (journal, cycle de vie, dashboard) ; **pagination par clé** plutôt que `OFFSET` pour tenir sur de gros volumes | B |
| B5.2 | **Tests de cohérence croisée** : mêmes jeux de données → mêmes résultats MySQL et SQLite | A+B |

**DoD** : pour n'importe quel lot, le cycle de vie reconstitue exactement la quantité restante ; le contrôle d'intégrité renvoie 0 anomalie sur le jeu de test.

---

## Phase 6 : Synchronisation hors-ligne (S7-S10) : **Jalon M3**

**Objectif** : plusieurs postes travaillent hors-ligne puis convergent sans perte ni doublon. C'est le **chantier le plus risqué** : il commence tôt et a ses propres tests.

### 6.1 Principes

1. Toute écriture va d'abord dans SQLite **et** dans `sync_outbox` (même transaction locale).
2. **Envoi (push)** : lots d'opérations dans l'ordre chronologique, **idempotentes** grâce aux UUID (rejouer ne crée pas de doublon).
3. **Récupération (pull)** : le poste demande « tout ce qui a changé depuis `server_seq = N` » ; le serveur répond avec un nouveau curseur.
4. Les **suppressions sont transmises** (soft delete = enregistrement avec `deleted_at`), jamais ignorées.
5. Les **sorties sont des événements en ajout seul** : `quantite_restante` est recalculée partout, jamais écrasée.

### 6.2 Tâches

| ID | Tâche | Piste |
| --- | --- | --- |
| A6.1 | `POST /sync/push` : reçoit un lot d'opérations, traite **chaque opération indépendamment** et renvoie un statut par opération (accepté, doublon ignoré, conflit, rejeté). Une opération en erreur ne bloque pas les autres | A |
| A6.2 | Insertion idempotente (`upsert` par UUID) dans une transaction par opération | A |
| A6.3 | Attribution de `server_seq` à chaque modification acceptée | A |
| A6.4 | `GET /sync/pull?cursor=N` : modifications depuis N, par pages, y compris les enregistrements supprimés | A |
| A6.5 | `POST /sync/fichiers` : envoi des pièces jointes et signatures **après** la synchro des enregistrements, avec reprise en cas de coupure | A |
| A6.6 | **Détection de dépassement de stock** : à l'application d'une sortie, si le total dépasse la quantité du lot, la sortie est **acceptée** (elle a réellement eu lieu) mais le lot est marqué en conflit et une ligne est créée dans `sync_conflicts` pour l'admin. Rien n'est rejeté en silence | A |
| A6.7 | Conflit de modification d'un lot : comparaison de `version` ; si deux postes ont modifié le même lot, la plus récente l'emporte pour les champs de saisie, **jamais** pour les quantités sorties ; l'écart est consigné | A |
| A6.8 | `GET /admin/conflits` et résolution par l'admin (commentaire, correction, clôture) | A |
| A6.9 | Opération référençant un lot **archivé** entre-temps (voir phase 7) : acceptée, rattachée au lot archivé, signalée | A |
| B6.1 | **Outbox** : file ordonnée (`table`, `enregistrement_id`, `operation`, `payload`, `statut`, nombre d'essais) | B |
| B6.2 | Moteur de synchro : déclenchement à la reconnexion, au lancement, et périodique ; **reprise après coupure** à n'importe quel point | B |
| B6.3 | Application locale des changements reçus (insertion, mise à jour, soft delete) dans une transaction, avec mise à jour du curseur **seulement après succès** | B |
| B6.4 | Amorçage initial (premier lancement) : téléchargement complet paginé | B |
| B6.5 | Indicateur d'état de synchro pour l'UI : en attente, en cours, terminé, conflits à traiter | B |
| B6.6 | Gestion des **identifiants de poste** (`device_id`) enregistrés au premier lancement | B |

### 6.3 Scénarios de test obligatoires (automatisés)

| Scénario | Résultat attendu |
| --- | --- |
| Poste A et B sortent chacun 6 sur un lot de 10, hors-ligne, puis synchronisent | Les deux sorties sont conservées, reste = −2, **conflit signalé à l'admin** |
| Coupure réseau au milieu d'un `push` | Reprise sans doublon ni perte |
| Même lot modifié sur deux postes | Une version retenue, l'autre consignée |
| Poste éteint brutalement pendant une écriture | Au redémarrage, aucune donnée perdue (état lu depuis SQLite) |
| Poste hors-ligne pendant 30 jours | Synchro complète correcte |
| Rejeu du même lot d'opérations | Aucun doublon |
| Compte supprimé pendant que son poste est hors-ligne | Ses opérations déjà faites sont conservées avec son `operateur` |

**DoD** : deux clients simulés convergent vers un état identique ; tous les scénarios ci-dessus sont verts.

---

## Phase 7 : Export, archivage, réinitialisation (S10-S11) : **Jalon M4**

**Objectif** : le cycle « exporter → archiver → repartir à zéro » ne perd rien et reste traçable.

### 7.1 Génération des fichiers (côté client)

| ID | Tâche | Piste |
| --- | --- | --- |
| B7.1 | Classeur Excel multi-feuilles avec **ExcelJS** : `Lots`, `Stock`, `Sorties`, `Traçabilité`, `Récapitulatif`, **liées par `numero_lot`** | B |
| B7.2 | Prise en compte de **tous les filtres actifs** au moment de l'export | B |
| B7.3 | PDF (jsPDF) : bon de sortie signé, export de traçabilité ; Word (`docx`) : synthèse du Dashboard | B |
| B7.4 | `historique_exports` local : **20 derniers** fichiers, classés par date, le plus ancien supprimé à l'ajout du 21e (le fichier peut être supprimé du disque, c'est un fichier généré, pas une donnée métier) | B |

### 7.2 Archivage serveur

| ID | Tâche | Piste |
| --- | --- | --- |
| A7.1 | `POST /admin/archivage` : opération **atomique** : (1) vérifier que tous les postes ont synchronisé ou accepter l'avertissement, (2) créer un `archive_batch_id`, (3) marquer lots, sorties et documents `deleted_at`, (4) créer les **lots de report** (`est_stock_initial = true`, `lot_origine_id` = lot d'origine, `quantite_initiale` = reste) | A |
| A7.2 | Le coût du lot de report = **prorata du reste** (cohérent avec la valeur du stock), calculé une fois et enregistré comme `cout_total` du nouveau lot | A |
| A7.3 | **Réinitialisation manuelle** (Paramètres) : même mécanisme, avec **mot de passe obligatoire** revérifié côté serveur | A |
| A7.4 | Les postes reçoivent l'archivage par le `pull` (suppressions + nouveaux lots de report) et repartent à zéro | A+B |
| A7.5 | **Rien n'est supprimé physiquement** : test qui vérifie que le nombre de lignes en base ne diminue jamais | A |
| A7.6 | Traçabilité des archives : on peut retrouver un lot archivé et la chaîne `lot_origine_id` | A |

### 7.3 Règles de sécurité de l'opération

- Réservée à l'**admin**, mot de passe demandé, **en ligne uniquement** (un poste hors-ligne ne peut pas archiver).
- L'export Excel est généré **avant** l'archivage ; l'archivage ne se lance que si l'export a réussi.
- Journal : qui a archivé, quand, quel lot de données (`archive_batch_id`).

**DoD** : après archivage, le stock restant et sa valeur sont identiques avant et après ; les lots de report pointent vers leurs origines ; aucune ligne n'a été supprimée.

---

## Phase 8 : Sécurité & durcissement (S11-S12, de base dès S3)

| ID | Tâche |
| --- | --- |
| A8.1 | Validation stricte sur chaque route (`FormRequest`), jamais de `$request->all()` direct |
| A8.2 | Autorisation systématique par **Policies** (admin / personnel, structure) |
| A8.3 | Limitation de débit renforcée sur `login` et `sync` ; verrouillage temporaire après échecs répétés |
| A8.4 | Expiration et révocation des jetons ; un jeton par poste ; liste et révocation des postes par l'admin |
| A8.5 | Journal d'audit des écritures sensibles (modification de lot, archivage, gestion de comptes) |
| A8.6 | Fichiers : liste blanche de types, taille maximale, nom aléatoire, stockage hors dossier public, accès par route authentifiée |
| A8.7 | HTTPS obligatoire, en-têtes de sécurité, `APP_DEBUG=false` en production, secrets hors dépôt |
| A8.8 | **Sauvegarde MySQL** automatique + test de restauration documenté |
| A8.9 | Client : CSP stricte de la WebView, permissions Tauri minimales, aucune clé privée dans le dépôt |
| A8.10 | Analyse des dépendances (`composer audit`, `npm audit`, `cargo audit`) dans la CI |

---

## Phase 9 : Tests, performance, recette (S12-S13, en continu)

| ID | Tâche |
| --- | --- |
| 9.1 | Tests unitaires des services de stock (reste, valeur au prorata, FIFO) |
| 9.2 | Tests d'API (Pest ou PHPUnit) de toutes les routes, rôles inclus |
| 9.3 | Tests de **synchronisation** (scénarios 6.3) en CI |
| 9.4 | Tests de **charge** : 100 000 lots / 500 000 sorties, temps de réponse des listes et du Dashboard ; ajuster les index |
| 9.5 | Test de **récupération** : kill du processus pendant une écriture, vérification de SQLite au redémarrage |
| 9.6 | **Recette par critère** : critère n°1 (100 % des lots tracés, contrôle d'intégrité = 0 anomalie) et critère n°2 (entrées / sorties / stock cohérents) |
| 9.7 | Jeu de données de démonstration réaliste pour les 5 structures |

---

## Phase 10 : Distribution & mises à jour (S13-S14) : **Jalon M5**

| ID | Tâche | Piste |
| --- | --- | --- |
| A10.7 | **Provisionner le VPS** : Ubuntu LTS, Nginx, PHP-FPM 8.3, MySQL 8, pare-feu, accès SSH par clé, TLS automatique, domaine | A |
| A10.8 | **Déploiement reproductible** (script ou CI) : `composer install --no-dev`, migrations, `config:cache`, redémarrage, retour arrière ; environnement de recette identique | A |
| A10.1 | **Site de téléchargement** Laravel, accessible **uniquement après connexion**, hébergeant l'installateur | A |
| A10.2 | Endpoint de mise à jour renvoyant, selon `{{target}}`, `{{arch}}` et `{{current_version}}`, soit « pas de mise à jour », soit la version, l'URL du paquet et sa signature | A |
| A10.3 | En-tête `X-Client-Version` : le serveur **refuse les clients trop anciens** avec un message demandant la mise à jour (compatibilité d'API) | A |
| A10.4 | Ordre de déploiement : **serveur d'abord** (rétro-compatible), puis publication de la version client | A |
| B10.1 | `bundle.createUpdaterArtifacts: true` dans `tauri.conf.json` | B |
| B10.2 | Générer les clés avec `tauri signer generate` ; mettre le **contenu** de la clé publique (pas un chemin) dans `plugins.updater.pubkey` | B |
| B10.3 | **Clé privée** : conservée hors dépôt, sauvegardée en deux endroits sûrs (sa perte empêche toute mise à jour future des postes installés) | B |
| B10.4 | `plugins.updater.endpoints` vers l'API Laravel, en **HTTPS** | B |
| B10.5 | **Signature de code** de l'installateur Windows (certificat à acquérir) | B |
| B10.6 | Pipeline de publication reproductible (build, signature, dépôt de l'artefact et des signatures) | B |

**DoD** : un poste en version 0.1 détecte une version 0.2, la télécharge, vérifie la signature, s'installe et conserve ses données locales.

---

## Phase 11 : Pilote & mise en production (S14-S16) : **Jalon M6**

| ID | Tâche |
| --- | --- |
| 11.1 | Import du stock existant : chaque article actuel devient un lot `est_stock_initial = true` avec son coût total (script d'import validé par l'admin) |
| 11.2 | **Pilote** sur une structure (2 à 3 postes) pendant 2 semaines ; suivi des conflits de synchro et des anomalies |
| 11.3 | Correctifs issus du pilote, puis déploiement aux 4 programmes et au service central |
| 11.4 | Documentation : guide admin (comptes, conflits, archivage, sauvegardes), procédure de reprise après incident |
| 11.5 | Formation courte du personnel ; création des comptes par l'admin |
| 11.6 | Supervision : journal d'erreurs serveur, alerte si la sauvegarde échoue |
| 11.7 | Revue finale des deux critères de réussite et clôture du projet v1.0 |

---

## 11. Contrat d'API (résumé)

| Domaine | Routes |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Comptes (admin) | `GET/POST /users`, `PUT/DELETE /users/{id}` |
| Référentiels | `GET/POST/PUT/DELETE /categories`, `/materiels` |
| Lots | `GET/POST /lots`, `GET/PUT/DELETE /lots/{id}`, `GET /lots/{id}/cycle`, `GET /lots/suggestion` |
| Stock | `GET /stock` |
| Sorties | `GET/POST /sorties`, `GET /sorties/{id}`, `GET /sorties/{id}/bon` (**pas de PUT ni DELETE**) |
| Documents | `POST /documents`, `GET /documents/{id}` |
| Traçabilité | `GET /tracabilite` |
| Dashboard | `GET /dashboard` |
| Synchronisation | `POST /sync/push`, `GET /sync/pull`, `POST /sync/fichiers` |
| Administration | `POST /admin/archivage`, `POST /admin/reinitialisation`, `GET /admin/conflits`, `GET /admin/integrite` |
| Mises à jour | `GET /updates/{target}/{arch}/{version}` |

Toutes les listes : **100 éléments par page**, sauf les 100 derniers mouvements du Dashboard.

---

## 12. Décisions (D1 à D5 toutes validées)

| # | Sujet | Problème | Proposition |
| --- | --- | --- | --- |
| D1 | Numéro de lot hors-ligne | **Validé** : format `LOT-AAAA-Pxx-00001`, compteur par poste | Code poste attribué à l'enregistrement du poste (`devices.code_poste`) |
| D2 | Ajouts au modèle (§ phase 2) | **Validé** : `lot_origine_id`, `archive_batch_id`, `version`, `server_seq`, `devices` | Intégrés au schéma |
| D3 | Version de Laravel | **Validé** : Laravel 13 (PHP 8.3+) | Mise à jour du README effectuée |
| D4 | Hébergement de production | **Validé : VPS** | Tâches A10.7 et A10.8 ; exigences SEC-12 |
| D5 | Archivage avec postes non synchronisés | **Validé** : avertir l'admin, accepter ensuite les opérations tardives (A6.9) | |

---

## 13. Écarts constatés avec la maquette (à corriger au refonte de l'UI)

- La maquette affiche encore un champ et une colonne **« Bon de livraison (BL) »** : à supprimer (décision actée).
- Le reste (lots, usage, sans coût unitaire, sans alertes ni recherche sur le Dashboard) est conforme au README.

---

## 14. Risques principaux

| Risque | Impact | Parade |
| --- | --- | --- |
| Conflits de stock en multi-postes hors-ligne | Stock négatif | Sorties en ajout seul, détection et alerte admin (A6.6) |
| Perte de la clé privée de l'updater | Plus aucune mise à jour possible | Double sauvegarde (B10.3) |
| Dérive entre schémas MySQL et SQLite | Bugs de synchro | Test de parité en CI (B2.3) |
| Archivage mal exécuté | Perte de traçabilité | Opération atomique, `archive_batch_id`, test « aucune ligne supprimée » |
| Serveur indisponible | Postes bloqués | Mode hors-ligne complet, sauvegardes MySQL |
