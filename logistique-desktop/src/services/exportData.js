import { db } from '../core/db.js';
import { RESTANTE, VALEUR } from './stock.js';
import { journalComplet } from './trace.js';
import { summary } from './dashboard.js';

/**
 * Données de l'export Excel multi-feuilles. Toutes les feuilles portent `numero_lot` :
 * c'est la clé qui les relie entre elles (README §6). Les filtres actifs s'appliquent partout.
 */
export async function exportData({ categorieId = '', dateFrom = '', dateTo = '' } = {}) {
  const lotWhere = ['l.deleted_at IS NULL'];
  const lotParams = [];
  const sorWhere = ['s.deleted_at IS NULL'];
  const sorParams = [];
  if (categorieId) {
    lotWhere.push('c.id = ?'); lotParams.push(categorieId);
    sorWhere.push('c.id = ?'); sorParams.push(categorieId);
  }
  if (dateFrom) {
    lotWhere.push('l.date_entree >= ?'); lotParams.push(`${dateFrom}T00:00:00.000Z`);
    sorWhere.push('s.date_sortie >= ?'); sorParams.push(`${dateFrom}T00:00:00.000Z`);
  }
  if (dateTo) {
    lotWhere.push('l.date_entree <= ?'); lotParams.push(`${dateTo}T23:59:59.999Z`);
    sorWhere.push('s.date_sortie <= ?'); sorParams.push(`${dateTo}T23:59:59.999Z`);
  }

  const lotFrom = `FROM lots l JOIN materiels m ON m.id = l.materiel_id LEFT JOIN categories c ON c.id = m.categorie_id
                   LEFT JOIN users u ON u.id = l.operateur_id WHERE ${lotWhere.join(' AND ')}`;

  const lots = await db.select(
    `SELECT l.numero_lot, l.date_entree, m.designation, COALESCE(c.nom, '') AS categorie, m.marque_modele, l.no_serie_chassis,
            l.code_bailleur_immatriculation, l.structure_service, l.fournisseur, l.description, l.usage, l.etat_fonctionnement,
            l.quantite_initiale, l.cout_total, l.observations, COALESCE(u.nom, '') AS operateur, l.est_stock_initial,
            (SELECT lo.numero_lot FROM lots lo WHERE lo.id = l.lot_origine_id) AS lot_origine
     ${lotFrom} ORDER BY l.date_entree, l.numero_lot`,
    lotParams
  );

  const stock = await db.select(
    `SELECT l.numero_lot, m.designation, COALESCE(c.nom, '') AS categorie, m.marque_modele, l.no_serie_chassis,
            l.quantite_initiale, ${RESTANTE} AS quantite_restante, ${VALEUR} AS valeur_restante,
            l.usage, l.etat_fonctionnement
     ${lotFrom} AND ${RESTANTE} > 0 ORDER BY l.date_entree, l.numero_lot`,
    lotParams
  );

  const sorties = await db.select(
    `SELECT l.numero_lot, s.date_sortie, m.designation, COALESCE(c.nom, '') AS categorie, l.no_serie_chassis, s.quantite,
            s.nom_beneficiaire, s.contact_beneficiaire, s.fonction, s.pr_sr, s.usage, s.etat_fonctionnement,
            s.description, COALESCE(u.nom, '') AS operateur
     FROM sorties s JOIN lots l ON l.id = s.lot_id JOIN materiels m ON m.id = l.materiel_id
          LEFT JOIN categories c ON c.id = m.categorie_id LEFT JOIN users u ON u.id = s.operateur_id
     WHERE ${sorWhere.join(' AND ')} ORDER BY s.date_sortie, l.numero_lot`,
    sorParams
  );

  const trace = await journalComplet({ categorieId, dateFrom, dateTo });
  const recap = await summary({ categorieId, dateFrom, dateTo });
  return { lots, stock, sorties, trace, recap };
}
