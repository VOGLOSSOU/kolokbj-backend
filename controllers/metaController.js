const constants = require('../config/constants');

/** Listes de référence pour les formulaires du front (quartiers, types de logement...). */
async function show(req, res) {
  res.json({
    neighborhoods: constants.NEIGHBORHOODS,
    housingTypes: constants.HOUSING_TYPES,
    studyYears: constants.STUDY_YEARS,
    studyTimes: constants.STUDY_TIMES,
    guestsFrequencies: constants.GUESTS_FREQUENCIES,
    reportReasons: constants.REPORT_REASONS,
    dailyRequestLimit: constants.DAILY_REQUEST_LIMIT,
  });
}

module.exports = { show };
