const { env } = require("./config/env");
const { createApp } = require("./app");
const { connectRedis, disconnectRedis } = require("./config/redis");
const { disconnectPrisma } = require("./config/database");
const { closeQueues } = require("./config/queues");
const { startDeadStockWorker, stopDeadStockWorker } = require("./services/deadStockWorker.service");
const { startWorkers, stopWorkers } = require("./services/worker.service");

async function main() {
  await connectRedis();
  if (env.RUN_WORKERS_IN_API) {
    startWorkers();
  }
  const app = createApp();
  if (env.RUN_WORKERS_IN_API) {
    startDeadStockWorker();
  }
  const server = app.listen(env.PORT, () => {
    console.log(`LeanStock API listening on port ${env.PORT}`);
    console.log(`Swagger UI: http://localhost:${env.PORT}/docs`);
  });

  async function shutdown() {
    if (env.RUN_WORKERS_IN_API) {
      stopDeadStockWorker();
    }
    server.close(async () => {
      await Promise.all([
        env.RUN_WORKERS_IN_API ? stopWorkers() : Promise.resolve(),
        closeQueues(),
        disconnectRedis(),
        disconnectPrisma(),
      ]);
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
