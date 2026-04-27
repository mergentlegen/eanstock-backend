const { prisma } = require("../config/database");

async function writeAudit({
  tx = prisma,
  tenantId = null,
  actorUserId = null,
  action,
  entityType,
  entityId = null,
  metadata = null,
  ipAddress = null,
}) {
  return tx.auditLog.create({
    data: {
      tenantId,
      actorUserId,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress,
    },
  });
}

module.exports = { writeAudit };
