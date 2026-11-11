const { z, optionalText, pagination, reason } = require('./common');

const usersQuery = z.object({
  ...pagination,
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED', 'BANNED']).default('PENDING'),
});

const reportsQuery = z.object({
  ...pagination,
  status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN'),
});

const actionsQuery = z.object({ ...pagination });

const closeReport = z.object({ note: optionalText(500) });

module.exports = { usersQuery, reportsQuery, actionsQuery, closeReport, reason };
