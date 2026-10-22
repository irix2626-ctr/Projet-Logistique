-- Base locale SQLite : réplique du schéma serveur (sans clés étrangères : l'ordre d'arrivée des
-- changements de /sync/pull n'est pas garanti) + tables propres au poste.
-- Source UNIQUE : embarquée dans l'application par Rust (include_str!) et chargée par les tests Node.

CREATE TABLE structures (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY, structure_id TEXT, nom TEXT NOT NULL, email TEXT, role TEXT,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, icone TEXT, couleur_fond TEXT,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

CREATE TABLE materiels (
  id TEXT PRIMARY KEY, designation TEXT NOT NULL, categorie_id TEXT, marque_modele TEXT,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

-- 1 lot = 1 arrivage fournisseur. La quantité restante est DÉRIVÉE (jamais stockée).
CREATE TABLE lots (
  id TEXT PRIMARY KEY,
  numero_lot TEXT NOT NULL UNIQUE,
  materiel_id TEXT NOT NULL, structure_id TEXT,
  fournisseur TEXT, description TEXT, usage TEXT, etat_fonctionnement TEXT,
  no_serie_chassis TEXT, code_bailleur_immatriculation TEXT, structure_service TEXT, observations TEXT,
  quantite_initiale INTEGER NOT NULL CHECK (quantite_initiale > 0),
  cout_total REAL NOT NULL CHECK (cout_total >= 0),     -- coût TOTAL du lot : aucun coût unitaire
  operateur_id TEXT, date_entree TEXT NOT NULL,
  est_stock_initial INTEGER NOT NULL DEFAULT 0,
  lot_origine_id TEXT, archive_batch_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

-- Une sortie vise TOUJOURS un lot (NOT NULL). Lecture seule : aucune mise à jour applicative.
CREATE TABLE sorties (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL,
  quantite INTEGER NOT NULL CHECK (quantite > 0),
  nom_beneficiaire TEXT NOT NULL, contact_beneficiaire TEXT, fonction TEXT,
  pr_sr TEXT NOT NULL, usage TEXT, etat_fonctionnement TEXT, description TEXT,
  signature_path TEXT,          -- chemin côté serveur (après synchro)
  signature_b64 TEXT,           -- copie locale de la signature (PNG en base64), pour le bon de sortie hors-ligne
  operateur_id TEXT, date_sortie TEXT NOT NULL,
  archive_batch_id TEXT, conflit_stock INTEGER NOT NULL DEFAULT 0,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  rattache_type TEXT NOT NULL, rattache_id TEXT NOT NULL,
  nom TEXT NOT NULL, mime TEXT, taille INTEGER, sha256 TEXT,
  content_b64 TEXT,             -- copie locale du fichier (base64)
  operateur_id TEXT, archive_batch_id TEXT,
  created_at TEXT, updated_at TEXT, deleted_at TEXT
);

-- ---------------------------------------------------------------- tables locales (jamais synchronisées)

-- File d'attente d'envoi (README §7). Écrite dans la MÊME transaction que la donnée métier.
CREATE TABLE sync_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  table_name TEXT NOT NULL, record_id TEXT NOT NULL, operation TEXT NOT NULL,
  payload TEXT NOT NULL, base_version INTEGER, operateur_id TEXT, client_ts TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'pending',   -- pending | rejected
  essais INTEGER NOT NULL DEFAULT 0, derniere_erreur TEXT
);

-- Fichiers (signatures, pièces jointes) à envoyer APRÈS leurs enregistrements.
CREATE TABLE sync_files (
  id TEXT NOT NULL, type TEXT NOT NULL,     -- type : signature | document ; id = sortie.id | document.id
  essais INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id, type)
);

CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT);

-- Vérificateur de mot de passe pour la connexion hors-ligne (jamais le mot de passe lui-même).
CREATE TABLE local_auth (
  user_id TEXT PRIMARY KEY, structure_id TEXT NOT NULL, identifiant TEXT NOT NULL,
  nom TEXT NOT NULL, role TEXT NOT NULL,
  salt TEXT NOT NULL, hash TEXT NOT NULL, iterations INTEGER NOT NULL,
  last_online_login_at TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT
);

-- 20 derniers fichiers exportés, ré-exportables (README §5.7).
CREATE TABLE export_history (
  id TEXT PRIMARY KEY, nom TEXT NOT NULL, format TEXT NOT NULL, module TEXT,
  user_id TEXT, user_nom TEXT, taille INTEGER, created_at TEXT NOT NULL,
  content_b64 TEXT NOT NULL
);

-- Compteur de numéros de lot par année pour CE poste : LOT-AAAA-Pxx-00001.
CREATE TABLE lot_counters (annee INTEGER PRIMARY KEY, dernier INTEGER NOT NULL);

CREATE INDEX idx_lots_materiel ON lots(materiel_id);
CREATE INDEX idx_lots_date ON lots(date_entree);
CREATE INDEX idx_lots_deleted ON lots(deleted_at);
CREATE INDEX idx_sorties_lot ON sorties(lot_id);
CREATE INDEX idx_sorties_date ON sorties(date_sortie);
CREATE INDEX idx_sorties_deleted ON sorties(deleted_at);
CREATE INDEX idx_materiels_cat ON materiels(categorie_id);
CREATE INDEX idx_documents_rattache ON documents(rattache_type, rattache_id);
CREATE INDEX idx_outbox_record ON sync_outbox(table_name, record_id);
