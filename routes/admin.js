const { Router } = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireActive, requireAdmin } = require('../middleware/auth');
const admin = require('../controllers/adminController');
const schemas = require('../validators/admin');

const router = Router();

// Réservé aux admins, quel que soit l'état de leur propre profil colocataire
router.use(authenticate, requireActive, requireAdmin);

router.get('/stats', admin.stats);
router.get('/actions', validate(schemas.actionsQuery, 'query'), admin.listActions);

router.get('/users', validate(schemas.usersQuery, 'query'), admin.listUsers);
router.get('/users/:id', admin.showUser);
router.post('/users/:id/approve', admin.approve);
router.post('/users/:id/reject', validate(schemas.reason), admin.reject);
router.post('/users/:id/suspend', validate(schemas.reason), admin.suspend);
router.post('/users/:id/ban', validate(schemas.reason), admin.ban);
router.post('/users/:id/restore', admin.restore);

router.get('/reports', validate(schemas.reportsQuery, 'query'), admin.listReports);
router.post('/reports/:id/resolve', validate(schemas.closeReport), admin.resolveReport);
router.post('/reports/:id/dismiss', validate(schemas.closeReport), admin.dismissReport);

module.exports = router;
