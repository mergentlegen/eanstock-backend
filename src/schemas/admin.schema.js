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

module.exports = { listUsersSchema, updateUserRoleSchema };
