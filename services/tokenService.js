const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const ALGORITHM = 'HS256';

// Le jeton ne porte que l'identifiant : statut et rôle sont relus en base
// à chaque requête, donc un bannissement prend effet tout de suite.
function signSessionToken(user) {
  return jwt.sign({ sub: user.id }, env.jwtSecret, {
    algorithm: ALGORITHM,
    expiresIn: env.jwtExpiresIn,
  });
}

function verifySessionToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
}

module.exports = { signSessionToken, verifySessionToken };
