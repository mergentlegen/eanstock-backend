const request = require("supertest");
const { createApp } = require("../src/app");
const { prisma } = require("../src/config/database");

const app = createApp();

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.inventoryTransfer.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("authentication and RBAC", () => {
  test("registers, logs in, accesses protected route, refreshes, and logs out", async () => {
    const registration = await request(app)
      .post("/auth/register")
      .send({
        tenantName: "Aruzhan Mini Market",
        email: "owner@example.com",
        username: "owner_user",
        password: "StrongPass1!",
      })
      .expect(201);

    expect(registration.body.accessToken).toBeTruthy();
    expect(registration.body.refreshToken).toBeTruthy();

    await request(app).get("/auth/me").expect(401);

    const login = await request(app)
      .post("/auth/login")
      .send({ email: "owner@example.com", password: "StrongPass1!" })
      .expect(200);

    await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  test("returns 403 when authenticated role lacks permission", async () => {
    const staff = await request(app)
      .post("/auth/register")
      .send({
        tenantName: "Staff Tenant",
        email: "staff@example.com",
        username: "staff_user",
        password: "StrongPass1!",
        role: "STAFF",
      })
      .expect(201);

    await request(app)
      .post("/locations")
      .set("Authorization", `Bearer ${staff.body.accessToken}`)
      .send({ name: "Main Store", code: "MAIN" })
      .expect(403);
  });
});
