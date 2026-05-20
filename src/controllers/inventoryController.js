const {
  createLocation,
  listLocations,
  updateLocation,
  deleteLocation,
  createProduct,
  updateProduct,
  deleteProduct,
  listProducts,
  createSupplier,
  listSuppliers,
  updateSupplier,
  deleteSupplier,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  sendPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
  listInventory,
  setInventoryStock,
  transferInventory,
  reserveInventory,
  commitReservation,
  cancelReservation,
  recordSale,
  forecastReorder,
  applyDeadStockDecay,
} = require("../services/inventory.service");

async function createLocationHandler(req, res) {
  const location = await createLocation(req.user, req.body);
  res.status(201).json({ location });
}

async function listLocationsHandler(req, res) {
  const result = await listLocations(req.user, req.query);
  res.json(result);
}

async function updateLocationHandler(req, res) {
  const location = await updateLocation(req.user, req.params.locationId, req.body);
  res.json({ location });
}

async function deleteLocationHandler(req, res) {
  const result = await deleteLocation(req.user, req.params.locationId);
  res.json(result);
}

async function createProductHandler(req, res) {
  const product = await createProduct(req.user, req.body);
  res.status(201).json({ product });
}

async function updateProductHandler(req, res) {
  const product = await updateProduct(req.user, req.params.productId, req.body);
  res.json({ product });
}

async function deleteProductHandler(req, res) {
  const result = await deleteProduct(req.user, req.params.productId);
  res.json(result);
}

async function listProductsHandler(req, res) {
  const result = await listProducts(req.user, req.query);
  res.json(result);
}

async function createSupplierHandler(req, res) {
  const supplier = await createSupplier(req.user, req.body);
  res.status(201).json({ supplier });
}

async function listSuppliersHandler(req, res) {
  const result = await listSuppliers(req.user, req.query);
  res.json(result);
}

async function updateSupplierHandler(req, res) {
  const supplier = await updateSupplier(req.user, req.params.supplierId, req.body);
  res.json({ supplier });
}

async function deleteSupplierHandler(req, res) {
  const result = await deleteSupplier(req.user, req.params.supplierId);
  res.json(result);
}

async function createPurchaseOrderHandler(req, res) {
  const purchaseOrder = await createPurchaseOrder(req.user, req.body);
  res.status(201).json({ purchaseOrder });
}

async function listPurchaseOrdersHandler(req, res) {
  const result = await listPurchaseOrders(req.user, req.query);
  res.json(result);
}

async function getPurchaseOrderHandler(req, res) {
  const purchaseOrder = await getPurchaseOrder(req.user, req.params.purchaseOrderId);
  res.json({ purchaseOrder });
}

async function sendPurchaseOrderHandler(req, res) {
  const purchaseOrder = await sendPurchaseOrder(req.user, req.params.purchaseOrderId);
  res.json({ purchaseOrder });
}

async function receivePurchaseOrderHandler(req, res) {
  const purchaseOrder = await receivePurchaseOrder(req.user, req.params.purchaseOrderId, req.body);
  res.json({ purchaseOrder });
}

async function cancelPurchaseOrderHandler(req, res) {
  const purchaseOrder = await cancelPurchaseOrder(req.user, req.params.purchaseOrderId);
  res.json({ purchaseOrder });
}

async function listInventoryHandler(req, res) {
  const result = await listInventory(req.user, req.query);
  res.json(result);
}

async function setStockHandler(req, res) {
  const inventoryItem = await setInventoryStock(req.user, req.body);
  res.json({ inventoryItem });
}

async function transferHandler(req, res) {
  const result = await transferInventory(req.user, req.body);
  res.status(201).json(result);
}

async function reserveHandler(req, res) {
  const reservation = await reserveInventory(req.user, req.body);
  res.status(201).json({ reservation });
}

async function commitReservationHandler(req, res) {
  const reservation = await commitReservation(req.user, req.params.token);
  res.json({ reservation });
}

async function cancelReservationHandler(req, res) {
  const reservation = await cancelReservation(req.user, req.params.token);
  res.json({ reservation });
}

async function recordSaleHandler(req, res) {
  const sale = await recordSale(req.user, req.body);
  res.status(201).json({ sale });
}

async function forecastHandler(req, res) {
  const forecast = await forecastReorder(req.user, {
    productId: req.params.productId,
    ...req.query,
  });
  res.json({ forecast });
}

async function runDecayHandler(req, res) {
  const result = await applyDeadStockDecay(req.user, req.body.now);
  res.json(result);
}

module.exports = {
  createLocationHandler,
  listLocationsHandler,
  updateLocationHandler,
  deleteLocationHandler,
  createProductHandler,
  updateProductHandler,
  deleteProductHandler,
  listProductsHandler,
  createSupplierHandler,
  listSuppliersHandler,
  updateSupplierHandler,
  deleteSupplierHandler,
  createPurchaseOrderHandler,
  listPurchaseOrdersHandler,
  getPurchaseOrderHandler,
  sendPurchaseOrderHandler,
  receivePurchaseOrderHandler,
  cancelPurchaseOrderHandler,
  listInventoryHandler,
  setStockHandler,
  transferHandler,
  reserveHandler,
  commitReservationHandler,
  cancelReservationHandler,
  recordSaleHandler,
  forecastHandler,
  runDecayHandler,
};
