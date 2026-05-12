const express = require("express");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { asyncHandler } = require("../utils/asyncHandler");
const { listUsersSchema, updateUserRoleSchema } = require("../schemas/admin.schema");
const { listUsers, updateUserRole, listAuditLogs, getJobQueues } = require("../controllers/adminController");

const router = express.Router();

router.get("/users", requireAuth, requireRoles("ADMIN"), validate(listUsersSchema), asyncHandler(listUsers));
router.patch("/users/:userId/role", requireAuth, requireRoles("ADMIN"), validate(updateUserRoleSchema), asyncHandler(updateUserRole));
router.get("/audit-logs", requireAuth, requireRoles("ADMIN"), asyncHandler(listAuditLogs));
router.get("/jobs", requireAuth, requireRoles("ADMIN"), asyncHandler(getJobQueues));

module.exports = router;
