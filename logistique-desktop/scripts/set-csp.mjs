// Fixe l'adresse EXACTE de l'API dans la politique de sécurité (CSP) avant de construire l'installateur.
// Usage :  npm run set-csp -- https://api.votre-domaine.example
// En développement la CSP autorise http(s)://*.test (Laravel Herd) et le serveur Vite ; en production, seule l'API l'est.
import { readFileSync, writeFileSync } from 'node:fs';

const origin = process.argv[2];
if (!origin || !/^https:\/\/[^/\s]+$/.test(origin)) {
  console.error("Usage : npm run set-csp -- https://api.votre-domaine.example   (HTTPS obligatoire, sans chemin)");
  process.exit(1);
}

const file = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const conf = JSON.parse(readFileSync(file, 'utf8'));
const csp = conf.app.security.csp
  .split(';')
  .map((d) => d.trim())
  .filter(Boolean)
  .map((d) => (d.startsWith('connect-src') ? `connect-src 'self' ipc: http://ipc.localhost ${origin}` : d))
  .join('; ');

conf.app.security.csp = csp;
writeFileSync(file, `${JSON.stringify(conf, null, 2)}\n`);
console.log(`CSP mise à jour : connect-src limité à ${origin}`);
