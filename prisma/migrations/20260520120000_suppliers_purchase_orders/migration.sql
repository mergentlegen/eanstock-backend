ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUPPLIER_DELETED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_RECEIVED';
ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_ORDER_CANCELLED';

CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');

ALTER TABLE "Product" ADD COLUMN "supplierId" UUID;

CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrderItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_tenantId_name_key" ON "Supplier"("tenantId", "name");
CREATE INDEX "Supplier_tenantId_email_idx" ON "Supplier"("tenantId", "email");
CREATE INDEX "Product_tenantId_supplierId_idx" ON "Product"("tenantId", "supplierId");
CREATE INDEX "PurchaseOrder_tenantId_status_createdAt_idx" ON "PurchaseOrder"("tenantId", "status", "createdAt");
CREATE INDEX "PurchaseOrder_tenantId_supplierId_createdAt_idx" ON "PurchaseOrder"("tenantId", "supplierId", "createdAt");
CREATE UNIQUE INDEX "PurchaseOrderItem_purchaseOrderId_productId_key" ON "PurchaseOrderItem"("purchaseOrderId", "productId");
CREATE INDEX "PurchaseOrderItem_tenantId_productId_idx" ON "PurchaseOrderItem"("tenantId", "productId");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
