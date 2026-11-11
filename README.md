# Kolok - backend

API Express de Kolok : mise en relation d'étudiants béninois pour la colocation. Le cahier des charges du MVP est dans [kolokBJ.pdf](kolokBJ.pdf), le front dans le dépôt `kolok`.

Stack : Node 20+, Express 5, PostgreSQL + Prisma 7, Zod, JWT, Google Identity Services, Web Push.

## Démarrer

```bash
npm install                # lance aussi prisma generate
cp .env.example .env       # puis remplir les valeurs
npm run db:migrate         # crée les tables
npm run dev
```

| Commande             | Rôle                                                     |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Serveur avec rechargement automatique                    |
| `npm start`          | Serveur                                                  |
| `npm run start:prod` | Applique les migrations puis démarre (Railway)           |
| `npm run db:migrate` | Crée une migration après une modification du schéma     |
| `npm run db:studio`  | Explorer la base dans le navigateur                      |
| `npm test`           | Tests                                                    |

### Tests

`npm test` lance les tests du matching (sans base). Les tests d'intégration (le parcours complet, de la connexion à la coloc confirmée) ont besoin d'une base **dédiée, vidée à chaque lancement** :

```bash
DATABASE_URL=postgresql://.../kolok_test npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://.../kolok_test npm test
```

Ils ne touchent jamais à `DATABASE_URL`. Sans `TEST_DATABASE_URL`, ils sont ignorés.

## Déploiement Railway

- Service Postgres + service Node relié à ce dépôt. `DATABASE_URL` vient de la variable du service Postgres (réseau privé).
- Commande de démarrage : `npm run start:prod`.
- Renseigner toutes les variables de `.env.example`. `JWT_SECRET` et `HASH_SECRET` : `openssl rand -hex 32`. **Ne jamais changer `HASH_SECRET`** une fois en production, sinon les bannis ne sont plus reconnus.
- `CORS_ORIGINS` : l'adresse du front (Vercel / Netlify).

## Authentification

Le front et l'API sont sur deux domaines différents : pas de cookie, la session est un **JWT** envoyé dans l'en-tête `Authorization: Bearer <token>`.

1. Le front obtient un ID token Google (Google Identity Services) et appelle `POST /api/auth/google` avec `{ credential }`.
2. L'API vérifie le token, crée le compte à la première connexion et répond `{ token, user }`.
3. Le front garde le `token` (localStorage) et l'envoie à chaque appel. Durée de vie : `JWT_EXPIRES_IN` (30 jours).
4. Déconnexion : le front oublie le token. Une réponse `401` veut dire « plus de session ».

Le statut du compte est relu en base à chaque requête : un bannissement prend effet tout de suite, sans attendre l'expiration du token.

Les admins sont les adresses Google listées dans `ADMIN_EMAILS`.

## Règles métier

**Statuts du profil** (`profileStatus`) : `null` (profil pas encore rempli), `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED`, `BANNED`. Seuls les `APPROVED` voient les autres et sont vus.

- Modifier son prénom, sa photo, son sexe ou ses études sur un profil validé le renvoie en validation (un agent ne peut pas se faire valider puis changer d'identité). Le budget, les quartiers ou le rythme de vie se modifient librement.
- `SUSPENDED` est temporaire, `BANNED` est définitif. « Rétablir » remet le compte dans son état d'avant la sanction.

**Filtres bloquants du matching** (symétriques : si A voit B, B voit A) :

- Deux profils qui ont chacun un logement ne sont jamais proposés l'un à l'autre.
- Logement + chercheur : la part demandée doit être inférieure ou égale au budget du chercheur, et le logement dans un de ses quartiers.
- Deux chercheurs : au moins un quartier en commun, et le plus petit budget au moins égal à la moitié du plus grand (`MATCHING.seekersBudgetRatio`).
- « Même sexe uniquement », d'un côté ou de l'autre, s'applique aux deux.
- Les profils signalés (dans un sens ou dans l'autre) et ceux sortis de la recherche ne sont pas proposés.

**Score sur 100** (rythme de vie) : coucher 20, propreté 20, réveil 15, révisions jour / nuit 15, invités 15, fumeur 15. Les poids sont dans [config/constants.js](config/constants.js).

**Mise en relation** : 10 demandes envoyées par 24 h glissantes. Un refus est définitif dans ce sens (l'autre peut toujours proposer). Les numéros WhatsApp ne sont dévoilés qu'après acceptation.

**Coloc confirmée** : 7 jours après l'acceptation, `coloc.askNow` passe à `true` sur la demande et une notification est envoyée (tâche horaire). Quand les **deux** répondent oui, la coloc est comptée, les deux profils sortent de la recherche et leurs demandes en attente sont closes. Un « non » ne compte rien.

**Suppression de compte** : efface tout (profil, demandes, signalements). Si le compte était banni, seules les empreintes HMAC du compte Google, de l'email et du numéro restent, pour bloquer une réinscription.

**Photos** : l'API ne stocke pas de fichier, seulement l'URL https de la photo (`photoUrl`). Les champs de vérification d'identité V2 (`idDocumentUrl`, `studentCardUrl`, `selfieUrl`, `npiHash`...) existent en base, vides.

## Contrat d'API

Toutes les routes sont sous `/api`. Les erreurs ont toujours la forme `{ message, code, details? }` : `message` est affichable tel quel, `code` est stable et testable (`VALIDATION_ERROR`, `PROFILE_NOT_APPROVED`, `DAILY_LIMIT_REACHED`...). En cas de `VALIDATION_ERROR`, `details` liste `{ field, message }`.

### Public

| Méthode | Route                 | Rôle                                                                     |
| ------- | --------------------- | ------------------------------------------------------------------------ |
| GET     | `/health`             | Santé                                                                    |
| GET     | `/meta`               | Listes des formulaires : quartiers, types de logement, motifs de signalement... |
| GET     | `/push/public-key`    | Clé VAPID pour s'abonner aux notifications                               |
| POST    | `/auth/google`        | `{ credential }` → `{ token, user }`                                     |

### Session et inscription

| Méthode | Route                  | Accès                       | Rôle                                                  |
| ------- | ---------------------- | --------------------------- | ----------------------------------------------------- |
| GET     | `/auth/me`             | connecté (même banni)       | `SessionUser`                                         |
| POST    | `/auth/logout`         | -                           | `204`, rien côté serveur                              |
| POST    | `/me/onboarding`       | connecté                    | `{ whatsapp, acceptedTerms: true }` → `SessionUser`   |
| GET     | `/me/profile`          | connecté                    | Son profil                                            |
| PUT     | `/me/profile`          | numéro + conditions faits   | Crée / remplace le profil → `{ user, profile }`       |
| PATCH   | `/me/profile/searching`| validé                      | `{ searching }` : sortir de la recherche ou y revenir |
| DELETE  | `/me`                  | connecté                    | Supprime le compte et ses données                     |
| POST    | `/push/subscriptions`  | connecté                    | Abonnement push de l'appareil (`PushSubscription.toJSON()`) |
| DELETE  | `/push/subscriptions`  | connecté                    | `{ endpoint }`                                        |

Corps de `PUT /me/profile` :

```jsonc
{
  "firstName": "Koffi",
  "photoUrl": "https://...",          // https obligatoire
  "age": 20,
  "gender": "MALE",                   // MALE | FEMALE
  "isStudent": true,                  // false : université / filière / année facultatives
  "university": "UAC", "campus": "Abomey-Calavi", "fieldOfStudy": "Informatique", "studyYear": "L2",
  "situation": "SEEKING",             // SEEKING | HAS_HOUSING
  "housing": {                        // obligatoire si HAS_HOUSING, ignoré sinon
    "neighborhood": "zogbadje", "type": "CHAMBRE_SALON",
    "totalRent": 27000, "shareAsked": 13500, "availableFrom": "2026-12-01"
  },
  "maxBudget": 15000,                 // obligatoire si SEEKING, en FCFA
  "preferredNeighborhoods": ["zogbadje", "tankpe"], // obligatoire si SEEKING, ids de /meta
  "genderPreference": "SAME_ONLY",    // SAME_ONLY | ANY
  "lifestyle": {
    "wakeTime": "06:30", "sleepTime": "23:00",
    "studyTime": "NIGHT",             // DAY | NIGHT | FLEXIBLE
    "guestsFrequency": "RARELY",      // NEVER | RARELY | SOMETIMES | OFTEN
    "cleanliness": 4,                 // 1 à 5
    "smoker": false
  },
  "bio": "..."
}
```

### L'appli (profil validé)

| Méthode | Route                          | Rôle                                                                 |
| ------- | ------------------------------ | -------------------------------------------------------------------- |
| GET     | `/matches`                     | Profils compatibles triés par score. Filtres : `neighborhood`, `maxBudget`, `hasHousing`, `page`, `limit` |
| GET     | `/profiles/:userId`            | Détail d'un profil : `score`, `breakdown` par critère, `connection`, `canRequest` |
| GET     | `/requests`                    | Mes demandes (`direction=sent\|received`, `status`) + `quota` restant |
| POST    | `/requests`                    | `{ toUserId, message? }` : proposer une coloc                        |
| POST    | `/requests/:id/accept`         | Accepter (destinataire) : dévoile les numéros                        |
| POST    | `/requests/:id/decline`        | Refuser (destinataire)                                               |
| DELETE  | `/requests/:id`                | Annuler une demande envoyée en attente                               |
| POST    | `/requests/:id/coloc-answer`   | `{ inColoc }` : réponse à « Vous êtes en coloc ? »                   |
| POST    | `/reports`                     | `{ userId, reason, details? }` : signaler un profil                  |

Une demande renvoyée par l'API contient `contact: { whatsapp, whatsappLink }` une fois acceptée (sinon `null`), et `coloc: { askNow, myAnswer, confirmed }`.

### Back-office (admins)

| Méthode | Route                          | Rôle                                                          |
| ------- | ------------------------------ | ------------------------------------------------------------- |
| GET     | `/admin/users?status=PENDING`  | File de validation (plus anciens d'abord) ou liste par statut |
| GET     | `/admin/users/:id`             | Fiche : profil, numéro, signalements reçus, historique admin  |
| POST    | `/admin/users/:id/approve`     | Valider                                                       |
| POST    | `/admin/users/:id/reject`      | `{ reason }` : rejeter, le motif est montré à l'étudiant      |
| POST    | `/admin/users/:id/suspend`     | `{ reason }`                                                  |
| POST    | `/admin/users/:id/ban`         | `{ reason }` : définitif                                      |
| POST    | `/admin/users/:id/restore`     | Rétablir                                                      |
| GET     | `/admin/reports?status=OPEN`   | File des signalements, avec le nombre de signalements du compte |
| POST    | `/admin/reports/:id/resolve`   | `{ note? }`                                                   |
| POST    | `/admin/reports/:id/dismiss`   | `{ note? }`                                                   |
| GET     | `/admin/stats`                 | Entonnoir : inscrits, validés, demandes, acceptées, colocs    |
| GET     | `/admin/actions`               | Journal des actions admin                                     |

## Organisation

```
config/       variables d'environnement, constantes métier (quartiers, poids du score, limites)
controllers/  une fonction par route
services/     matching, mises en relation, bannissement, Google, JWT, Web Push
middleware/   authentification et droits, validation Zod, erreurs, limites de débit
validators/   schémas Zod des requêtes
jobs/         tâche planifiée (relance J+7)
prisma/       schéma et migrations
tests/        matching (sans base) et parcours complet (avec base)
```
