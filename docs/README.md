# Application Desktop de Logistique & Traçabilité des Ressources Matérielles

> Document de référence pour le développement (humain et IDE intelligent).
> Tout ce qui est écrit ici est **validé**.

---

## 1. Objectif

Centraliser et sécuriser la gestion du matériel du **service central** et des **4 programmes** :
**PNLP**, **PNLT**, **PNLS**, **UCP-FM**.

**Critères de réussite**

1. **Tracer 100 % des lots** : chaque sortie est rattachée à un lot précis, chaque lot à son arrivage.
2. **Gérer entrées / sorties / stock** de ressources matérielles, simplement.

---

## 2. Principes directeurs

1. **Application desktop** installable, utilisable **hors-ligne**, avec synchronisation au retour de la connexion.
2. **Multi-postes** : chaque membre du personnel a son compte ; mêmes données sur tous les postes.
3. **Connexion par structure** : sélection de la structure + identifiant + mot de passe.
4. **Opérateur tracé** : l'utilisateur connecté est enregistré automatiquement sur chaque action (`operateur`).
5. **Entrée → Stock automatique** : toute entrée crée un lot, immédiatement disponible pour les sorties.
6. **Soft delete partout** : aucune suppression physique ; les données sont masquées (`deleted_at`) mais conservées.
7. **PR/SR automatique** : renseigné avec la structure de l'utilisateur connecté qui effectue la sortie.
8. **Aucun coût unitaire** : on ne gère que le **coût total du lot**.
9. **Pièces jointes libres** : tout document existant (PDF, images) peut être joint. Il n'y a **pas de bon de livraison (BL)**.
10. **UI** : en-têtes de navigation et de tableaux **fixes** (`position: sticky`) ; **pagination 100 lignes/page** sur tous les tableaux, sauf le tableau du Dashboard.
11. **Vocabulaire** : on parle d'**« usage »** (à quoi sert la ressource), jamais de « destination ».

---

## 3. Stack technique

| Couche | Technologie | Rôle |
| --- | --- | --- |
| Client desktop | **Tauri v2** | Application installable (Windows en priorité), WebView + Rust |
| Interface | **HTML / CSS / JS + Bootstrap** | Pages, modales, tableaux, sticky headers, pagination |
| Icônes | **Lucide Icons** | Icônes de catégories sur fonds pastel |
| Base locale | **SQLite** (`tauri-plugin-sql`) | Fonctionnement hors-ligne, reprise après extinction |
| Backend central | **Laravel 13 (PHP 8.3+)** | API REST, auth, synchronisation, mises à jour, site de téléchargement |
| Base centrale | **MySQL 8** | Source de vérité partagée, `SoftDeletes` |
| Auth API | **Laravel Sanctum** (tokens) | Authentification du client desktop |
| Signature | **Signature Pad (JS)** | Signature tactile du bénéficiaire |
| PDF | **jsPDF** (client) | Bon de sortie, exports PDF (hors-ligne) |
| Excel | **ExcelJS** (client) | Exports multi-feuilles (hors-ligne) |
| Word | **`docx`** (client) | Export de synthèse du Dashboard (hors-ligne) |
| Fichiers | **Laravel Storage** + dossier local | Pièces jointes, signatures |
| Mises à jour | **Tauri Updater** | Mises à jour automatiques signées |

---

## 4. Modèle de données

Identifiants **UUID** (générés côté client, indispensable pour créer des données hors-ligne).
Colonnes communes : `created_at`, `updated_at`, `deleted_at`, `sync_status`.

```
STRUCTURE (id, nom)                       -- PNLP | PNLT | PNLS | UCP-FM | Service central
USER (id, structure_id, nom, email, mot_de_passe, role [admin|personnel])
CATEGORIE (id, nom, icone, couleur_fond)

MATERIEL (id, designation, categorie_id, marque_modele)         -- catalogue

LOT (id, numero_lot, materiel_id, structure_id,                 -- 1 lot = 1 arrivage fournisseur
     fournisseur, description, usage, etat_fonctionnement,
     no_serie_chassis, code_bailleur_immatriculation, structure_service,
     observations, quantite_initiale, cout_total,
     operateur_id, date_entree, est_stock_initial,
     lot_origine_id, archive_batch_id, version, server_seq)     -- report de stock et synchro

SORTIE (id, lot_id [OBLIGATOIRE], quantite, nom_beneficiaire, contact_beneficiaire,
        fonction, pr_sr [auto], usage, etat_fonctionnement, description [facultative],
        signature_path, operateur_id, date_sortie)               -- lecture seule

DOCUMENT (id, rattache_type [lot|sortie], rattache_id, nom, chemin, mime)

DEVICE (id, nom, code_poste, derniere_synchro)                  -- poste ; `code_poste` sert au numero_lot
SYNC_CONFLICT (id, type, lot_id, detail, resolu)                -- conflits de stock signalés à l'admin

HISTORIQUE_EXPORT (id, format, chemin, parametres, user_id, created_at)   -- 20 max
SYNC_OUTBOX (id, table, enregistrement_id, operation, payload, statut)    -- local uniquement
```

**Règles de calcul**

- `quantite_restante` (lot) = `quantite_initiale` − somme des `SORTIE.quantite` du lot. **Valeur dérivée, jamais saisie.**
- `numero_lot` généré automatiquement : `LOT-AAAA-Pxx-00001` (`Pxx` = code du poste, compteur par poste, unique hors-ligne).
- **Valeur du stock** = somme du `cout_total` des lots en stock, au prorata de `quantite_restante / quantite_initiale` (calculé, aucun coût unitaire stocké).
- Une sortie ne peut jamais dépasser `quantite_restante` du lot choisi.

---

## 5. Modules

### 5.1 Connexion
`STRUCTURE` · `IDENTIFIANT / EMAIL` · `MOT DE PASSE`. La session conserve id, structure et nom de l'utilisateur.

### 5.2 Dashboard
- Widget **Valeur totale du stock** (cumul des coûts totaux).
- **Cartes par catégorie** : icône auto + fond pastel, quantité totale et nombre d'articles.
- **Récapitulatif de l'état des machines** (fonctionnel / non fonctionnel).
- Tableau des **100 derniers mouvements** (entrées + sorties), **sans pagination**.
- **Exports** : Excel, PDF, Word.
- **Exclus** : barre de recherche, alertes/seuils, consolidation annuelle.

### 5.3 Entrées (création de lots)
- Tableau paginé (100/page) + en-tête fixe + recherche + filtres.
- Boutons : **Enregistrer une entrée**, **Exporter en Excel**.
- Modale : `DESIGNATION`, `CATEGORIE`, `MARQUE / MODELE`, `N° SERIE / CHASSIS`, `CODE BAILLEUR / IMMATRICULATION`, `STRUCTURE / SERVICE`, `ETAT DE FONCTIONNEMENT`, `DESCRIPTION DU LOT`, `USAGE PREVU`, `NOM DU FOURNISSEUR`, `QUANTITE`, `COUT TOTAL`, `OBSERVATIONS`, `DOCUMENTS` (facultatif).
- `OPERATEUR` et `DATE/HEURE` automatiques. Le `NUMERO DE LOT` est généré.
- Enregistrer crée le lot et l'ajoute au stock.

### 5.4 Stockage
- Liste des lots disponibles (`quantite_restante > 0`), paginée, en-tête fixe, recherche/filtres.
- Actions par ligne :
  - **Sortir** : ouvre la modale de sortie pré-remplie (lot, fiche technique, PR/SR).
  - **Modifier** : correction de la saisie. La quantité initiale ne peut pas devenir inférieure à ce qui est déjà sorti.
  - **Supprimer** : soft delete, **refusé si le lot a déjà des sorties**.

### 5.5 Sorties (lecture seule)
- Registre paginé des sorties, en-tête fixe, recherche et filtres. **Ni modifiable, ni supprimable.**
- Boutons : **Sortir** (sortie manuelle), **Exporter en Excel**.
- **Choix du lot** : le plus ancien est proposé par défaut (FIFO), modifiable manuellement.
- Modale : `LOT`, `QUANTITE`, `NOM / CONTACT / FONCTION DU BENEFICIAIRE`, `PR/SR` (auto), `USAGE`, `ETAT DE FONCTIONNEMENT`, `DESCRIPTION` (facultative), `SIGNATURE`, `DOCUMENT` (facultatif), `OPERATEUR` (auto).
- Action par ligne : **Imprimer le Bon de Sortie (PDF signé)** : fiche technique, numéro de lot, PR/SR, bénéficiaire, opérateur, signature.

### 5.6 Traçabilité
- Journal unifié entrées + sorties, paginé, en-tête fixe.
- Vue **cycle de vie d'un lot** : arrivage → sorties successives → reste.
- Recherche sur toutes les colonnes (période, matériel, catégorie, lot, PR/SR, opérateur, bénéficiaire).
- Exports Excel et PDF.

### 5.7 Historique des exports
- Les **20 derniers** fichiers sont conservés et ré-exportables, classés **par date uniquement**. Le plus ancien disparaît à l'ajout d'un nouveau.

### 5.8 Paramètres
- **Gestion des comptes** : créer, **modifier**, **supprimer** (soft delete). Structure = celle de l'admin connecté ; rôle par défaut `Personnel`.
- **Réinitialisation de l'application** : bouton + modale de confirmation avec **mot de passe obligatoire**.

---

## 6. Export Excel & remise à zéro

- L'export se lance **depuis le Dashboard** et tient compte de **tous les paramètres/filtres actifs**.
- Classeur **multi-feuilles, lié par `numero_lot`** : `Lots`, `Stock`, `Sorties`, `Traçabilité`, `Récapitulatif` (valeur par catégorie, état des machines).
- **Après export** : les données sont **archivées** (`deleted_at`) et l'interface repart à zéro. Le **stock restant est reporté** sous forme de lots marqués `est_stock_initial = true`, qui conservent leur référence au lot d'origine.
- La réinitialisation manuelle (5.8) applique le même mécanisme d'archivage. **Rien n'est jamais supprimé physiquement.**

---

## 7. Hors-ligne & synchronisation

1. Toutes les écritures vont d'abord dans **SQLite local** puis dans `SYNC_OUTBOX`.
2. Au retour de la connexion, l'outbox est envoyée à l'API Laravel (ordre chronologique, idempotent grâce aux UUID), puis les changements distants sont récupérés.
3. Les **sorties sont des événements en ajout seul** : `quantite_restante` est recalculée, jamais écrasée. Cela évite l'essentiel des conflits.
4. **Conflit de stock** (deux postes sortent la même quantité hors-ligne) : la synchronisation détecte le dépassement et le signale à l'admin au lieu de rejeter silencieusement.
5. Reprise après extinction : l'état est lu depuis SQLite, aucune perte.

---

## 8. Sécurité

- Mots de passe hachés (bcrypt/argon2), tokens Sanctum côté client.
- Réinitialisation protégée par mot de passe.
- Journalisation de l'opérateur sur chaque écriture ; `deleted_at` au lieu de DELETE.
- **Signature des mises à jour** (clé privée Tauri conservée hors dépôt) et **signature de code** de l'installateur.

---

## 9. Déploiement & mises à jour

- **Site de téléchargement** (Laravel) hébergeant l'installateur, **accessible uniquement après connexion**.
- **Mises à jour automatiques** via le plugin Tauri Updater :
  - `bundle.createUpdaterArtifacts: true` dans `tauri.conf.json` ;
  - clés générées par `tauri signer generate` ; la **clé publique** (contenu, pas un chemin) va dans `plugins.updater.pubkey`, la **clé privée** ne se partage jamais et sa perte bloque les mises à jour ;
  - `plugins.updater.endpoints` pointe vers l'API Laravel (variables `{{target}}`, `{{arch}}`, `{{current_version}}`), en HTTPS obligatoire.

---

## 10. Plan technique

| Phase | Contenu |
| --- | --- |
| 1. Socle | Projet Tauri v2, `tauri add sql`, `cargo add tauri-plugin-sql --features sqlite`, migrations SQLite (`add_migrations("sqlite:logistique.db", …)`), projet Laravel + MySQL + Sanctum |
| 2. Données | Migrations identiques SQLite/MySQL, UUID, soft delete, calcul de `quantite_restante` |
| 3. Cœur métier | Auth par structure, Entrées (création de lot), Stockage, Sorties (lot obligatoire, FIFO suggéré) |
| 4. Traçabilité | Journal unifié, cycle de vie d'un lot, pièces jointes |
| 5. Documents | Bon de sortie PDF signé, exports Excel/PDF/Word, historique des 20 exports |
| 6. Dashboard | Valeur du stock, cartes catégories, état des machines, 100 derniers mouvements |
| 7. Synchronisation | Outbox, API de sync, détection des conflits de stock |
| 8. Distribution | Site protégé, signature de code, Tauri Updater |

---

## 11. Carte des pages

```
1. Connexion
2. Dashboard (valeur du stock, cartes catégories, état des machines, 100 derniers mouvements, exports)
3. Entrées (tableau paginé + modale « Enregistrer une entrée »)
4. Stockage (lots disponibles + Sortir / Modifier / Supprimer)
5. Sorties (lecture seule + sortie manuelle + Bon de Sortie PDF)
6. Traçabilité (journal unifié + cycle de vie d'un lot + exports)
7. Historique des exports (20 derniers)
8. Paramètres (comptes + réinitialisation)
```

---

## 12. Décisions confirmées

1. **Valeur d'un lot partiellement sorti** : au prorata, `cout_total × quantite_restante / quantite_initiale` (calculé, jamais stocké).
2. **Exports** : générés **côté client** (ExcelJS, jsPDF, `docx`) pour fonctionner hors-ligne.
3. **Création de compte** : **uniquement par l'admin**, pas d'inscription libre.
