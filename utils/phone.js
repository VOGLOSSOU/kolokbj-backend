const COUNTRY_CODE = '229';

/**
 * Normalise un numéro béninois au format international +22901XXXXXXXX.
 * Accepte l'ancien format à 8 chiffres (97 00 00 00) et le nouveau à 10 chiffres
 * (01 97 00 00 00), avec ou sans indicatif. Renvoie null si le numéro n'est pas béninois.
 */
function normalizeBeninPhone(input) {
  if (typeof input !== 'string') return null;

  let digits = input.replace(/[\s.\-()]/g, '');
  let international = false;
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
    international = true;
  } else if (digits.startsWith('00')) {
    digits = digits.slice(2);
    international = true;
  }
  if (!/^\d+$/.test(digits)) return null;

  if (international) {
    if (!digits.startsWith(COUNTRY_CODE)) return null;
    digits = digits.slice(COUNTRY_CODE.length);
  } else if (digits.startsWith(COUNTRY_CODE) && (digits.length === 11 || digits.length === 13)) {
    digits = digits.slice(COUNTRY_CODE.length);
  }

  if (digits.length === 8 && !digits.startsWith('0')) digits = `01${digits}`;
  if (!/^01\d{8}$/.test(digits)) return null;

  return `+${COUNTRY_CODE}${digits}`;
}

/** Lien qui ouvre directement la discussion WhatsApp. */
function whatsappLink(phone) {
  return `https://wa.me/${phone.replace(/^\+/, '')}`;
}

module.exports = { normalizeBeninPhone, whatsappLink };
