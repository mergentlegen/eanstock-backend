const express = require("express");
const { requireAuth, requireRoles } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { asyncHandler } = require("../utils/asyncHandler");
const {
  createLocationSchema,
  listLocationsSchema,
  updateLocationSchema,
  locationIdParamSchema,
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  listProductsSchema,
  listInventorySchema,
  setStockSchema,
  transferSchema,
  decaySchema,
  reserveSchema,
  reservationTokenSchema,
  recordSaleSchema,
  forecastSchema,
  createSupplierSchema,
  listSuppliersSchema,
  updateSupplierSchema,
  supplierIdParamSchema,
  createPurchaseOrderSchema,
  listPurchaseOrdersSchema,
  purchaseOrderIdParamSchema,
  receivePurchaseOrderSchema,
} = require("../schemas/inventory.schema");
const controller = require("../controllers/inventoryController");

const router = express.Router();

router.use(requireAuth);

router.post("/locations", requireRoles("ADMIN", "MERCHANT"), validate(createLocationSchema), asyncHandler(controller.createLocationHandler));
router.get("/locations", validate(listLocationsSchema), asyncHandler(controller.listLocationsHandler));
router.patch("/locations/:locationId", requireRoles("ADMIN", "MERCHANT"), validate(updateLocationSchema), asyncHandler(controller.updateLocationHandler));
router.delete("/locations/:locationId", requireRoles("ADMIN", "MERCHANT"), validate(locationIdParamSchema), asyncHandler(controller.deleteLocationHandler));
router.post("/products", requireRoles("ADMIN", "MERCHANT"), validate(createProductSchema), asyncHandler(controller.createProductHandler));
router.get("/products", validate(listProductsSchema), asyncHandler(controller.listProductsHandler));
router.patch("/products/:productId", requireRoles("ADMIN", "MERCHANT"), validate(updateProductSchema), asyncHandler(controller.updateProductHandler));
router.delete("/products/:productId", requireRoles("ADMIN", "MERCHANT"), validate(productIdParamSchema), asyncHandler(controller.deleteProductHandler));
router.post("/suppliers", requireRoles("ADMIN", "MERCHANT"), validate(createSupplierSchema), asyncHandler(controller.createSupplierHandler));
router.get("/suppliers", validate(listSuppliersSchema), asyncHandler(controller.listSuppliersHandler));
router.patch("/suppliers/:supplierId", requireRoles("ADMIN", "MERCHANT"), validate(updateSupplierSchema), asyncHandler(controller.updateSupplierHandler));
router.delete("/suppliers/:supplierId", requireRoles("ADMIN", "MERCHANT"), validate(supplierIdParamSchema), asyncHandler(controller.deleteSupplierHandler));
router.post("/purchase-orders", requireRoles("ADMIN", "MERCHANT"), validate(createPurchaseOrderSchema), asyncHandler(controller.createPurchaseOrderHandler));
router.get("/purchase-orders", requireRoles("ADMIN", "MERCHANT"), validate(listPurchaseOrdersSchema), asyncHandler(controller.listPurchaseOrdersHandler));
router.get("/purchase-orders/:purchaseOrderId", requireRoles("ADMIN", "MERCHANT"), validate(purchaseOrderIdParamSchema), asyncHandler(controller.getPurchaseOrderHandler));
router.post("/purchase-orders/:purchaseOrderId/send", requireRoles("ADMIN", "MERCHANT"), validate(purchaseOrderIdParamSchema), asyncHandler(controller.sendPurchaseOrderHandler));
router.post("/purchase-orders/:purchaseOrderId/receive", requireRoles("ADMIN", "MERCHANT"), validate(receivePurchaseOrderSchema), asyncHandler(controller.receivePurchaseOrderHandler));
router.post("/purchase-orders/:purchaseOrderId/cancel", requireRoles("ADMIN", "MERCHANT"), validate(purchaseOrderIdParamSchema), asyncHandler(controller.cancelPurchaseOrderHandler));
router.get("/inventory", validate(listInventorySchema), asyncHandler(controller.listInventoryHandler));
router.post("/inventory/stock", requireRoles("ADMIN", "MERCHANT"), validate(setStockSchema), asyncHandler(controller.setStockHandler));
router.post("/inventory/transfers", requireRoles("ADMIN", "MERCHANT"), validate(transferSchema), asyncHandler(controller.transferHandler));
router.post("/inventory/reservations", requireRoles("ADMIN", "MERCHANT", "STAFF"), validate(reserveSchema), asyncHandler(controller.reserveHandler));
router.post("/inventory/reservations/:token/commit", requireRoles("ADMIN", "MERCHANT", "STAFF"), validate(reservationTokenSchema), asyncHandler(controller.commitReservationHandler));
router.post("/inventory/reservations/:token/cancel", requireRoles("ADMIN", "MERCHANT", "STAFF"), validate(reservationTokenSchema), asyncHandler(controller.cancelReservationHandler));
router.post("/sales", requireRoles("ADMIN", "MERCHANT", "STAFF"), validate(recordSaleSchema), asyncHandler(controller.recordSaleHandler));
router.get("/products/:productId/forecast", requireRoles("ADMIN", "MERCHANT"), validate(forecastSchema), asyncHandler(controller.forecastHandler));
router.post("/jobs/dead-stock-decay", requireRoles("ADMIN", "MERCHANT"), validate(decaySchema), asyncHandler(controller.runDecayHandler));

module.exports = router;
