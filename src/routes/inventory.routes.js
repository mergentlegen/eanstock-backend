const express = require("express");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  createLocationSchema,
  createProductSchema,
  listProductsSchema,
  setStockSchema,
  transferSchema,
  decaySchema,
} = require("../schemas/inventory.schema");
const controller = require("../controllers/inventoryController");

const router = express.Router();

router.use(requireAuth);

router.post("/locations", requireRoles("ADMIN", "MERCHANT"), validate(createLocationSchema), asyncHandler(controller.createLocationHandler));
router.post("/products", requireRoles("ADMIN", "MERCHANT"), validate(createProductSchema), asyncHandler(controller.createProductHandler));
router.get("/products", validate(listProductsSchema), asyncHandler(controller.listProductsHandler));
router.post("/inventory/stock", requireRoles("ADMIN", "MERCHANT"), validate(setStockSchema), asyncHandler(controller.setStockHandler));
router.post("/inventory/transfers", requireRoles("ADMIN", "MERCHANT"), validate(transferSchema), asyncHandler(controller.transferHandler));
router.post("/jobs/dead-stock-decay", requireRoles("ADMIN", "MERCHANT"), validate(decaySchema), asyncHandler(controller.runDecayHandler));

module.exports = router;
