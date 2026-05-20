const { queueEmail } = require("../src/services/email.service");

describe("email queue", () => {
  test("builds an asynchronous email job payload in test mode", async () => {
    const job = await queueEmail({
      to: "manager@example.com",
      subject: "Low stock alert",
      text: "Milk 1L is below threshold.",
      html: "<p>Milk 1L is below threshold.</p>",
      eventType: "LOW_STOCK_ALERT",
      metadata: { tenantId: "tenant-demo", productId: "product-demo" },
    });

    expect(job.name).toBe("send-email");
    expect(job.data.to).toBe("manager@example.com");
    expect(job.data.eventType).toBe("LOW_STOCK_ALERT");
    expect(job.data.metadata.productId).toBe("product-demo");
  });
});
