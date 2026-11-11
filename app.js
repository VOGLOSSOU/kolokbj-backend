const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { env } = require('./config/env');
const routes = require('./routes');
const { globalLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { version } = require('./package.json');

const app = express();

app.disable('x-powered-by');
// Derrière le proxy de Railway : sans ça, toutes les requêtes auraient la même IP
app.set('trust proxy', 1);

app.use(helmet());
// La session voyage dans l'en-tête Authorization (JWT), pas dans un cookie :
// le front et l'API peuvent donc vivre sur deux domaines différents.
app.use(cors({ origin: env.corsOrigins, maxAge: 86400 }));
app.use(express.json({ limit: '100kb' }));
app.use(globalLimiter);

// Page d'accueil de l'API (ex. ouverture de l'URL dans un navigateur)
app.get('/', (req, res) => {
  res.json({ message: "Bienvenue sur l'API Kolok", statut: 'en ligne', version, sante: '/api/health' });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
