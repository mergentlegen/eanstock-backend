const { prisma } = require("../config/database");

async function listAuditLogs(req, res) {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ data: logs });
}

module.exports = { listAuditLogs };
