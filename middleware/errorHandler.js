const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const AppError = require('../utils/AppError');

// Toutes les erreurs sortent au même format : { message, code, details? }.
// Le front affiche `message` tel quel et peut tester `code`.

function notFound(req, res) {
  res.status(404).json({
    message: `Route introuvable : ${req.method} ${req.originalUrl}`,
    code: 'ROUTE_NOT_FOUND',
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res
      .status(err.status)
      .json({ message: err.message, code: err.code, details: err.details });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      message: 'Certaines informations sont invalides.',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'Cette valeur est déjà utilisée.', code: 'CONFLICT' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Introuvable.', code: 'NOT_FOUND' });
    }
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'JSON invalide.', code: 'INVALID_JSON' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Requête trop volumineuse.', code: 'PAYLOAD_TOO_LARGE' });
  }

  console.error(err);
  return res.status(500).json({
    message: 'Une erreur est survenue. Réessaie dans un instant.',
    code: 'INTERNAL_ERROR',
  });
}

module.exports = { notFound, errorHandler };
