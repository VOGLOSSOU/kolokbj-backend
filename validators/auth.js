const { z, beninPhone } = require('./common');

const google = z.object({
  // ID token renvoyé par Google Identity Services
  credential: z.string().min(1),
});

const onboarding = z.object({
  whatsapp: beninPhone,
  acceptedTerms: z.literal(true, {
    error: "Tu dois accepter les conditions d'utilisation et la politique de confidentialité.",
  }),
});

module.exports = { google, onboarding };
