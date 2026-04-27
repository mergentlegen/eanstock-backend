const {
  createLocation,
  createProduct,
  listProducts,
  setInventoryStock,
  transferInventory,
  applyDeadStockDecay,
} = require("../services/inventory.service");

async function createLocationHandler(req, res) {
  const location = await createLocation(req.user, req.body);
  res.status(201).json({ location });
}

async function createProductHandler(req, res) {
  const product = await createProduct(req.user, req.body);
  res.status(201).json({ product });
}

async function listProductsHandler(req, res) {
  const result = await listProducts(req.user, req.query);
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

async function runDecayHandler(req, res) {
  const result = await applyDeadStockDecay(req.user, req.body.now);
  res.json(result);
}

module.exports = {
  createLocationHandler,
  createProductHandler,
  listProductsHandler,
  setStockHandler,
  transferHandler,
  runDecayHandler,
};
