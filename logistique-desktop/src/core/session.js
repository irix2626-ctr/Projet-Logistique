import { AppError } from './errors.js';

/** Session courante (en mémoire seulement : jamais persistée). */
export const session = {
  user: null, // { id, structure_id, structure_nom, nom, identifiant, role, must_change_password }
  token: null,
  online: false,
};

export const isAdmin = () => session.user?.role === 'admin';

export function requireSession() {
  if (!session.user) throw new AppError('NON_CONNECTE', 'Vous devez être connecté.');
  return session.user;
}

export function clearSession() {
  session.user = null;
  session.token = null;
}
