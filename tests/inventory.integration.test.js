const request = require("supertest");
const { createApp } = require("../src/app");
const { prisma } = require("../src/config/database");

const app = createApp();

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.emailToken.deleteMany();
  await prisma.inventoryTransfer.deleteMany();
  await prisma.inventoryReservation.deleteMany();
  await prisma.salesRecord.deleteMany();
  await prisma.purchaseOrderItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("LeanStock inventory transaction", () => {
  test("transfers stock atomically and prevents overselling", async () => {
    await request(app)
      .post("/auth/register")
      .send({
        tenantName: "Lean Mart",
        email: "merchant@example.com",
        username: "merchant_user",
        password: "StrongPass1!",
      })
      .expect(201);

    const user = await prisma.user.findUnique({ where: { email: "merchant@example.com" } });
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "merchant@example.com", password: "StrongPass1!" })
      .expect(200);

    const token = login.body.accessToken;

    const source = await request(app)
      .post("/locations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Shop A", code: "SHOP_A" })
      .expect(201);

    const destination = await request(app)
      .post("/locations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Shop B", code: "SHOP_B" })
      .expect(201);

    const product = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sku: "MILK-1L",
        name: "Milk 1L",
        supplierCost: 300,
        basePrice: 500,
        decayPercent: 10,
      })
      .expect(201);

    await request(app)
      .post("/inventory/stock")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.body.product.id,
        locationId: source.body.location.id,
        quantity: 10,
      })
      .expect(200);

    await request(app)
      .post("/inventory/transfers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.body.product.id,
        sourceLocationId: source.body.location.id,
        destinationLocationId: destination.body.location.id,
        quantity: 7,
      })
      .expect(201);

    await request(app)
      .post("/inventory/transfers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        productId: product.body.product.id,
        sourceLocationId: source.body.location.id,
        destinationLocationId: destination.body.location.id,
        quantity: 10,
      })
      .expect(409);

    const sourceStock = await prisma.inventoryItem.findFirst({
      where: { productId: product.body.product.id, locationId: source.body.location.id },
    });
    const destinationStock = await prisma.inventoryItem.findFirst({
      where: { productId: product.body.product.id, locationId: destination.body.location.id },
    });

    expect(sourceStock.quantity).toBe(3);
    expect(destinationStock.quantity).toBe(7);
  });

  test("creates, sends, and receives a purchase order into inventory", async () => {
    await request(app)
      .post("/auth/register")
      .send({
        tenantName: "PO Mart",
        email: "po-owner@example.com",
        username: "po_owner_user",
        password: "StrongPass1!",
      })
      .expect(201);

    const user = await prisma.user.findUnique({ where: { email: "po-owner@example.com" } });
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "po-owner@example.com", password: "StrongPass1!" })
      .expect(200);
    const token = login.body.accessToken;

    const location = await request(app)
      .post("/locations")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Receiving Dock", code: "DOCK" })
      .expect(201);

    const supplier = await request(app)
      .post("/suppliers")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Astana Supply", email: "supplier@example.com" })
      .expect(201);

    const product = await request(app)
      .post("/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        sku: "RICE-1KG",
        name: "Rice 1kg",
        supplierId: supplier.body.supplier.id,
        supplierCost: 400,
        basePrice: 700,
      })
      .expect(201);

    const created = await request(app)
      .post("/purchase-orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        supplierId: supplier.body.supplier.id,
        items: [{ productId: product.body.product.id, quantity: 12, unitCost: 390 }],
      })
      .expect(201);

    await request(app)
      .post(`/purchase-orders/${created.body.purchaseOrder.id}/send`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await request(app)
      .post(`/purchase-orders/${created.body.purchaseOrder.id}/receive`)
      .set("Authorization", `Bearer ${token}`)
      .send({ locationId: location.body.location.id })
      .expect(200);

    const stock = await prisma.inventoryItem.findFirst({
      where: {
        tenantId: user.tenantId,
        productId: product.body.product.id,
        locationId: location.body.location.id,
      },
    });
    expect(stock.quantity).toBe(12);

    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: created.body.purchaseOrder.id },
    });
    expect(purchaseOrder.status).toBe("RECEIVED");
  });
});
