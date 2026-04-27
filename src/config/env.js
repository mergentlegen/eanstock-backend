const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  CORS_ORIGINS: z.string().min(1),
  AUTH_RATE_LIMIT_POINTS: z.coerce.number().int().positive().default(5),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  TRANSFER_LOCK_TTL_MS: z.coerce.number().int().positive().default(8000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${message}`);
}

const env = parsed.data;
env.CORS_ORIGIN_LIST = env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

if (env.NODE_ENV === "production" && env.CORS_ORIGIN_LIST.includes("*")) {
  throw new Error("CORS_ORIGINS cannot contain wildcard '*' in production.");
}

module.exports = { env };
