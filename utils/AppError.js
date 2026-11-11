// Erreur métier "attendue" : son message est renvoyé tel quel au client.
// `code` est une étiquette stable que le front peut tester (le message, lui, peut changer).
class AppError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(400, message, code, details);
  }

  static unauthorized(message = 'Connecte-toi pour continuer.', code = 'UNAUTHENTICATED') {
    return new AppError(401, message, code);
  }

  static forbidden(message = "Tu n'as pas accès à cette action.", code = 'FORBIDDEN') {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Introuvable.', code = 'NOT_FOUND') {
    return new AppError(404, message, code);
  }

  static conflict(message, code = 'CONFLICT') {
    return new AppError(409, message, code);
  }

  static tooMany(message, code = 'TOO_MANY_REQUESTS') {
    return new AppError(429, message, code);
  }
}

module.exports = AppError;
