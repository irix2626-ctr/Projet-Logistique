/**
 * Faux serveur Laravel (sous-ensemble du contrat openapi.yaml) branché sur fetch :
 * suffit à tester la synchronisation et l'authentification sans réseau.
 */
export function installFakeServer() {
  const s = {
    down: false, status: null,
    users: [], seq: 0, log: [], ops: [], changes: [], files: [], devices: [],
    nextPushStatus: new Map(), // op_id -> { status, message }
    calls: [],
  };

  const json = (status, body) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body,
  });

  s.addChange = (table, record) => {
    s.seq += 1;
    s.changes.push({ table, record, server_seq: s.seq });
  };

  globalThis.fetch = async (url, init = {}) => {
    if (s.down) throw new TypeError('fetch failed');
    if (s.status) return json(s.status, { message: 'forcé', code: 'FORCE' });
    const u = new URL(url);
    const path = u.pathname.replace('/api/v1', '');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    s.calls.push({ method, path, headers: init.headers, body });

    if (path === '/auth/login') {
      const user = s.users.find((x) => x.structure_id === body.structure_id && x.identifiant === body.identifiant && x.password === body.mot_de_passe);
      if (!user) return json(422, { message: 'Identifiants invalides.', errors: { identifiant: ['Identifiants invalides.'] } });
      return json(200, { token: `tok-${user.id}-${++s.seq}`, user: { id: user.id, structure_id: user.structure_id, nom: user.nom, email: user.identifiant, role: user.role, must_change_password: false } });
    }
    if (path === '/devices') {
      let d = s.devices.find((x) => x.id === body.id);
      if (!d) { d = { id: body.id, nom: body.nom, code_poste: `P${String(s.devices.length + 1).padStart(2, '0')}` }; s.devices.push(d); }
      return json(201, { ...d, derniere_synchro: null });
    }
    if (path === '/sync/push') {
      const results = body.operations.map((op) => {
        s.ops.push(op);
        const forced = s.nextPushStatus.get(op.op_id);
        const r = forced || { status: 'accepted' };
        if (r.status === 'accepted' || r.status === 'conflict') s.seq += 1;
        return { op_id: op.op_id, status: r.status, server_seq: s.seq, conflict_id: r.status === 'conflict' ? 'c-1' : null, message: r.message ?? null };
      });
      return json(200, { results });
    }
    if (path === '/sync/pull') {
      const cursor = Number(u.searchParams.get('cursor'));
      const changes = s.changes.filter((c) => c.server_seq > cursor);
      return json(200, { changes, next_cursor: changes.length ? changes[changes.length - 1].server_seq : cursor, has_more: false });
    }
    if (path === '/sync/fichiers') {
      const f = init.body;
      const rattache = f.get('rattache_id');
      if (s.files.some((x) => x.rattache_id === rattache && x.type === f.get('type'))) return json(200, { chemin: 'dup' });
      s.files.push({ type: f.get('type'), rattache_id: rattache, sha256: f.get('sha256'), size: f.get('fichier').size });
      return json(200, { chemin: 'signatures/x.png' });
    }
    return json(404, { message: 'Introuvable.' });
  };
  return s;
}
