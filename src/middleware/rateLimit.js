const { redis } = require("../config/redis");
const { env } = require("../config/env");

const memoryCounters = new Map();

function getIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
}

function authRateLimit(req, res, next) {
  const ip = getIp(req);
  const key = `rl:auth:${ip}:${req.path}`;

  consumeToken(key)
    .then((remaining) => {
      res.setHeader("X-RateLimit-Limit", env.AUTH_RATE_LIMIT_POINTS);
      res.setHeader("X-RateLimit-Remaining", Math.max(remaining, 0));
      next();
    })
    .catch(() => {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many auth attempts. Try again later.",
          details: { limit: env.AUTH_RATE_LIMIT_POINTS, windowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS },
        },
      });
    });
}

async function consumeToken(key) {
  if (process.env.NODE_ENV === "test" && redis.status !== "ready") {
    return consumeMemoryToken(key);
  }

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, env.AUTH_RATE_LIMIT_WINDOW_SECONDS);
  }
  const remaining = env.AUTH_RATE_LIMIT_POINTS - count;
  if (count > env.AUTH_RATE_LIMIT_POINTS) {
    throw new Error("rate limited");
  }
  return remaining;
}

function consumeMemoryToken(key) {
  const now = Date.now();
  const windowMs = env.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000;
  const current = memoryCounters.get(key);
  if (!current || current.resetAt <= now) {
    memoryCounters.set(key, { count: 1, resetAt: now + windowMs });
    return env.AUTH_RATE_LIMIT_POINTS - 1;
  }
  current.count += 1;
  if (current.count > env.AUTH_RATE_LIMIT_POINTS) {
    throw new Error("rate limited");
  }
  return env.AUTH_RATE_LIMIT_POINTS - current.count;
}

module.exports = { authRateLimit };
