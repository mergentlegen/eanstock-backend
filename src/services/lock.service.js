const crypto = require("crypto");
const { redis } = require("../config/redis");
const { env } = require("../config/env");
const { conflict } = require("../utils/errors");

const memoryLocks = new Map();

async function withRedisLock(keys, fn) {
  const orderedKeys = [...new Set(keys)].sort();
  const tokens = [];

  try {
    for (const key of orderedKeys) {
      const token = crypto.randomUUID();
      const acquired = await acquireLock(key, token);
      if (!acquired) {
        throw conflict("Inventory rows are locked by another transfer. Retry shortly.", { lockKey: key });
      }
      tokens.push({ key, token });
    }
    return await fn();
  } finally {
    await Promise.all(tokens.reverse().map(({ key, token }) => releaseLock(key, token)));
  }
}

async function acquireLock(key, token) {
  if (process.env.NODE_ENV === "test" && redis.status !== "ready") {
    const current = memoryLocks.get(key);
    if (current && current.expiresAt > Date.now()) {
      return false;
    }
    memoryLocks.set(key, { token, expiresAt: Date.now() + env.TRANSFER_LOCK_TTL_MS });
    return true;
  }

  const result = await redis.set(key, token, "PX", env.TRANSFER_LOCK_TTL_MS, "NX");
  return result === "OK";
}

async function releaseLock(key, token) {
  if (process.env.NODE_ENV === "test" && redis.status !== "ready") {
    const current = memoryLocks.get(key);
    if (current?.token === token) {
      memoryLocks.delete(key);
    }
    return;
  }

  const current = await redis.get(key);
  if (current === token) {
    await redis.del(key);
  }
}

module.exports = { withRedisLock };
