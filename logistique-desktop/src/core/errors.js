/** Erreur métier ou technique avec un code stable (affiché à l'utilisateur, testable). */
export class AppError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}
