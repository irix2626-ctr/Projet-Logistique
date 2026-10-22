import { bytesToBase64 } from '../core/b64.js';

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Fichier choisi par l'utilisateur -> { nom, mime, taille, base64 } (format attendu par les services). */
export async function readFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { nom: file.name, mime: file.type, taille: file.size, base64: bytesToBase64(bytes) };
}

const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

/** Enregistre un fichier généré : boîte de dialogue « Enregistrer sous » (Tauri) ou téléchargement (navigateur). */
export async function saveBytes(name, bytes) {
  const ext = name.split('.').pop().toLowerCase();
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return null; // annulé
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    await writeFile(path, bytes);
    return path;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return name;
}
