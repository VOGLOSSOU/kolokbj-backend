// Tests sans base de données : les règles de matching sont des fonctions pures
const { hardFilterFailures, compatibilityScore } = require('../services/matchingService');
const { normalizeBeninPhone, whatsappLink } = require('../utils/phone');
const { profileRow } = require('./helpers/fixtures');

const host = (overrides = {}) =>
  profileRow({
    situation: 'HAS_HOUSING',
    maxBudget: null,
    preferredNeighborhoods: [],
    housingNeighborhood: 'zogbadje',
    housingShareAsked: 13500,
    ...overrides,
  });

describe('filtres bloquants', () => {
  it('accepte deux profils compatibles', () => {
    expect(hardFilterFailures(profileRow(), host())).toEqual([]);
  });

  it('est symétrique', () => {
    const seeker = profileRow({ maxBudget: 10000 });
    expect(hardFilterFailures(seeker, host())).toEqual(hardFilterFailures(host(), seeker));
  });

  it('refuse une part de loyer au-dessus du budget', () => {
    expect(hardFilterFailures(profileRow({ maxBudget: 13000 }), host())).toEqual(['BUDGET']);
  });

  it('accepte une part de loyer égale au budget', () => {
    expect(hardFilterFailures(profileRow({ maxBudget: 13500 }), host())).toEqual([]);
  });

  it('refuse un logement hors des quartiers souhaités', () => {
    const elsewhere = host({ housingNeighborhood: 'togoudo' });
    expect(hardFilterFailures(profileRow(), elsewhere)).toEqual(['NEIGHBORHOOD']);
  });

  it('refuse deux profils qui ont chacun déjà un logement', () => {
    expect(hardFilterFailures(host(), host())).toContain('SITUATION');
  });

  it('refuse deux chercheurs aux budgets trop éloignés', () => {
    const small = profileRow({ maxBudget: 10000 });
    const big = profileRow({ maxBudget: 25000 });
    expect(hardFilterFailures(small, big)).toEqual(['BUDGET']);
    expect(hardFilterFailures(small, profileRow({ maxBudget: 20000 }))).toEqual([]);
  });

  it('refuse deux chercheurs sans quartier commun', () => {
    const other = profileRow({ preferredNeighborhoods: ['arconville'] });
    expect(hardFilterFailures(profileRow(), other)).toEqual(['NEIGHBORHOOD']);
  });

  it("respecte la préférence « même sexe uniquement », d'un côté comme de l'autre", () => {
    const woman = profileRow({ gender: 'FEMALE', genderPreference: 'SAME_ONLY' });
    const man = profileRow({ gender: 'MALE', genderPreference: 'ANY' });
    expect(hardFilterFailures(woman, man)).toEqual(['GENDER']);
    expect(hardFilterFailures(man, woman)).toEqual(['GENDER']);
    expect(hardFilterFailures(man, profileRow({ gender: 'FEMALE' }))).toEqual([]);
  });
});

describe('score de compatibilité', () => {
  it('vaut 100 pour deux rythmes de vie identiques', () => {
    expect(compatibilityScore(profileRow(), profileRow()).score).toBe(100);
  });

  it('vaut 0 pour deux rythmes de vie opposés', () => {
    const early = profileRow({ wakeTime: '05:00', sleepTime: '21:00', studyTime: 'DAY', guestsFrequency: 'NEVER', cleanliness: 5, smoker: false });
    const late = profileRow({ wakeTime: '11:00', sleepTime: '03:00', studyTime: 'NIGHT', guestsFrequency: 'OFTEN', cleanliness: 1, smoker: true });
    expect(compatibilityScore(early, late).score).toBe(0);
  });

  it('est symétrique et détaille les points par critère', () => {
    const a = profileRow();
    const b = profileRow({ sleepTime: '01:00', cleanliness: 2, studyTime: 'FLEXIBLE' });
    const result = compatibilityScore(a, b);

    expect(result.score).toBe(compatibilityScore(b, a).score);
    expect(result.breakdown.reduce((total, item) => total + item.max, 0)).toBe(100);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(100);
  });

  it("mesure l'écart d'horaire en passant par minuit", () => {
    const a = profileRow({ sleepTime: '23:30' });
    const b = profileRow({ sleepTime: '00:30' });
    const sleep = compatibilityScore(a, b).breakdown.find((item) => item.criterion === 'sleepTime');
    // 1 h d'écart sur 4 h tolérées : 75 % des 20 points
    expect(sleep.points).toBe(15);
  });
});

describe('numéros béninois', () => {
  it.each([
    ['0197000000', '+2290197000000'],
    ['01 97 00 00 00', '+2290197000000'],
    ['+229 01 97 00 00 00', '+2290197000000'],
    ['002290197000000', '+2290197000000'],
    ['2290197000000', '+2290197000000'],
    ['97000000', '+2290197000000'],
    ['+229 97 00 00 00', '+2290197000000'],
  ])('normalise %s', (input, expected) => {
    expect(normalizeBeninPhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '12345', '+33612345678', '019700000', '0297000000', null])(
    'refuse %s',
    (input) => {
      expect(normalizeBeninPhone(input)).toBeNull();
    },
  );

  it('construit le lien WhatsApp', () => {
    expect(whatsappLink('+2290197000000')).toBe('https://wa.me/2290197000000');
  });
});
