-- Droits MySQL de production (SECURITE.md SEC-5.1 à SEC-5.3).
-- À exécuter en root sur le VPS, APRÈS `php artisan migrate` (les GRANT par table exigent que les tables existent).
-- Remplacez les mots de passe. MySQL doit écouter en local seulement (SEC-5.4).

CREATE DATABASE IF NOT EXISTS logistique CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 1) Compte réservé aux migrations (utilisé seulement au déploiement) : tous les droits sur la base.
CREATE USER IF NOT EXISTS 'logistique_migrate'@'localhost' IDENTIFIED BY 'CHANGER_MOT_DE_PASSE_MIGRATION';
GRANT ALL PRIVILEGES ON logistique.* TO 'logistique_migrate'@'localhost';

-- 2) Compte applicatif (dans le .env de production) : jamais DROP / ALTER, jamais DELETE sur les tables métier.
CREATE USER IF NOT EXISTS 'logistique_app'@'localhost' IDENTIFIED BY 'CHANGER_MOT_DE_PASSE_APP';

-- Tables métier : lecture, ajout, modification. "Rien n'est supprimé physiquement" devient une garantie de la base.
GRANT SELECT, INSERT, UPDATE ON logistique.structures        TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.users             TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.categories        TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.materiels         TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.devices           TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.device_user       TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.lots              TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.sorties           TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.documents         TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.sync_log          TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.sync_ops          TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.sync_conflicts    TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON logistique.archive_batches   TO 'logistique_app'@'localhost';

-- Journal d'audit : ajout seul (SEC-5.3).
GRANT SELECT, INSERT ON logistique.audit_logs TO 'logistique_app'@'localhost';

-- Tables techniques : DELETE autorisé (purge des jetons expirés, cache, files d'attente).
GRANT SELECT, INSERT, UPDATE, DELETE ON logistique.personal_access_tokens TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON logistique.cache                  TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON logistique.cache_locks            TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON logistique.jobs                   TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON logistique.job_batches            TO 'logistique_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON logistique.failed_jobs            TO 'logistique_app'@'localhost';
GRANT SELECT ON logistique.migrations TO 'logistique_app'@'localhost';

FLUSH PRIVILEGES;
