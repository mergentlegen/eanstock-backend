const Redis = require("ioredis");
const { env } = require("./env");

const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
  lazyConnect: true,
});

async function connectRedis() {
  if (redis.status === "wait") {
    await redis.connect();
  }
}

async function disconnectRedis() {
  if (redis.status !== "end") {
    await redis.quit();
  }
}

module.exports = { redis, connectRedis, disconnectRedis };
