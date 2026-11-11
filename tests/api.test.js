/*
 * Tests d'intégration : le parcours du cahier des charges, de la connexion à la coloc confirmée,
 * sur une vraie base PostgreSQL. Ils tournent seulement si TEST_DATABASE_URL est définie
 * (base dédiée, VIDÉE à chaque lancement), après `prisma migrate deploy` sur cette base.
 * Seule la vérification du token Google est simulée.
 */
jest.mock('../services/googleService', () => ({
  // Le "credential" de test sert directement d'identité : login('koffi') = koffi@test.dev
  verifyGoogleCredential: jest.fn(async (credential) => ({
    sub: `google-${credential}`,
    email: `${credential}@test.dev`,
    firstName: credential,
  })),
}));

const request = require('supertest');
const app = require('../app');
const prisma = require('../lib/prisma');
const { sendColocFollowUps } = require('../jobs/scheduler');
const { seekerInput, hostInput } = require('./helpers/fixtures');

const describeWithDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const api = (token) => {
  const call = (method) => (path) => {
    const req = request(app)[method](`/api${path}`);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  return { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete') };
};

async function login(name) {
  const res = await api().post('/auth/google').send({ credential: name });
  expect(res.status).toBe(200);
  return { ...api(res.body.token), id: res.body.user.id, token: res.body.token };
}

let phoneCounter = 0;

/** Compte connecté, numéro WhatsApp renseigné, profil soumis (donc en attente). */
async function signUp(name, profile) {
  const user = await login(name);
  phoneCounter += 1;
  const whatsapp = `01970000${String(phoneCounter).padStart(2, '0')}`;
  expect((await user.post('/me/onboarding').send({ whatsapp, acceptedTerms: true })).status).toBe(200);
  expect((await user.put('/me/profile').send(profile)).status).toBe(200);
  return user;
}

/** Compte dont le profil est validé par l'admin. */
async function signUpApproved(admin, name, profile) {
  const user = await signUp(name, profile);
  expect((await admin.post(`/admin/users/${user.id}/approve`)).status).toBe(200);
  return user;
}

describeWithDb('API Kolok', () => {
  let admin;

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "User", "Colocation", "BannedIdentity", "AdminAction" RESTART IDENTITY CASCADE',
    );
    phoneCounter = 0;
    admin = await login('admin');
  });

  afterAll(() => prisma.$disconnect());

  describe('session', () => {
    it('refuse une requête sans token', async () => {
      const res = await api().get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('refuse un token invalide', async () => {
      const res = await api('nimporte-quoi').get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('SESSION_EXPIRED');
    });

    it('crée le compte à la première connexion et le retrouve à la suivante', async () => {
      const first = await login('koffi');
      const again = await login('koffi');
      expect(again.id).toBe(first.id);

      const res = await first.get('/auth/me');
      expect(res.body).toEqual({
        id: first.id,
        email: 'koffi@test.dev',
        role: 'USER',
        firstName: 'koffi',
        photoUrl: null,
        whatsapp: null,
        termsAcceptedAt: null,
        profileStatus: null,
        rejectionReason: null,
      });
    });

    it('donne le rôle ADMIN aux adresses de ADMIN_EMAILS', async () => {
      expect((await admin.get('/auth/me')).body.role).toBe('ADMIN');
    });
  });

  describe('inscription', () => {
    it('normalise le numéro WhatsApp et enregistre les conditions', async () => {
      const koffi = await login('koffi');
      const res = await koffi.post('/me/onboarding').send({ whatsapp: '97 00 00 01', acceptedTerms: true });
      expect(res.status).toBe(200);
      expect(res.body.whatsapp).toBe('+2290197000001');
      expect(res.body.termsAcceptedAt).not.toBeNull();
    });

    it('refuse un numéro invalide ou des conditions non acceptées', async () => {
      const koffi = await login('koffi');
      const bad = await koffi.post('/me/onboarding').send({ whatsapp: '12345', acceptedTerms: true });
      expect(bad.status).toBe(400);
      expect(bad.body.details[0].field).toBe('whatsapp');

      const noTerms = await koffi.post('/me/onboarding').send({ whatsapp: '0197000001', acceptedTerms: false });
      expect(noTerms.status).toBe(400);
    });

    it('refuse un numéro WhatsApp déjà pris par un autre compte', async () => {
      const koffi = await login('koffi');
      const arsene = await login('arsene');
      await koffi.post('/me/onboarding').send({ whatsapp: '0197000001', acceptedTerms: true });

      const res = await arsene.post('/me/onboarding').send({ whatsapp: '+229 01 97 00 00 01', acceptedTerms: true });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('WHATSAPP_TAKEN');
    });

    it('refuse le profil tant que le numéro WhatsApp manque', async () => {
      const koffi = await login('koffi');
      const res = await koffi.put('/me/profile').send(seekerInput());
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ONBOARDING_REQUIRED');
    });

    it('valide le contenu du profil', async () => {
      const koffi = await login('koffi');
      await koffi.post('/me/onboarding').send({ whatsapp: '0197000001', acceptedTerms: true });

      const fieldsOf = async (profile) => {
        const res = await koffi.put('/me/profile').send(profile);
        expect(res.status).toBe(400);
        return res.body.details.map((d) => d.field);
      };

      expect(await fieldsOf(seekerInput({ photoUrl: 'http://pas-https.dev/a.jpg', preferredNeighborhoods: ['paris'] })))
        .toEqual(expect.arrayContaining(['photoUrl', 'preferredNeighborhoods.0']));
      // Les règles qui dépendent de la situation ne tournent qu'une fois les champs de base valides
      expect(await fieldsOf(seekerInput({ maxBudget: undefined, university: null })))
        .toEqual(expect.arrayContaining(['maxBudget', 'university']));
      expect(await fieldsOf(hostInput({ housing: { ...hostInput().housing, shareAsked: 30000 } })))
        .toEqual(['housing.shareAsked']);
    });

    it("met le profil en attente, sans accès aux autres profils avant validation", async () => {
      const koffi = await signUp('koffi', seekerInput());

      const session = (await koffi.get('/auth/me')).body;
      expect(session.profileStatus).toBe('PENDING');
      expect(session.firstName).toBe('Koffi');
      expect(session.photoUrl).toBe('https://photos.test.dev/koffi.webp');

      const res = await koffi.get('/matches');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('PROFILE_NOT_APPROVED');
    });
  });

  describe('validation par un admin', () => {
    it('réserve le back-office aux admins', async () => {
      const koffi = await signUp('koffi', seekerInput());
      expect((await koffi.get('/admin/users')).status).toBe(403);
      expect((await koffi.post(`/admin/users/${koffi.id}/approve`)).status).toBe(403);
    });

    it('liste la file, valide, et journalise', async () => {
      const koffi = await signUp('koffi', seekerInput());

      const queue = (await admin.get('/admin/users')).body;
      expect(queue.total).toBe(1);
      expect(queue.items[0]).toMatchObject({ id: koffi.id, email: 'koffi@test.dev', whatsapp: '+2290197000001' });

      expect((await admin.post(`/admin/users/${koffi.id}/approve`)).body.profileStatus).toBe('APPROVED');
      expect((await koffi.get('/auth/me')).body.profileStatus).toBe('APPROVED');
      expect((await admin.post(`/admin/users/${koffi.id}/approve`)).status).toBe(409);

      const journal = (await admin.get('/admin/actions')).body;
      expect(journal.items[0]).toMatchObject({
        action: 'APPROVE_PROFILE',
        admin: { email: 'admin@test.dev' },
        targetUser: { email: 'koffi@test.dev' },
      });
    });

    it('rejette avec un motif, que le profil corrigé efface', async () => {
      const koffi = await signUp('koffi', seekerInput());

      expect((await admin.post(`/admin/users/${koffi.id}/reject`).send({})).status).toBe(400);
      await admin.post(`/admin/users/${koffi.id}/reject`).send({ reason: 'La photo ne permet pas de te reconnaître.' });

      const rejected = (await koffi.get('/auth/me')).body;
      expect(rejected.profileStatus).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('La photo ne permet pas de te reconnaître.');

      const fixed = await koffi.put('/me/profile').send(seekerInput({ photoUrl: 'https://photos.test.dev/koffi-2.webp' }));
      expect(fixed.body.user.profileStatus).toBe('PENDING');
      expect(fixed.body.user.rejectionReason).toBeNull();
    });

    it("renvoie en validation un profil validé dont l'identité change, pas le reste", async () => {
      const koffi = await signUpApproved(admin, 'koffi', seekerInput());

      const budget = await koffi.put('/me/profile').send(seekerInput({ maxBudget: 18000 }));
      expect(budget.body.user.profileStatus).toBe('APPROVED');

      const photo = await koffi.put('/me/profile').send(seekerInput({ photoUrl: 'https://photos.test.dev/autre.webp' }));
      expect(photo.body.user.profileStatus).toBe('PENDING');
    });
  });

  describe('matching', () => {
    it('propose les profils compatibles triés par score, sans numéro ni email', async () => {
      const koffi = await signUpApproved(admin, 'koffi', seekerInput());
      const arsene = await signUpApproved(admin, 'arsene', hostInput());
      const noctambule = await signUpApproved(
        admin,
        'noctambule',
        hostInput({ firstName: 'Luc', lifestyle: { wakeTime: '11:00', sleepTime: '03:00', studyTime: 'DAY', guestsFrequency: 'OFTEN', cleanliness: 1, smoker: true } }),
      );
      // Écartés par les filtres bloquants
      await signUpApproved(admin, 'cher', hostInput({ firstName: 'Cher', housing: { ...hostInput().housing, totalRent: 40000, shareAsked: 20000 } }));
      await signUpApproved(admin, 'loin', hostInput({ firstName: 'Loin', housing: { ...hostInput().housing, neighborhood: 'togoudo' } }));
      await signUpApproved(admin, 'ama', hostInput({ firstName: 'Ama', gender: 'FEMALE', genderPreference: 'ANY' }));
      // Pas encore validé : invisible
      await signUp('attente', hostInput({ firstName: 'Attente' }));

      const res = await koffi.get('/matches');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.map((item) => item.profile.id)).toEqual([arsene.id, noctambule.id]);
      expect(res.body.items[0].score).toBe(100);
      expect(res.body.items[1].score).toBeLessThan(30);
      expect(res.body.items[0].connection).toBeNull();
      expect(res.body.items[0].profile.housing).toMatchObject({ neighborhood: 'zogbadje', shareAsked: 13500, availableFrom: '2026-12-01' });
      expect(JSON.stringify(res.body)).not.toMatch(/whatsapp|test\.dev"|229019/);
    });

    it('applique les filtres de la liste', async () => {
      const koffi = await signUpApproved(admin, 'koffi', seekerInput({ genderPreference: 'ANY' }));
      const arsene = await signUpApproved(admin, 'arsene', hostInput());
      const yao = await signUpApproved(admin, 'yao', seekerInput({ firstName: 'Yao', maxBudget: 12000, preferredNeighborhoods: ['tankpe'] }));

      const ids = async (query) => (await koffi.get(`/matches${query}`)).body.items.map((item) => item.profile.id).sort();

      expect(await ids('')).toEqual([arsene.id, yao.id].sort());
      expect(await ids('?hasHousing=true')).toEqual([arsene.id]);
      expect(await ids('?hasHousing=false')).toEqual([yao.id]);
      expect(await ids('?neighborhood=tankpe')).toEqual([yao.id]);
      expect(await ids('?maxBudget=12000')).toEqual([yao.id]);
      expect((await koffi.get('/matches?neighborhood=paris')).status).toBe(400);
    });

    it("cache le détail d'un profil incompatible", async () => {
      const koffi = await signUpApproved(admin, 'koffi', seekerInput());
      const arsene = await signUpApproved(admin, 'arsene', hostInput());
      const ama = await signUpApproved(admin, 'ama', hostInput({ firstName: 'Ama', gender: 'FEMALE', genderPreference: 'SAME_ONLY' }));

      const visible = await koffi.get(`/profiles/${arsene.id}`);
      expect(visible.status).toBe(200);
      expect(visible.body).toMatchObject({ score: 100, connection: null, canRequest: true });
      expect(visible.body.breakdown).toHaveLength(6);

      expect((await koffi.get(`/profiles/${ama.id}`)).status).toBe(404);
      expect((await koffi.get('/profiles/inconnu')).status).toBe(404);
    });
  });

  describe('mise en relation', () => {
    let koffi;
    let arsene;

    beforeEach(async () => {
      koffi = await signUpApproved(admin, 'koffi', seekerInput());
      arsene = await signUpApproved(admin, 'arsene', hostInput());
    });

    it('ne dévoile les numéros WhatsApp qu\'après acceptation', async () => {
      const sent = await koffi.post('/requests').send({ toUserId: arsene.id, message: 'Salut, ta chambre m\'intéresse.' });
      expect(sent.status).toBe(201);
      expect(sent.body).toMatchObject({ direction: 'SENT', status: 'PENDING', contact: null, coloc: null });

      const inbox = (await arsene.get('/requests?direction=received')).body;
      expect(inbox.items).toHaveLength(1);
      expect(inbox.items[0]).toMatchObject({ direction: 'RECEIVED', message: 'Salut, ta chambre m\'intéresse.', contact: null });
      expect(inbox.items[0].profile.firstName).toBe('Koffi');

      // Seul le destinataire peut accepter
      expect((await koffi.post(`/requests/${sent.body.id}/accept`)).status).toBe(404);

      const accepted = await arsene.post(`/requests/${sent.body.id}/accept`);
      expect(accepted.status).toBe(200);
      expect(accepted.body.contact).toEqual({ whatsapp: '+2290197000001', whatsappLink: 'https://wa.me/2290197000001' });

      const mine = (await koffi.get('/requests')).body.items[0];
      expect(mine.status).toBe('ACCEPTED');
      expect(mine.contact.whatsapp).toBe('+2290197000002');
      expect(mine.coloc).toEqual({ askNow: false, myAnswer: null, confirmed: false });

      expect((await koffi.get('/matches')).body.items[0].connection).toMatchObject({ status: 'ACCEPTED', direction: 'SENT' });
    });

    it('refuse les doublons, les demandes à soi-même et aux profils incompatibles', async () => {
      const ama = await signUpApproved(admin, 'ama', hostInput({ firstName: 'Ama', gender: 'FEMALE', genderPreference: 'ANY' }));

      expect((await koffi.post('/requests').send({ toUserId: koffi.id })).status).toBe(400);
      expect((await koffi.post('/requests').send({ toUserId: ama.id })).status).toBe(404);
      expect((await koffi.post('/requests').send({ toUserId: arsene.id })).status).toBe(201);

      const again = await koffi.post('/requests').send({ toUserId: arsene.id });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe('REQUEST_ALREADY_SENT');

      const reverse = await arsene.post('/requests').send({ toUserId: koffi.id });
      expect(reverse.body.code).toBe('REQUEST_ALREADY_RECEIVED');
    });

    it("ne permet pas de relancer après un refus, mais permet à l'autre de proposer", async () => {
      const sent = await koffi.post('/requests').send({ toUserId: arsene.id });
      expect((await arsene.post(`/requests/${sent.body.id}/decline`)).body.status).toBe('DECLINED');

      expect((await koffi.post('/requests').send({ toUserId: arsene.id })).body.code).toBe('REQUEST_DECLINED');
      expect((await arsene.post('/requests').send({ toUserId: koffi.id })).status).toBe(201);
    });

    it('permet d\'annuler une demande en attente', async () => {
      const sent = await koffi.post('/requests').send({ toUserId: arsene.id });
      expect((await arsene.delete(`/requests/${sent.body.id}`)).status).toBe(404);
      expect((await koffi.delete(`/requests/${sent.body.id}`)).status).toBe(204);
      expect((await arsene.post(`/requests/${sent.body.id}/accept`)).status).toBe(404);
    });

    it('limite à 10 demandes par 24 h', async () => {
      const others = [];
      for (let i = 0; i < 10; i += 1) {
        others.push(await signUpApproved(admin, `hote${i}`, hostInput({ firstName: `Hote${i}` })));
      }
      for (const other of others) {
        expect((await koffi.post('/requests').send({ toUserId: other.id })).status).toBe(201);
      }
      expect((await koffi.get('/requests')).body.quota).toEqual({ limit: 10, remaining: 0 });

      const res = await koffi.post('/requests').send({ toUserId: arsene.id });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe('DAILY_LIMIT_REACHED');
    });

    it('confirme la coloc quand les deux répondent oui, et sort les profils de la recherche', async () => {
      const yao = await signUpApproved(admin, 'yao', seekerInput({ firstName: 'Yao' }));
      const other = await yao.post('/requests').send({ toUserId: arsene.id });

      const sent = await koffi.post('/requests').send({ toUserId: arsene.id });
      await arsene.post(`/requests/${sent.body.id}/accept`);

      // Sept jours plus tard, la question est posée
      await prisma.connectionRequest.update({
        where: { id: sent.body.id },
        data: { respondedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
      });
      expect(await sendColocFollowUps()).toBe(1);
      expect(await sendColocFollowUps()).toBe(0);
      expect((await koffi.get('/requests')).body.items[0].coloc.askNow).toBe(true);

      const first = await koffi.post(`/requests/${sent.body.id}/coloc-answer`).send({ inColoc: true });
      expect(first.body.coloc).toEqual({ askNow: false, myAnswer: true, confirmed: false });
      expect((await admin.get('/admin/stats')).body.colocations).toBe(0);

      const second = await arsene.post(`/requests/${sent.body.id}/coloc-answer`).send({ inColoc: true });
      expect(second.body.coloc).toEqual({ askNow: false, myAnswer: true, confirmed: true });

      expect((await admin.get('/admin/stats')).body).toMatchObject({
        registered: 4,
        approved: 3,
        requestsSent: 2,
        requestsAccepted: 1,
        colocations: 1,
      });
      expect((await koffi.get('/me/profile')).body.searching).toBe(false);
      // Arsène n'est plus proposé, et la demande en attente de Yao est close
      expect((await yao.get('/matches')).body.total).toBe(0);
      expect((await yao.get('/requests')).body.items.find((item) => item.id === other.body.id).status).toBe('DECLINED');
      expect((await koffi.post(`/requests/${sent.body.id}/coloc-answer`).send({ inColoc: false })).status).toBe(409);
    });

    it('ne compte pas la coloc si l\'un des deux répond non', async () => {
      const sent = await koffi.post('/requests').send({ toUserId: arsene.id });
      await arsene.post(`/requests/${sent.body.id}/accept`);
      await koffi.post(`/requests/${sent.body.id}/coloc-answer`).send({ inColoc: true });
      const res = await arsene.post(`/requests/${sent.body.id}/coloc-answer`).send({ inColoc: false });

      expect(res.body.coloc).toMatchObject({ myAnswer: false, confirmed: false });
      expect((await admin.get('/admin/stats')).body.colocations).toBe(0);
      expect((await koffi.get('/me/profile')).body.searching).toBe(true);
    });
  });

  describe('signalement et bannissement', () => {
    let koffi;
    let arsene;

    beforeEach(async () => {
      koffi = await signUpApproved(admin, 'koffi', seekerInput());
      arsene = await signUpApproved(admin, 'arsene', hostInput());
    });

    it('envoie le signalement dans la file des admins et masque le profil signalé', async () => {
      const report = await koffi.post('/reports').send({ userId: arsene.id, reason: 'AGENT', details: 'Demande des frais de visite.' });
      expect(report.status).toBe(201);
      expect((await koffi.post('/reports').send({ userId: arsene.id, reason: 'SCAM' })).body.code).toBe('ALREADY_REPORTED');
      expect((await koffi.post('/reports').send({ userId: koffi.id, reason: 'OTHER' })).status).toBe(400);

      expect((await koffi.get('/matches')).body.total).toBe(0);

      const queue = (await admin.get('/admin/reports')).body;
      expect(queue.items[0]).toMatchObject({
        reason: 'AGENT',
        reporter: { email: 'koffi@test.dev' },
        reported: { email: 'arsene@test.dev', firstName: 'Arsène', reportsCount: 1 },
      });

      const closed = await admin.post(`/admin/reports/${report.body.id}/resolve`).send({ note: 'Agent confirmé.' });
      expect(closed.body.status).toBe('RESOLVED');
      expect((await admin.post(`/admin/reports/${report.body.id}/dismiss`).send({})).status).toBe(404);
      expect((await admin.get('/admin/reports')).body.total).toBe(0);

      const file = (await admin.get(`/admin/users/${arsene.id}`)).body;
      expect(file.reports).toHaveLength(1);
      expect(file.history.map((h) => h.action)).toEqual(['RESOLVE_REPORT', 'APPROVE_PROFILE']);
    });

    it('bannit : plus aucun accès, même après suppression du compte et réinscription', async () => {
      const pending = await koffi.post('/requests').send({ toUserId: arsene.id });
      expect((await admin.post(`/admin/users/${arsene.id}/ban`).send({ reason: 'Agent immobilier.' })).body.profileStatus).toBe('BANNED');

      expect((await arsene.get('/auth/me')).body.profileStatus).toBe('BANNED');
      expect((await arsene.get('/matches')).body.code).toBe('ACCOUNT_BANNED');
      expect((await arsene.put('/me/profile').send(hostInput())).status).toBe(403);
      expect((await koffi.get('/matches')).body.total).toBe(0);
      expect((await koffi.get('/requests')).body.items.find((item) => item.id === pending.body.id)).toBeUndefined();

      // Il supprime son compte puis tente de revenir avec le même compte Google
      expect((await arsene.delete('/me')).status).toBe(204);
      expect((await arsene.get('/auth/me')).status).toBe(401);
      const back = await api().post('/auth/google').send({ credential: 'arsene' });
      expect(back.status).toBe(403);
      expect(back.body.code).toBe('ACCOUNT_BANNED');

      // ... ou avec un autre compte Google mais le même numéro WhatsApp
      const other = await login('arsene-bis');
      const reuse = await other.post('/me/onboarding').send({ whatsapp: '0197000002', acceptedTerms: true });
      expect(reuse.status).toBe(403);
      expect(reuse.body.code).toBe('ACCOUNT_BANNED');
    });

    it('suspend puis rétablit un compte dans son état précédent', async () => {
      await admin.post(`/admin/users/${arsene.id}/suspend`).send({ reason: 'Vérification en cours.' });
      expect((await arsene.get('/matches')).body.code).toBe('ACCOUNT_SUSPENDED');
      expect((await koffi.get('/matches')).body.total).toBe(0);

      expect((await admin.post(`/admin/users/${arsene.id}/restore`)).body.profileStatus).toBe('APPROVED');
      expect((await koffi.get('/matches')).body.total).toBe(1);
      expect((await admin.post(`/admin/users/${arsene.id}/restore`)).status).toBe(409);
    });

    it('lève le bannissement quand un admin rétablit le compte', async () => {
      await admin.post(`/admin/users/${arsene.id}/ban`).send({ reason: 'Erreur.' });
      await admin.post(`/admin/users/${arsene.id}/restore`);
      expect(await prisma.bannedIdentity.count()).toBe(0);
      expect((await arsene.get('/matches')).status).toBe(200);
    });

    it("refuse de sanctionner un admin", async () => {
      expect((await admin.post(`/admin/users/${admin.id}/ban`).send({ reason: 'x' })).status).toBe(403);
    });
  });

  describe('suppression de compte', () => {
    it('efface le compte et ses données, en gardant le compteur de colocs', async () => {
      const koffi = await signUpApproved(admin, 'koffi', seekerInput());
      const arsene = await signUpApproved(admin, 'arsene', hostInput());
      const sent = await koffi.post('/requests').send({ toUserId: arsene.id });
      await arsene.post(`/requests/${sent.body.id}/accept`);
      await koffi.post(`/requests/${sent.body.id}/coloc-answer`).send({ inColoc: true });
      await arsene.post(`/requests/${sent.body.id}/coloc-answer`).send({ inColoc: true });

      expect((await koffi.delete('/me')).status).toBe(204);

      expect(await prisma.user.count({ where: { email: 'koffi@test.dev' } })).toBe(0);
      expect(await prisma.profile.count({ where: { firstName: 'Koffi' } })).toBe(0);
      expect(await prisma.connectionRequest.count()).toBe(0);
      expect((await admin.get('/admin/stats')).body.colocations).toBe(1);
      // Non banni : il peut se réinscrire
      await login('koffi');
    });
  });

  describe('notifications push', () => {
    it("enregistre et retire l'abonnement d'un appareil", async () => {
      const koffi = await login('koffi');
      expect((await api().get('/push/public-key')).body).toEqual({ enabled: false, publicKey: null });

      const subscription = { endpoint: 'https://push.test.dev/abc', keys: { p256dh: 'cle', auth: 'secret' } };
      expect((await koffi.post('/push/subscriptions').send(subscription)).status).toBe(204);
      expect((await koffi.post('/push/subscriptions').send(subscription)).status).toBe(204);
      expect(await prisma.pushSubscription.count()).toBe(1);

      expect((await koffi.delete('/push/subscriptions').send({ endpoint: subscription.endpoint })).status).toBe(204);
      expect(await prisma.pushSubscription.count()).toBe(0);
    });
  });

  it('expose les listes de référence sans authentification', async () => {
    const res = await api().get('/meta');
    expect(res.status).toBe(200);
    expect(res.body.neighborhoods).toContainEqual({ id: 'zogbadje', label: 'Zogbadjè' });
    expect(res.body.dailyRequestLimit).toBe(10);
  });
});
