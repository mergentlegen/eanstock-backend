const { Prisma } = require("@prisma/client");
const { prisma } = require("../config/database");
const { badRequest, conflict, notFound } = require("../utils/errors");
const { writeAudit } = require("./audit.service");
const { withRedisLock } = require("./lock.service");
const { queueEmail } = require("./email.service");

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

async function listLocations(user, { cursor, limit, q }) {
  const rows = await prisma.location.findMany({
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

async function updateLocation(user, locationId, input) {
  const existing = await prisma.location.findFirst({
    where: { id: locationId, tenantId: user.tenantId },
  });
  if (!existing) {
    throw notFound("Location not found for this tenant");
  }

  const location = await prisma.location.update({
    where: { id: locationId },
    data: input,
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "LOCATION_UPDATED",
    entityType: "Location",
    entityId: location.id,
    metadata: input,
  });

  return location;
}

async function deleteLocation(user, locationId) {
  const existing = await prisma.location.findFirst({
    where: { id: locationId, tenantId: user.tenantId },
  });
  if (!existing) {
    throw notFound("Location not found for this tenant");
  }

  const blockers = await prisma.$transaction([
    prisma.inventoryTransfer.count({
      where: {
        tenantId: user.tenantId,
        OR: [{ sourceLocationId: locationId }, { destinationLocationId: locationId }],
      },
    }),
    prisma.inventoryReservation.count({ where: { tenantId: user.tenantId, locationId } }),
    prisma.salesRecord.count({ where: { tenantId: user.tenantId, locationId } }),
  ]);

  if (blockers.some((count) => count > 0)) {
    throw conflict("Location has transaction history and cannot be deleted");
  }

  await prisma.$transaction(async (tx) => {
    await tx.location.delete({ where: { id: locationId } });
    await writeAudit({
      tx,
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "LOCATION_DELETED",
      entityType: "Location",
      entityId: locationId,
      metadata: { name: existing.name, code: existing.code },
    });
  });

  return { deleted: true, id: locationId };
}

async function createProduct(user, input) {
  if (input.currentPrice && input.currentPrice < input.supplierCost) {
    throw badRequest("Current price cannot be lower than supplier cost on creation");
  }
  if (input.supplierId) {
    await ensureTenantSupplier(user.tenantId, input.supplierId);
  }

  const product = await prisma.product.create({
    data: {
      tenantId: user.tenantId,
      sku: input.sku,
      name: input.name,
      supplierName: input.supplierName,
      supplierId: input.supplierId,
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

async function updateProduct(user, productId, input) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId },
  });
  if (!existing) {
    throw notFound("Product not found for this tenant");
  }

  const nextSupplierCost = input.supplierCost ?? Number(existing.supplierCost);
  const nextCurrentPrice = input.currentPrice ?? Number(existing.currentPrice);
  if (nextCurrentPrice < nextSupplierCost) {
    throw badRequest("Current price cannot be lower than supplier cost");
  }
  if (input.supplierId) {
    await ensureTenantSupplier(user.tenantId, input.supplierId);
  }

  const decimalFields = ["supplierCost", "basePrice", "currentPrice", "decayPercent", "minPricePercent"];
  const data = { ...input };
  for (const field of decimalFields) {
    if (data[field] !== undefined) {
      data[field] = new Prisma.Decimal(data[field]);
    }
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data,
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "PRODUCT_UPDATED",
    entityType: "Product",
    entityId: product.id,
    metadata: input,
  });

  return product;
}

async function deleteProduct(user, productId) {
  const existing = await prisma.product.findFirst({
    where: { id: productId, tenantId: user.tenantId },
  });
  if (!existing) {
    throw notFound("Product not found for this tenant");
  }

  const blockers = await prisma.$transaction([
    prisma.inventoryTransfer.count({ where: { tenantId: user.tenantId, productId } }),
    prisma.inventoryReservation.count({ where: { tenantId: user.tenantId, productId } }),
    prisma.salesRecord.count({ where: { tenantId: user.tenantId, productId } }),
  ]);

  if (blockers.some((count) => count > 0)) {
    throw conflict("Product has transaction history and cannot be deleted");
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.delete({ where: { id: productId } });
    await writeAudit({
      tx,
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PRODUCT_DELETED",
      entityType: "Product",
      entityId: productId,
      metadata: { sku: existing.sku, name: existing.name },
    });
  });

  return { deleted: true, id: productId };
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

async function createSupplier(user, input) {
  const supplier = await prisma.supplier.create({
    data: {
      tenantId: user.tenantId,
      name: input.name,
      email: input.email,
      contactName: input.contactName,
      phone: input.phone,
    },
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "SUPPLIER_CREATED",
    entityType: "Supplier",
    entityId: supplier.id,
    metadata: { name: supplier.name, email: supplier.email },
  });

  return supplier;
}

async function listSuppliers(user, { cursor, limit, q }) {
  const rows = await prisma.supplier.findMany({
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

async function updateSupplier(user, supplierId, input) {
  const existing = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId: user.tenantId },
  });
  if (!existing) {
    throw notFound("Supplier not found for this tenant");
  }

  const supplier = await prisma.supplier.update({
    where: { id: supplierId },
    data: input,
  });

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "SUPPLIER_UPDATED",
    entityType: "Supplier",
    entityId: supplier.id,
    metadata: input,
  });

  return supplier;
}

async function deleteSupplier(user, supplierId) {
  const existing = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId: user.tenantId },
  });
  if (!existing) {
    throw notFound("Supplier not found for this tenant");
  }

  const purchaseOrderCount = await prisma.purchaseOrder.count({
    where: { tenantId: user.tenantId, supplierId },
  });
  if (purchaseOrderCount > 0) {
    throw conflict("Supplier has purchase order history and cannot be deleted");
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { tenantId: user.tenantId, supplierId },
      data: { supplierId: null },
    });
    await tx.supplier.delete({ where: { id: supplierId } });
    await writeAudit({
      tx,
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "SUPPLIER_DELETED",
      entityType: "Supplier",
      entityId: supplierId,
      metadata: { name: existing.name },
    });
  });

  return { deleted: true, id: supplierId };
}

async function createPurchaseOrder(user, input) {
  const supplier = await ensureTenantSupplier(user.tenantId, input.supplierId);
  const productIds = input.items.map((item) => item.productId);
  const uniqueProductIds = new Set(productIds);
  if (uniqueProductIds.size !== productIds.length) {
    throw badRequest("Purchase order cannot contain duplicate products");
  }

  const products = await prisma.product.findMany({
    where: { tenantId: user.tenantId, id: { in: productIds } },
  });
  if (products.length !== productIds.length) {
    throw notFound("One or more products were not found for this tenant");
  }
  const productById = new Map(products.map((product) => [product.id, product]));

  const purchaseOrder = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        tenantId: user.tenantId,
        supplierId: supplier.id,
        expectedAt: input.expectedAt,
        createdByUserId: user.id,
        items: {
          create: input.items.map((item) => {
            const product = productById.get(item.productId);
            return {
              tenantId: user.tenantId,
              productId: item.productId,
              quantity: item.quantity,
              unitCost: new Prisma.Decimal(item.unitCost ?? product.supplierCost),
            };
          }),
        },
      },
      include: purchaseOrderInclude,
    });

    await writeAudit({
      tx,
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PURCHASE_ORDER_CREATED",
      entityType: "PurchaseOrder",
      entityId: created.id,
      metadata: { supplierId: supplier.id, itemCount: input.items.length },
    });

    return created;
  });

  return purchaseOrder;
}

async function listPurchaseOrders(user, { cursor, limit, status }) {
  const rows = await prisma.purchaseOrder.findMany({
    where: {
      tenantId: user.tenantId,
      ...(status ? { status } : {}),
    },
    include: purchaseOrderInclude,
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

async function getPurchaseOrder(user, purchaseOrderId) {
  const purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, tenantId: user.tenantId },
    include: purchaseOrderInclude,
  });
  if (!purchaseOrder) {
    throw notFound("Purchase order not found for this tenant");
  }
  return purchaseOrder;
}

async function sendPurchaseOrder(user, purchaseOrderId) {
  const purchaseOrder = await prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId: user.tenantId },
      include: purchaseOrderInclude,
    });
    if (!existing) {
      throw notFound("Purchase order not found for this tenant");
    }
    if (existing.status !== "DRAFT") {
      throw conflict("Only draft purchase orders can be sent");
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "SENT", sentAt: new Date() },
      include: purchaseOrderInclude,
    });

    await writeAudit({
      tx,
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PURCHASE_ORDER_SENT",
      entityType: "PurchaseOrder",
      entityId: updated.id,
      metadata: { supplierId: updated.supplierId },
    });

    return updated;
  });

  await queueEmail({
    to: purchaseOrder.supplier.email || user.email,
    subject: `LeanStock purchase order ${purchaseOrder.id}`,
    text: `Purchase order ${purchaseOrder.id} was sent with ${purchaseOrder.items.length} line item(s).`,
    html: `<p>Purchase order <b>${purchaseOrder.id}</b> was sent with ${purchaseOrder.items.length} line item(s).</p>`,
    eventType: "PURCHASE_ORDER_SENT",
    metadata: { tenantId: user.tenantId, purchaseOrderId: purchaseOrder.id },
  });

  return purchaseOrder;
}

async function receivePurchaseOrder(user, purchaseOrderId, input) {
  const lockKey = `lock:purchase-order:${user.tenantId}:${purchaseOrderId}`;
  const purchaseOrder = await withRedisLock([lockKey], async () => {
    return prisma.$transaction(async (tx) => {
      await ensureTenantLocation(user.tenantId, input.locationId, tx);

      const existing = await tx.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, tenantId: user.tenantId },
        include: purchaseOrderInclude,
      });
      if (!existing) {
        throw notFound("Purchase order not found for this tenant");
      }
      if (!["DRAFT", "SENT"].includes(existing.status)) {
        throw conflict("Only draft or sent purchase orders can be received");
      }

      const requestedByProductId = new Map((input.receivedItems || []).map((item) => [item.productId, item.quantity]));
      const hasCustomReceipt = requestedByProductId.size > 0;

      for (const item of existing.items) {
        const receivedQuantity = hasCustomReceipt ? (requestedByProductId.get(item.productId) || 0) : item.quantity;
        if (receivedQuantity < 0 || receivedQuantity > item.quantity) {
          throw badRequest("Received quantity cannot exceed ordered quantity");
        }
        if (receivedQuantity === 0) {
          continue;
        }

        await tx.inventoryItem.upsert({
          where: {
            tenantId_productId_locationId: {
              tenantId: user.tenantId,
              productId: item.productId,
              locationId: input.locationId,
            },
          },
          create: {
            tenantId: user.tenantId,
            productId: item.productId,
            locationId: input.locationId,
            quantity: receivedQuantity,
            receivedAt: new Date(),
          },
          update: {
            quantity: { increment: receivedQuantity },
            receivedAt: new Date(),
            version: { increment: 1 },
          },
        });

        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity },
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: "RECEIVED", receivedAt: new Date() },
        include: purchaseOrderInclude,
      });

      await writeAudit({
        tx,
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "PURCHASE_ORDER_RECEIVED",
        entityType: "PurchaseOrder",
        entityId: updated.id,
        metadata: { locationId: input.locationId },
      });

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });

  await queueEmail({
    to: user.email,
    subject: "Purchase order received",
    text: `Purchase order ${purchaseOrder.id} was received into inventory.`,
    html: `<p>Purchase order <b>${purchaseOrder.id}</b> was received into inventory.</p>`,
    eventType: "PURCHASE_ORDER_RECEIVED",
    metadata: { tenantId: user.tenantId, purchaseOrderId: purchaseOrder.id },
  });

  return purchaseOrder;
}

async function cancelPurchaseOrder(user, purchaseOrderId) {
  const purchaseOrder = await prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId: user.tenantId },
      include: purchaseOrderInclude,
    });
    if (!existing) {
      throw notFound("Purchase order not found for this tenant");
    }
    if (existing.status === "RECEIVED") {
      throw conflict("Received purchase orders cannot be cancelled");
    }
    if (existing.status === "CANCELLED") {
      throw conflict("Purchase order is already cancelled");
    }

    const updated = await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: purchaseOrderInclude,
    });

    await writeAudit({
      tx,
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PURCHASE_ORDER_CANCELLED",
      entityType: "PurchaseOrder",
      entityId: updated.id,
      metadata: { supplierId: updated.supplierId },
    });

    return updated;
  });

  return purchaseOrder;
}

async function listInventory(user, { cursor, limit, productId, locationId }) {
  const rows = await prisma.inventoryItem.findMany({
    where: {
      tenantId: user.tenantId,
      ...(productId ? { productId } : {}),
      ...(locationId ? { locationId } : {}),
    },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          currentPrice: true,
        },
      },
      location: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
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

      await queueEmail({
        to: user.email,
        subject: "Inventory transfer completed",
        text: `Transfer completed: ${input.quantity} units moved between locations.`,
        html: `<p>Transfer completed: <b>${input.quantity}</b> units moved between locations.</p>`,
        eventType: "INVENTORY_TRANSFERRED",
        metadata: { tenantId: user.tenantId, transferId: transfer.id },
      });

      return { transfer, destination };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}

async function reserveInventory(user, input) {
  const lockKey = `lock:reservation:${user.tenantId}:${input.productId}:${input.locationId}`;
  return withRedisLock([lockKey], async () => {
    return prisma.$transaction(async (tx) => {
      await ensureTenantProductAndLocation(user.tenantId, input.productId, input.locationId, tx);
      const item = await tx.inventoryItem.findFirst({
        where: {
          tenantId: user.tenantId,
          productId: input.productId,
          locationId: input.locationId,
        },
      });

      if (!item || item.quantity - item.reservedQuantity < input.quantity) {
        throw conflict("Not enough available inventory to reserve");
      }

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          reservedQuantity: { increment: input.quantity },
          version: { increment: 1 },
        },
      });

      const reservation = await tx.inventoryReservation.create({
        data: {
          tenantId: user.tenantId,
          productId: input.productId,
          locationId: input.locationId,
          quantity: input.quantity,
          token: `rsv_${cryptoRandomToken()}`,
          expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
          createdByUserId: user.id,
        },
      });

      await writeAudit({
        tx,
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "INVENTORY_RESERVED",
        entityType: "InventoryReservation",
        entityId: reservation.id,
        metadata: { quantity: input.quantity },
      });

      await queueEmail({
        to: user.email,
        subject: "Inventory reservation created",
        text: `Reservation ${reservation.token} created for ${reservation.quantity} units.`,
        html: `<p>Reservation <b>${reservation.token}</b> created for ${reservation.quantity} units.</p>`,
        eventType: "INVENTORY_RESERVED",
        metadata: { tenantId: user.tenantId, reservationId: reservation.id },
      });

      return reservation;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}

async function commitReservation(user, token) {
  return changeReservationStatus(user, token, "COMMITTED");
}

async function cancelReservation(user, token) {
  return changeReservationStatus(user, token, "CANCELLED");
}

async function changeReservationStatus(user, token, nextStatus) {
  const reservation = await prisma.inventoryReservation.findFirst({
    where: {
      tenantId: user.tenantId,
      token,
      status: "RESERVED",
    },
  });

  if (!reservation) {
    throw notFound("Active reservation not found");
  }
  if (reservation.expiresAt <= new Date()) {
    await prisma.inventoryReservation.update({
      where: { id: reservation.id },
      data: { status: "EXPIRED" },
    });
    throw conflict("Reservation has expired");
  }

  const lockKey = `lock:reservation:${user.tenantId}:${reservation.productId}:${reservation.locationId}`;
  return withRedisLock([lockKey], async () => {
    return prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findFirst({
        where: {
          tenantId: user.tenantId,
          productId: reservation.productId,
          locationId: reservation.locationId,
        },
      });
      if (!item || item.reservedQuantity < reservation.quantity) {
        throw conflict("Reservation state is inconsistent");
      }

      await tx.inventoryItem.update({
        where: { id: item.id },
        data: nextStatus === "COMMITTED"
          ? {
            quantity: { decrement: reservation.quantity },
            reservedQuantity: { decrement: reservation.quantity },
            version: { increment: 1 },
          }
          : {
            reservedQuantity: { decrement: reservation.quantity },
            version: { increment: 1 },
          },
      });

      const updated = await tx.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: nextStatus },
      });

      await writeAudit({
        tx,
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: nextStatus === "COMMITTED" ? "INVENTORY_RESERVATION_COMMITTED" : "INVENTORY_RESERVATION_CANCELLED",
        entityType: "InventoryReservation",
        entityId: reservation.id,
        metadata: { token },
      });

      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}

async function recordSale(user, input) {
  const lockKey = `lock:sale:${user.tenantId}:${input.productId}:${input.locationId}`;
  return withRedisLock([lockKey], async () => {
    return prisma.$transaction(async (tx) => {
      await ensureTenantProductAndLocation(user.tenantId, input.productId, input.locationId, tx);
      const decrement = await tx.inventoryItem.updateMany({
        where: {
          tenantId: user.tenantId,
          productId: input.productId,
          locationId: input.locationId,
          quantity: { gte: input.quantity },
        },
        data: {
          quantity: { decrement: input.quantity },
          version: { increment: 1 },
        },
      });
      if (decrement.count !== 1) {
        throw conflict("Not enough stock to record sale");
      }

      const sale = await tx.salesRecord.create({
        data: {
          tenantId: user.tenantId,
          productId: input.productId,
          locationId: input.locationId,
          quantity: input.quantity,
          unitPrice: new Prisma.Decimal(input.unitPrice),
          soldAt: input.soldAt,
          createdByUserId: user.id,
        },
      });

      await writeAudit({
        tx,
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "SALE_RECORDED",
        entityType: "SalesRecord",
        entityId: sale.id,
        metadata: { quantity: input.quantity },
      });

      return sale;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  });
}

async function forecastReorder(user, { productId, locationId, days = 30, leadTimeDays = 7, safetyStock = 5 }) {
  await ensureTenantProductAndLocation(user.tenantId, productId, locationId);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const sales = await prisma.salesRecord.findMany({
    where: {
      tenantId: user.tenantId,
      productId,
      locationId,
      soldAt: { gte: since },
    },
  });
  const item = await prisma.inventoryItem.findFirst({
    where: {
      tenantId: user.tenantId,
      productId,
      locationId,
    },
  });

  const totalSold = sales.reduce((sum, sale) => sum + sale.quantity, 0);
  const averageDailyDemand = totalSold / days;
  const reorderPoint = Math.ceil(averageDailyDemand * leadTimeDays + safetyStock);
  const availableQuantity = item ? item.quantity - item.reservedQuantity : 0;
  const recommendedOrderQuantity = Math.max(reorderPoint - availableQuantity, 0);

  const forecast = {
    productId,
    locationId,
    windowDays: days,
    leadTimeDays,
    safetyStock,
    totalSold,
    averageDailyDemand: roundMoney(averageDailyDemand),
    availableQuantity,
    reorderPoint,
    shouldReorder: availableQuantity <= reorderPoint,
    recommendedOrderQuantity,
  };

  await writeAudit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "REORDER_FORECAST_VIEWED",
    entityType: "Product",
    entityId: productId,
    metadata: forecast,
  });

  if (forecast.shouldReorder) {
    await queueEmail({
      to: user.email,
      subject: "LeanStock reorder alert",
      text: `Reorder suggested for product ${productId}. Recommended quantity: ${recommendedOrderQuantity}.`,
      html: `<p>Reorder suggested.</p><p>Recommended quantity: <b>${recommendedOrderQuantity}</b></p>`,
      eventType: "REORDER_ALERT",
      metadata: { tenantId: user.tenantId, productId, locationId },
    });
  }

  return forecast;
}

async function applyDeadStockDecay(user, now = new Date()) {
  return applyDeadStockDecayForTenant({
    tenantId: user.tenantId,
    actorUserId: user.id,
    now,
  });
}

async function applyDeadStockDecayForTenant({ tenantId, actorUserId = null, now = new Date() }) {
  const inventoryRows = await prisma.inventoryItem.findMany({
    where: {
      tenantId,
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
        tenantId,
      },
      data: {
        currentPrice: new Prisma.Decimal(decision.nextPrice),
      },
    });

    await prisma.inventoryItem.updateMany({
      where: {
        tenantId,
        productId: row.productId,
      },
      data: {
        lastDecayAt: now,
        version: { increment: 1 },
      },
    });

    await writeAudit({
      tenantId,
      actorUserId,
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

async function releaseExpiredReservationsForTenant({ tenantId, now = new Date() }) {
  const reservations = await prisma.inventoryReservation.findMany({
    where: {
      tenantId,
      status: "RESERVED",
      expiresAt: { lte: now },
    },
  });

  let releasedCount = 0;

  for (const reservation of reservations) {
    const lockKey = `lock:reservation:${tenantId}:${reservation.productId}:${reservation.locationId}`;
    await withRedisLock([lockKey], async () => {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.inventoryReservation.updateMany({
          where: {
            id: reservation.id,
            status: "RESERVED",
          },
          data: { status: "EXPIRED" },
        });

        if (updated.count !== 1) {
          return;
        }

        await tx.inventoryItem.updateMany({
          where: {
            tenantId,
            productId: reservation.productId,
            locationId: reservation.locationId,
            reservedQuantity: { gte: reservation.quantity },
          },
          data: {
            reservedQuantity: { decrement: reservation.quantity },
            version: { increment: 1 },
          },
        });

        releasedCount += 1;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    });
  }

  return { releasedCount };
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

async function ensureTenantLocation(tenantId, locationId, tx = prisma) {
  const location = await tx.location.findFirst({ where: { id: locationId, tenantId } });
  if (!location) {
    throw notFound("Location not found for this tenant");
  }
  return location;
}

async function ensureTenantSupplier(tenantId, supplierId, tx = prisma) {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId } });
  if (!supplier) {
    throw notFound("Supplier not found for this tenant");
  }
  return supplier;
}

const purchaseOrderInclude = {
  supplier: true,
  items: {
    include: {
      product: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  },
};

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cryptoRandomToken() {
  return require("crypto").randomBytes(18).toString("base64url");
}

module.exports = {
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
  applyDeadStockDecayForTenant,
  releaseExpiredReservationsForTenant,
  calculateDeadStockPrice,
};
