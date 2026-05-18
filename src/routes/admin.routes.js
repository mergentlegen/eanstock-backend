const express = require("express");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { asyncHandler } = require("../utils/asyncHandler");
const { listUsersSchema, updateUserRoleSchema, userIdParamSchema, testEmailSchema } = require("../schemas/admin.schema");
const { listUsers, updateUserRole, deleteUser, listAuditLogs, getJobQueues, sendTestEmail } = require("../controllers/adminController");

const router = express.Router();

router.get("/users", requireAuth, requireRoles("ADMIN"), validate(listUsersSchema), asyncHandler(listUsers));
router.patch("/users/:userId/role", requireAuth, requireRoles("ADMIN"), validate(updateUserRoleSchema), asyncHandler(updateUserRole));
router.delete("/users/:userId", requireAuth, requireRoles("ADMIN"), validate(userIdParamSchema), asyncHandler(deleteUser));
router.get("/audit-logs", requireAuth, requireRoles("ADMIN"), asyncHandler(listAuditLogs));
router.get("/jobs", requireAuth, requireRoles("ADMIN"), asyncHandler(getJobQueues));
router.post("/test-email", requireAuth, requireRoles("ADMIN"), validate(testEmailSchema), asyncHandler(sendTestEmail));

module.exports = router;
