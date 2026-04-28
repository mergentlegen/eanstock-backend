const cron = require("node-cron");
const { env } = require("../config/env");
const { prisma } = require("../config/database");
const { applyDeadStockDecayForTenant } = require("./inventory.service");

let scheduledTask = null;

function startDeadStockWorker() {
  if (!env.ENABLE_DEAD_STOCK_WORKER || process.env.NODE_ENV === "test") {
    return null;
  }

  scheduledTask = cron.schedule(env.DEAD_STOCK_DECAY_CRON, async () => {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      await applyDeadStockDecayForTenant({ tenantId: tenant.id, actorUserId: null, now: new Date() });
    }
  });

  console.log(`Dead stock worker scheduled with cron: ${env.DEAD_STOCK_DECAY_CRON}`);
  return scheduledTask;
}

function stopDeadStockWorker() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = { startDeadStockWorker, stopDeadStockWorker };
