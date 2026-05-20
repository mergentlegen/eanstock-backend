const { env } = require("./config/env");
const { connectRedis, disconnectRedis } = require("./config/redis");
const { disconnectPrisma } = require("./config/database");
const { closeQueues } = require("./config/queues");
const { startDeadStockWorker, stopDeadStockWorker } = require("./services/deadStockWorker.service");
const { startWorkers, stopWorkers } = require("./services/worker.service");

async function main() {
  await connectRedis();
  startWorkers();
  startDeadStockWorker();
  console.log(`LeanStock worker online. Dead-stock cron: ${env.DEAD_STOCK_DECAY_CRON}`);

  async function shutdown() {
    stopDeadStockWorker();
    await Promise.all([stopWorkers(), closeQueues(), disconnectRedis(), disconnectPrisma()]);
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
