const { z } = require("zod");

const uuid = z.string().uuid();
const money = z.coerce.number().positive().max(100000000);
const percent = z.coerce.number().positive().max(100);

const createLocationSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(120),
    code: z.string().min(2).max(24).regex(/^[A-Z0-9_-]+$/),
    address: z.string().max(240).optional(),
  }),
});

const listLocationsSchema = z.object({
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().max(80).optional(),
  }),
});

const locationIdParamSchema = z.object({
  params: z.object({
    locationId: uuid,
  }),
});

const updateLocationSchema = locationIdParamSchema.extend({
  body: z.object({
    name: z.string().min(2).max(120).optional(),
    code: z.string().min(2).max(24).regex(/^[A-Z0-9_-]+$/).optional(),
    address: z.string().max(240).optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  }),
});

const createProductSchema = z.object({
  body: z.object({
    sku: z.string().min(2).max(64),
    name: z.string().min(2).max(160),
    supplierName: z.string().max(120).optional(),
    supplierId: uuid.optional(),
    supplierCost: money,
    basePrice: money,
    currentPrice: money.optional(),
    deadStockAfterDays: z.coerce.number().int().min(1).max(365).default(30),
    decayPercent: percent.default(10),
    decayIntervalHours: z.coerce.number().int().min(1).max(720).default(72),
    minPricePercent: percent.default(50),
  }),
});

const productIdParamSchema = z.object({
  params: z.object({
    productId: uuid,
  }),
});

const updateProductSchema = productIdParamSchema.extend({
  body: z.object({
    sku: z.string().min(2).max(64).optional(),
    name: z.string().min(2).max(160).optional(),
    supplierName: z.string().max(120).optional(),
    supplierId: uuid.nullable().optional(),
    supplierCost: money.optional(),
    basePrice: money.optional(),
    currentPrice: money.optional(),
    deadStockAfterDays: z.coerce.number().int().min(1).max(365).optional(),
    decayPercent: percent.optional(),
    decayIntervalHours: z.coerce.number().int().min(1).max(720).optional(),
    minPricePercent: percent.optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  }),
});

const listProductsSchema = z.object({
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().max(80).optional(),
  }),
});

const setStockSchema = z.object({
  body: z.object({
    productId: uuid,
    locationId: uuid,
    quantity: z.coerce.number().int().min(0).max(1000000),
    receivedAt: z.coerce.date().optional(),
  }),
});

const listInventorySchema = z.object({
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    productId: uuid.optional(),
    locationId: uuid.optional(),
  }),
});

const transferSchema = z.object({
  body: z.object({
    productId: uuid,
    sourceLocationId: uuid,
    destinationLocationId: uuid,
    quantity: z.coerce.number().int().positive().max(1000000),
  }).refine((value) => value.sourceLocationId !== value.destinationLocationId, {
    message: "Source and destination locations must be different",
    path: ["destinationLocationId"],
  }),
});

const decaySchema = z.object({
  body: z.object({
    now: z.coerce.date().optional(),
  }).default({}),
});

const reserveSchema = z.object({
  body: z.object({
    productId: uuid,
    locationId: uuid,
    quantity: z.coerce.number().int().positive().max(1000000),
    ttlSeconds: z.coerce.number().int().positive().max(86400).default(Number(process.env.RESERVATION_TTL_SECONDS || 900)),
  }),
});

const reservationTokenSchema = z.object({
  params: z.object({
    token: z.string().min(8),
  }),
});

const recordSaleSchema = z.object({
  body: z.object({
    productId: uuid,
    locationId: uuid,
    quantity: z.coerce.number().int().positive().max(1000000),
    unitPrice: money,
    soldAt: z.coerce.date().optional(),
  }),
});

const forecastSchema = z.object({
  params: z.object({
    productId: uuid,
  }),
  query: z.object({
    locationId: uuid,
    days: z.coerce.number().int().min(1).max(365).default(30),
    leadTimeDays: z.coerce.number().int().min(1).max(120).default(7),
    safetyStock: z.coerce.number().int().min(0).max(100000).default(5),
  }),
});

const createSupplierSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(160),
    email: z.string().email().optional(),
    contactName: z.string().min(2).max(120).optional(),
    phone: z.string().min(4).max(40).optional(),
  }),
});

const listSuppliersSchema = z.object({
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().max(80).optional(),
  }),
});

const supplierIdParamSchema = z.object({
  params: z.object({
    supplierId: uuid,
  }),
});

const updateSupplierSchema = supplierIdParamSchema.extend({
  body: z.object({
    name: z.string().min(2).max(160).optional(),
    email: z.string().email().nullable().optional(),
    contactName: z.string().min(2).max(120).nullable().optional(),
    phone: z.string().min(4).max(40).nullable().optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  }),
});

const purchaseOrderItemSchema = z.object({
  productId: uuid,
  quantity: z.coerce.number().int().positive().max(1000000),
  unitCost: money.optional(),
});

const createPurchaseOrderSchema = z.object({
  body: z.object({
    supplierId: uuid,
    expectedAt: z.coerce.date().optional(),
    items: z.array(purchaseOrderItemSchema).min(1).max(100),
  }),
});

const listPurchaseOrdersSchema = z.object({
  query: z.object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: z.enum(["DRAFT", "SENT", "RECEIVED", "CANCELLED"]).optional(),
  }),
});

const purchaseOrderIdParamSchema = z.object({
  params: z.object({
    purchaseOrderId: uuid,
  }),
});

const receivePurchaseOrderSchema = purchaseOrderIdParamSchema.extend({
  body: z.object({
    locationId: uuid,
    receivedItems: z.array(z.object({
      productId: uuid,
      quantity: z.coerce.number().int().positive().max(1000000),
    })).optional(),
  }),
});

module.exports = {
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
};
