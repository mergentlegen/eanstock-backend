const { z } = require("zod");

const listUsersSchema = z.object({
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }),
});

const updateUserRoleSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    role: z.enum(["ADMIN", "MERCHANT", "STAFF"]),
  }),
});

const userIdParamSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

const testEmailSchema = z.object({
  body: z.object({
    to: z.string().email().toLowerCase(),
  }),
});

module.exports = { listUsersSchema, updateUserRoleSchema, userIdParamSchema, testEmailSchema };
