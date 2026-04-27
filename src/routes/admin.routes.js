const express = require("express");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { asyncHandler } = require("../utils/asyncHandler");
const { listAuditLogs } = require("../controllers/adminController");

const router = express.Router();

router.get("/audit-logs", requireAuth, requireRoles("ADMIN"), asyncHandler(listAuditLogs));

module.exports = router;
