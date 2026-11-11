const { Router } = require('express');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const {
  authenticate,
  requireActive,
  requireOnboarded,
  requireApproved,
} = require('../middleware/auth');
const auth = require('../controllers/authController');
const me = require('../controllers/meController');
const matches = require('../controllers/matchController');
const requests = require('../controllers/requestController');
const reports = require('../controllers/reportController');
const push = require('../controllers/pushController');
const meta = require('../controllers/metaController');
const authSchemas = require('../validators/auth');
const profileSchemas = require('../validators/profile');
const schemas = require('../validators/app');

const router = Router();

// ---------- Public ----------

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.get('/meta', meta.show);
router.get('/push/public-key', push.publicKey);
router.post('/auth/google', authLimiter, validate(authSchemas.google), auth.google);

// ---------- Session (accessible même banni : le front doit savoir quel écran afficher) ----------

router.get('/auth/me', authenticate, auth.me);
router.post('/auth/logout', auth.logout);
router.delete('/me', authenticate, me.deleteAccount);

// ---------- Parcours d'inscription ----------

const active = [authenticate, requireActive];
const onboarded = [...active, requireOnboarded];

router.post('/me/onboarding', active, validate(authSchemas.onboarding), me.onboarding);
router.get('/me/profile', active, me.getProfile);
router.put('/me/profile', onboarded, validate(profileSchemas.save), me.saveProfile);

router.post('/push/subscriptions', active, validate(schemas.pushSubscription), push.subscribe);
router.delete('/push/subscriptions', authenticate, validate(schemas.pushUnsubscribe), push.unsubscribe);

// ---------- L'appli : profils validés uniquement ----------

const approved = [...onboarded, requireApproved];

router.patch('/me/profile/searching', approved, validate(profileSchemas.searching), me.setSearching);

router.get('/matches', approved, validate(schemas.matchesQuery, 'query'), matches.list);
router.get('/profiles/:userId', approved, matches.show);

router.get('/requests', approved, validate(schemas.requestsQuery, 'query'), requests.list);
router.post('/requests', approved, validate(schemas.createRequest), requests.create);
router.post('/requests/:id/accept', approved, requests.accept);
router.post('/requests/:id/decline', approved, requests.decline);
router.delete('/requests/:id', approved, requests.cancel);
router.post('/requests/:id/coloc-answer', approved, validate(schemas.colocAnswer), requests.colocAnswer);

router.post('/reports', approved, validate(schemas.createReport), reports.create);

// ---------- Back-office ----------

router.use('/admin', require('./admin'));

module.exports = router;
