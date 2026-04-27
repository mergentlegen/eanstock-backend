const { Prisma } = require("@prisma/client");
const { prisma } = require("../config/database");
const { badRequest, conflict, notFound } = require("../utils/errors");
const { writeAudit } = require("./audit.service");
const { withRedisLock } = require("./lock.service");

async function createLocation(user, input) {
  const location = await prisma.location.create({
    data: {
      tenantId: user.tenantId,
      name: input.name,
      code: input.code,
      address: input.address,
    },
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "LOCATION_CREATED",
    entityType: "Location",
    entityId: location.id,
    metadata: { code: location.code },
  });

  return location;
}

async function createProduct(user, input) {
  if (input.currentPrice && input.currentPrice < input.supplierCost) {
    throw badRequest("Current price cannot be lower than supplier cost on creation");
  }

  const product = await prisma.product.create({
    data: {
      tenantId: user.tenantId,
      sku: input.sku,
      name: input.name,
      supplierName: input.supplierName,
      supplierCost: new Prisma.Decimal(input.supplierCost),
      basePrice: new Prisma.Decimal(input.basePrice),
      currentPrice: new Prisma.Decimal(input.currentPrice ?? input.basePrice),
      deadStockAfterDays: input.deadStockAfterDays,
      decayPercent: new Prisma.Decimal(input.decayPercent),
      decayIntervalHours: input.decayIntervalHours,
      minPricePercent: new Prisma.Decimal(input.minPricePercent),
    },
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product.id,
    metadata: { sku: product.sku },
  });

  return product;
}

async function listProducts(user, { cursor, limit, q }) {
  const rows = await prisma.product.findMany({
    where: {
      tenantId: user.tenantId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasNext = rows.length > limit;
  const data = hasNext ? rows.slice(0, limit) : rows;
  return {
    data,
    pageInfo: {
      hasNextPage: hasNext,
      nextCursor: hasNext ? data[data.length - 1].id : null,
    },
  };
}

async function setInventoryStock(user, input) {
  await ensureTenantProductAndLocation(user.tenantId, input.productId, input.locationId);

  const item = await prisma.inventoryItem.upsert({
    where: {
      tenantId_productId_locationId: {
        tenantId: user.tenantId,
        productId: input.productId,
        locationId: input.locationId,
      },
    },
    create: {
      tenantId: user.tenantId,
      productId: input.productId,
      locationId: input.locationId,
      quantity: input.quantity,
      receivedAt: input.receivedAt,
    },
    update: {
      quantity: input.quantity,
      receivedAt: input.receivedAt,
      version: { increment: 1 },
    },
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "INVENTORY_ADJUSTED",
    entityType: "InventoryItem",
    entityId: item.id,
    metadata: { quantity: item.quantity },
  });

  return item;
}

async function transferInventory(user, input) {
  const lockKeys = [
    `lock:inventory:${user.tenantId}:${input.productId}:${input.sourceLocationId}`,
    `lock:inventory:${user.tenantId}:${input.productId}:${input.destinationLocationId}`,
  ];

  return withRedisLock(lockKeys, async () => {
    return prisma.$transaction(async (tx) => {
      await ensureTenantProductAndLocation(user.tenantId, input.productId, input.sourceLocationId, tx);
      await ensureTenantProductAndLocation(user.tenantId, input.productId, input.destinationLocationId, tx);

      const decrement = await tx.inventoryItem.updateMany({
        where: {
          tenantId: user.tenantId,
          productId: input.productId,
          locationId: input.sourceLocationId,
          quantity: { gte: input.quantity },
        },
        data: {
          quantity: { decrement: input.quantity },
          version: { increment: 1 },
        },
      });

      if (decrement.count !== 1) {
        throw conflict("Insufficient source inventory or concurrent transfer consumed stock first");
      }

      const destination = await tx.inventoryItem.upsert({
        where: {
          tenantId_productId_locationId: {
            tenantId: user.tenantId,
            productId: input.productId,
            locationId: input.destinationLocationId,
          },
        },
        create: {
          tenantId: user.tenantId,
          productId: input.productId,
          locationId: input.destinationLocationId,
          quantity: input.quantity,
        },
        update: {
          quantity: { increment: input.quantity },
          version: { increment: 1 },
        },
      });

      const transfer = await tx.inventoryTransfer.create({
        data: {
          tenantId: user.tenantId,
          productId: input.productId,
          sourceLocationId: input.sourceLocationId,
          destinationLocationId: input.destinationLocationId,
          quantity: input.quantity,
          createdByUserId: user.id,
        },
      });

      await writeAudit({
        tx,
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "INVENTORY_TRANSFERRED",
        entityType: "InventoryTransfer",
        entityId: transfer.id,
        metadata: input,
      });

      return { transfer, destination };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}

async function applyDeadStockDecay(user, now = new Date()) {
  const inventoryRows = await prisma.inventoryItem.findMany({
    where: {
      tenantId: user.tenantId,
      quantity: { gt: 0 },
    },
    include: {
      product: true,
    },
  });

  const updatedProducts = [];
  const touchedProductIds = new Set();

  for (const row of inventoryRows) {
    if (touchedProductIds.has(row.productId)) {
      continue;
    }
    const decision = calculateDeadStockPrice({
      currentPrice: Number(row.product.currentPrice),
      basePrice: Number(row.product.basePrice),
      receivedAt: row.receivedAt,
      lastDecayAt: row.lastDecayAt,
      now,
      deadStockAfterDays: row.product.deadStockAfterDays,
      decayPercent: Number(row.product.decayPercent),
      decayIntervalHours: row.product.decayIntervalHours,
      minPricePercent: Number(row.product.minPricePercent),
    });

    if (!decision.shouldDecay) {
      continue;
    }

    const product = await prisma.product.update({
      where: {
        id: row.productId,
        tenantId: user.tenantId,
      },
      data: {
        currentPrice: new Prisma.Decimal(decision.nextPrice),
      },
    });

    await prisma.inventoryItem.updateMany({
      where: {
        tenantId: user.tenantId,
        productId: row.productId,
      },
      data: {
        lastDecayAt: now,
        version: { increment: 1 },
      },
    });

    await writeAudit({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "DEAD_STOCK_DECAY_APPLIED",
      entityType: "Product",
      entityId: product.id,
      metadata: decision,
    });

    touchedProductIds.add(row.productId);
    updatedProducts.push(product);
  }

  return { updatedCount: updatedProducts.length, products: updatedProducts };
}

function calculateDeadStockPrice({
  currentPrice,
  basePrice,
  receivedAt,
  lastDecayAt,
  now,
  deadStockAfterDays,
  decayPercent,
  decayIntervalHours,
  minPricePercent,
}) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const ageDays = (now.getTime() - receivedAt.getTime()) / msPerDay;
  if (ageDays <= deadStockAfterDays) {
    return { shouldDecay: false, reason: "NOT_OLD_ENOUGH", currentPrice };
  }

  const reference = lastDecayAt ?? new Date(receivedAt.getTime() + deadStockAfterDays * msPerDay);
  const hoursSinceLastDecay = (now.getTime() - reference.getTime()) / (60 * 60 * 1000);
  if (hoursSinceLastDecay < decayIntervalHours) {
    return { shouldDecay: false, reason: "DECAY_INTERVAL_NOT_REACHED", currentPrice };
  }

  const floor = roundMoney(basePrice * (minPricePercent / 100));
  const discounted = roundMoney(currentPrice * (1 - decayPercent / 100));
  const nextPrice = Math.max(discounted, floor);

  if (nextPrice >= currentPrice) {
    return { shouldDecay: false, reason: "PRICE_FLOOR_REACHED", currentPrice, floor };
  }

  return {
    shouldDecay: true,
    previousPrice: roundMoney(currentPrice),
    nextPrice,
    floor,
    ageDays: Math.floor(ageDays),
    decayPercent,
  };
}

async function ensureTenantProductAndLocation(tenantId, productId, locationId, tx = prisma) {
  const [product, location] = await Promise.all([
    tx.product.findFirst({ where: { id: productId, tenantId } }),
    tx.location.findFirst({ where: { id: locationId, tenantId } }),
  ]);
  if (!product) {
    throw notFound("Product not found for this tenant");
  }
  if (!location) {
    throw notFound("Location not found for this tenant");
  }
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = {
  createLocation,
  createProduct,
  listProducts,
  setInventoryStock,
  transferInventory,
  applyDeadStockDecay,
  calculateDeadStockPrice,
};
