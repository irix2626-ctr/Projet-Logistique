import { saveBytes } from '../ui/files.js';
import { recordExport } from './exportHistory.js';
import { exportData } from './exportData.js';
import { summary } from './dashboard.js';
import { getBon } from './sorties.js';
import { api } from './api.js';
import { session } from '../core/session.js';
import { fmtDate, fmtMoney, etatLabel, slug } from '../core/format.js';
import { bytesToBase64 } from '../core/b64.js';
import { AppError } from '../core/errors.js';

/**
 * Exports générés CÔTÉ CLIENT (ExcelJS, jsPDF, docx) pour fonctionner hors-ligne.
 * Les bibliothèques sont chargées à la demande : le démarrage de l'application reste rapide.
 */
const day = () => new Date().toISOString().slice(0, 10);

async function finish(name, bytes, format, module) {
  const where = await saveBytes(name, bytes);
  if (!where) return null; // l'utilisateur a annulé
  await recordExport({ nom: name, format, module, bytes });
  return where;
}

// ------------------------------------------------------------------ Excel

async function excelLib() {
  const mod = await import('exceljs/dist/exceljs.min.js');
  return mod.default ?? mod;
}

function addSheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18, style: c.fmt ? { numFmt: c.fmt } : {} }));
  rows.forEach((r) => ws.addRow(columns.reduce((o, c) => ({ ...o, [c.key]: c.map ? c.map(r[c.key], r) : r[c.key] ?? '' }), {})));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17352C' } };
  head.alignment = { vertical: 'middle' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (columns.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

const C = {
  lot: { header: 'N° de lot', key: 'numero_lot', width: 22 },
  date: (key, header = 'Date / heure') => ({ header, key, width: 18, map: (v) => (v ? fmtDate(v) : '') }),
  txt: (header, key, width = 20) => ({ header, key, width }),
  num: (header, key, fmt = '#,##0') => ({ header, key, width: 14, fmt, map: (v) => (v === '' || v == null ? '' : Number(v)) }),
  etat: { header: 'État', key: 'etat_fonctionnement', width: 16, map: (v) => etatLabel(v) },
};

/** Classeur multi-feuilles lié par numero_lot : Lots, Stock, Sorties, Traçabilité, Récapitulatif. */
export async function exportWorkbook(filters = {}) {
  const ExcelJS = await excelLib();
  const d = await exportData(filters);
  const wb = new ExcelJS.Workbook();
  wb.creator = session.user?.nom || 'Logistique';
  wb.created = new Date();

  addSheet(wb, 'Lots', [
    C.lot, C.date('date_entree', 'Date d\'entrée'), C.txt('Désignation', 'designation', 26), C.txt('Catégorie', 'categorie'),
    C.txt('Marque / Modèle', 'marque_modele'), C.txt('N° de série / châssis', 'no_serie_chassis'),
    C.txt('Code bailleur / immatriculation', 'code_bailleur_immatriculation', 26), C.txt('Structure / service', 'structure_service'),
    C.txt('Fournisseur', 'fournisseur'), C.txt('Description', 'description', 30), C.txt('Usage', 'usage', 26), C.etat,
    C.num('Quantité reçue', 'quantite_initiale'), C.num('Coût total', 'cout_total'), C.txt('Observations', 'observations', 26),
    C.txt('Opérateur', 'operateur'), C.txt('Lot d\'origine (report)', 'lot_origine', 22),
  ], d.lots);

  addSheet(wb, 'Stock', [
    C.lot, C.txt('Désignation', 'designation', 26), C.txt('Catégorie', 'categorie'), C.txt('Marque / Modèle', 'marque_modele'),
    C.txt('N° de série / châssis', 'no_serie_chassis'), C.num('Quantité reçue', 'quantite_initiale'),
    C.num('Quantité restante', 'quantite_restante'), C.num('Valeur restante', 'valeur_restante'), C.txt('Usage', 'usage', 26), C.etat,
  ], d.stock);

  addSheet(wb, 'Sorties', [
    C.lot, C.date('date_sortie'), C.txt('Désignation', 'designation', 26), C.txt('Catégorie', 'categorie'),
    C.txt('N° de série / châssis', 'no_serie_chassis'), C.num('Quantité', 'quantite'), C.txt('Bénéficiaire', 'nom_beneficiaire'),
    C.txt('Contact', 'contact_beneficiaire'), C.txt('Fonction', 'fonction'), C.txt('PR / SR', 'pr_sr', 14),
    C.txt('Usage', 'usage', 26), C.etat, C.txt('Description', 'description', 30), C.txt('Opérateur', 'operateur'),
  ], d.sorties);

  addSheet(wb, 'Traçabilité', [
    C.date('date'), { header: 'Type', key: 'type', width: 10, map: (v) => (v === 'entree' ? 'Entrée' : 'Sortie') }, C.lot,
    C.txt('Désignation', 'designation', 26), C.txt('Catégorie', 'categorie'), C.num('Quantité', 'quantite'),
    C.txt('PR / SR', 'pr_sr', 14), C.txt('Bénéficiaire', 'beneficiaire'), C.txt('Opérateur', 'operateur'),
  ], d.trace);

  const r = d.recap;
  const recapRows = [
    { rubrique: 'Valeur totale du stock', categorie: '', quantite: '', valeur: r.valeur_totale_stock },
    { rubrique: 'Machines fonctionnelles', categorie: '', quantite: r.etat_machines.fonctionnel, valeur: '' },
    { rubrique: 'Machines non fonctionnelles', categorie: '', quantite: r.etat_machines.non_fonctionnel, valeur: '' },
    ...r.categories.map((c) => ({ rubrique: 'Par catégorie', categorie: c.nom, quantite: c.quantite_totale, valeur: c.valeur })),
  ];
  addSheet(wb, 'Récapitulatif', [
    C.txt('Rubrique', 'rubrique', 30), C.txt('Catégorie', 'categorie', 30), C.num('Quantité', 'quantite'), C.num('Valeur', 'valeur'),
  ], recapRows);

  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return finish(`export-logistique-${day()}.xlsx`, bytes, 'Excel', 'Dashboard');
}

/** Export d'une liste filtrée (Entrées, Sorties, Traçabilité) en une feuille Excel. */
export async function exportListExcel({ sheet, columns, rows, module, filename }) {
  const ExcelJS = await excelLib();
  const wb = new ExcelJS.Workbook();
  wb.creator = session.user?.nom || 'Logistique';
  addSheet(wb, sheet, columns, rows);
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return finish(`${filename}-${day()}.xlsx`, bytes, 'Excel', module);
}

// ------------------------------------------------------------------ PDF

const ellipsize = (doc, text, width) => {
  let t = String(text ?? '');
  if (doc.getTextWidth(t) <= width) return t;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > width) t = t.slice(0, -1);
  return `${t}…`;
};

function pdfTable(doc, columns, rows, startY, margin = 10) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const avail = pageW - margin * 2;
  doc.setFontSize(8);
  const natural = columns.map((c) => Math.min(60, Math.max(14, Math.max(c.header.length, ...rows.slice(0, 200).map((r) => String(r[c.key] ?? '').length)) * 1.9)));
  const k = avail / natural.reduce((a, b) => a + b, 0);
  const widths = natural.map((w) => w * k);
  let y = startY;

  const header = () => {
    doc.setFillColor(23, 53, 44);
    doc.rect(margin, y, avail, 7, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    let x = margin;
    columns.forEach((c, i) => {
      doc.text(ellipsize(doc, c.header, widths[i] - 2), x + 1, y + 4.8);
      x += widths[i];
    });
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    y += 7;
  };
  header();

  rows.forEach((r, n) => {
    if (y + 6 > pageH - 14) {
      doc.addPage();
      y = 12;
      header();
    }
    if (n % 2) {
      doc.setFillColor(238, 243, 240);
      doc.rect(margin, y, avail, 6, 'F');
    }
    let x = margin;
    columns.forEach((c, i) => {
      const v = c.map ? c.map(r[c.key], r) : r[c.key];
      const text = ellipsize(doc, v ?? '', widths[i] - 2);
      if (c.align === 'right') doc.text(text, x + widths[i] - 1, y + 4.2, { align: 'right' });
      else doc.text(text, x + 1, y + 4.2);
      x += widths[i];
    });
    y += 6;
  });
  return y;
}

function pageNumbers(doc) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(`Page ${i} / ${n}`, doc.internal.pageSize.getWidth() - 10, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
    doc.text(`${session.user?.nom ?? ''} — ${session.user?.structure_nom ?? ''}`, 10, doc.internal.pageSize.getHeight() - 6);
  }
}

/** Export PDF d'une liste filtrée (paysage). */
export async function exportListPdf({ title, subtitle = '', columns, rows, module, filename }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, 10, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`${subtitle ? `${subtitle} — ` : ''}généré le ${fmtDate(new Date().toISOString())} — ${rows.length} ligne(s)`, 10, 20);
  doc.setTextColor(0);
  pdfTable(doc, columns, rows, 25);
  pageNumbers(doc);
  return finish(`${filename}-${day()}.pdf`, new Uint8Array(doc.output('arraybuffer')), 'PDF', module);
}

async function signatureBase64(bon) {
  if (bon.signature_b64) return bon.signature_b64;
  if (bon.signature_path && session.token) {
    try {
      const res = await api.get(`/sorties/${bon.id}/signature`, { raw: true });
      return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
    } catch {
      return null;
    }
  }
  return null;
}

/** Bon de Sortie signé : fiche technique, n° de lot, PR/SR, bénéficiaire, opérateur, signature. */
export async function exportBonSortie(sortieId) {
  const bon = await getBon(sortieId);
  const sig = await signatureBase64(bon);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(23, 53, 44);
  doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('BON DE SORTIE', W / 2, 13, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Lot ${bon.numero_lot} — ${fmtDate(bon.date_sortie)}`, W / 2, 20, { align: 'center' });
  doc.setTextColor(0);

  const rows = [
    ['N° de lot', bon.numero_lot], ['Désignation', bon.designation], ['Catégorie', bon.categorie || ''],
    ['Marque / Modèle', bon.marque_modele || ''], ['N° de série / châssis', bon.no_serie_chassis || ''],
    ['Code bailleur / immatriculation', bon.code_bailleur_immatriculation || ''], ['Structure / service', bon.structure_service || ''],
    ['Quantité sortie', String(bon.quantite)], ['État de fonctionnement', etatLabel(bon.etat_fonctionnement)],
    ['Usage', bon.usage || ''], ['PR / SR', bon.pr_sr], ['Bénéficiaire', bon.nom_beneficiaire],
    ['Contact', bon.contact_beneficiaire || ''], ['Fonction', bon.fonction || ''],
    ['Description', bon.description || ''], ['Opérateur', bon.operateur_nom],
  ];
  let y = 36;
  doc.setFontSize(10);
  rows.forEach(([k, v]) => {
    doc.setDrawColor(150);
    doc.setFillColor(238, 243, 240);
    doc.rect(15, y, 62, 8, 'FD');
    doc.rect(77, y, W - 92, 8);
    doc.setFont('helvetica', 'bold');
    doc.text(k, 17, y + 5.4);
    doc.setFont('helvetica', 'normal');
    doc.text(ellipsize(doc, v, W - 96), 79, y + 5.4);
    y += 8;
  });

  y += 12;
  const bw = (W - 40) / 2;
  doc.setFont('helvetica', 'bold');
  doc.text('Signature du bénéficiaire', 15, y);
  doc.text('Opérateur', 25 + bw, y);
  doc.setFont('helvetica', 'normal');
  doc.rect(15, y + 3, bw, 38);
  doc.rect(25 + bw, y + 3, bw, 38);
  doc.setFontSize(9);
  doc.text(bon.operateur_nom, 27 + bw, y + 38);
  if (sig) doc.addImage(`data:image/png;base64,${sig}`, 'PNG', 17, y + 5, bw - 4, 30);
  else {
    doc.setTextColor(120);
    doc.text('Signature non disponible hors-ligne', 17, y + 22);
  }
  pageNumbers(doc);
  return finish(`bon-de-sortie-${slug(bon.numero_lot)}.pdf`, new Uint8Array(doc.output('arraybuffer')), 'PDF', 'Sorties');
}

/** Synthèse du Dashboard en PDF. */
export async function exportDashboardPdf(filters = {}) {
  const s = await summary(filters);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Synthèse du stock', 10, 15);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Valeur totale du stock : ${fmtMoney(s.valeur_totale_stock)}`, 10, 24);
  doc.text(`Machines fonctionnelles : ${s.etat_machines.fonctionnel}   —   non fonctionnelles : ${s.etat_machines.non_fonctionnel}`, 10, 30);
  let y = pdfTable(doc, [
    { header: 'Catégorie', key: 'nom' }, { header: 'Articles', key: 'nombre_articles', align: 'right' },
    { header: 'Quantité', key: 'quantite_totale', align: 'right' }, { header: 'Valeur', key: 'valeur', align: 'right', map: (v) => fmtMoney(v) },
  ], s.categories, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('100 derniers mouvements', 10, y + 10);
  doc.setFont('helvetica', 'normal');
  pdfTable(doc, [
    { header: 'Date', key: 'date', map: (v) => fmtDate(v) }, { header: 'Type', key: 'type', map: (v) => (v === 'entree' ? 'Entrée' : 'Sortie') },
    { header: 'N° de lot', key: 'numero_lot' }, { header: 'Désignation', key: 'designation' }, { header: 'Qté', key: 'quantite', align: 'right' },
  ], s.derniers_mouvements, y + 14);
  pageNumbers(doc);
  return finish(`synthese-${day()}.pdf`, new Uint8Array(doc.output('arraybuffer')), 'PDF', 'Dashboard');
}

// ------------------------------------------------------------------ Word

/** Synthèse du Dashboard en Word. */
export async function exportDashboardWord(filters = {}) {
  const s = await summary(filters);
  const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType, TextRun } = await import('docx');

  const cell = (text, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold })] })] });
  const table = (head, rows) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: head.map((h) => cell(h, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c)) }))],
  });

  const doc = new Document({
    creator: session.user?.nom || 'Logistique',
    sections: [{
      children: [
        new Paragraph({ text: 'Synthèse du stock', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `Généré le ${fmtDate(new Date().toISOString())} par ${session.user?.nom ?? ''} (${session.user?.structure_nom ?? ''})` }),
        new Paragraph({ text: `Valeur totale du stock : ${fmtMoney(s.valeur_totale_stock)}` }),
        new Paragraph({ text: `Machines fonctionnelles : ${s.etat_machines.fonctionnel} — non fonctionnelles : ${s.etat_machines.non_fonctionnel}` }),
        new Paragraph({ text: 'Stock par catégorie', heading: HeadingLevel.HEADING_2 }),
        table(['Catégorie', 'Articles', 'Quantité', 'Valeur'], s.categories.map((c) => [c.nom, c.nombre_articles, c.quantite_totale, fmtMoney(c.valeur)])),
        new Paragraph({ text: 'Derniers mouvements', heading: HeadingLevel.HEADING_2 }),
        table(['Date', 'Type', 'N° de lot', 'Désignation', 'Qté'],
          s.derniers_mouvements.slice(0, 30).map((m) => [fmtDate(m.date), m.type === 'entree' ? 'Entrée' : 'Sortie', m.numero_lot, m.designation, m.quantite])),
      ],
    }],
  });
  const blob = await Packer.toBlob(doc);
  return finish(`synthese-${day()}.docx`, new Uint8Array(await blob.arrayBuffer()), 'Word', 'Dashboard');
}

export { AppError };
