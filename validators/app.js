const { z, text, optionalText, queryBoolean, pagination } = require('./common');
const { neighborhood } = require('./profile');
const { REPORT_REASONS } = require('../config/constants');

const matchesQuery = z.object({
  ...pagination,
  neighborhood: neighborhood.optional(),
  maxBudget: z.coerce.number().int().min(0).optional(),
  hasHousing: queryBoolean.optional(),
});

const createRequest = z.object({
  toUserId: z.string().min(1),
  message: optionalText(300),
});

const requestsQuery = z.object({
  direction: z.enum(['sent', 'received']).optional(),
  status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED']).optional(),
});

const colocAnswer = z.object({ inColoc: z.boolean() });

const createReport = z.object({
  userId: z.string().min(1),
  reason: z.enum(REPORT_REASONS.map((r) => r.id)),
  details: optionalText(1000),
});

const pushSubscription = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: text(500), auth: text(500) }),
});

const pushUnsubscribe = z.object({ endpoint: z.string().min(1) });

module.exports = {
  matchesQuery,
  createRequest,
  requestsQuery,
  colocAnswer,
  createReport,
  pushSubscription,
  pushUnsubscribe,
};
