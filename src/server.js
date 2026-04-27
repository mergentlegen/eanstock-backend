const { env } = require("./config/env");
const { createApp } = require("./app");
const { connectRedis, disconnectRedis } = require("./config/redis");
const { disconnectPrisma } = require("./config/database");

async function main() {
  await connectRedis();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`LeanStock API listening on port ${env.PORT}`);
    console.log(`Swagger UI: http://localhost:${env.PORT}/docs`);
  });

  async function shutdown() {
    server.close(async () => {
      await Promise.all([disconnectRedis(), disconnectPrisma()]);
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
