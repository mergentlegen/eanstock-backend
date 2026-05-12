const { prisma } = require("../config/database");
const { notFound, badRequest } = require("../utils/errors");
const { writeAudit } = require("../services/audit.service");

async function listUsers(req, res) {
  const limit = Math.min(Number(req.query.limit || 25), 100);
  const users = await prisma.user.findMany({
    select: {
      id: true,
      tenantId: true,
      email: true,
      username: true,
      role: true,
      emailVerifiedAt: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(req.query.cursor ? { cursor: { id: req.query.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = users.length > limit;
  const data = hasNextPage ? users.slice(0, limit) : users;
  res.json({
    data,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? data[data.length - 1].id : null,
    },
  });
}

async function updateUserRole(req, res) {
  const { userId } = req.params;
  const { role } = req.body;

  if (userId === req.user.id && role !== "ADMIN") {
    throw badRequest("Admin cannot remove their own admin role");
  }

  const result = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirst({
      where: {
        id: userId,
      },
    });

    if (!target) {
      throw notFound("User was not found in your tenant");
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        emailVerifiedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await writeAudit({
      tx,
      tenantId: target.tenantId,
      actorUserId: req.user.id,
      action: "USER_ROLE_CHANGED",
      entityType: "User",
      entityId: userId,
      metadata: {
        previousRole: target.role,
        nextRole: role,
      },
      ipAddress: req.ip,
    });

    return updated;
  });

  res.json({ user: result });
}

async function listAuditLogs(req, res) {
  const limit = Math.min(Number(req.query.limit || 50), 100);
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: req.user.tenantId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(req.query.cursor ? { cursor: { id: req.query.cursor }, skip: 1 } : {}),
  });
  const hasNextPage = logs.length > limit;
  const data = hasNextPage ? logs.slice(0, limit) : logs;
  res.json({
    data,
    pageInfo: {
      hasNextPage,
      nextCursor: hasNextPage ? data[data.length - 1].id : null,
    },
  });
}

async function getJobQueues(req, res) {
  const { emailQueue, maintenanceQueue, getQueueSummary } = require("../config/queues");
  const [email, maintenance] = await Promise.all([
    getQueueSummary(emailQueue),
    getQueueSummary(maintenanceQueue),
  ]);
  res.json({ email, maintenance });
}

module.exports = { listUsers, updateUserRole, listAuditLogs, getJobQueues };
