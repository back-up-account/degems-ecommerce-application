ALTER TABLE "Order"
ADD COLUMN "cartId" UUID,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "customerName" TEXT,
ADD COLUMN "customerEmail" TEXT,
ADD COLUMN "customerPhone" TEXT,
ADD COLUMN "deliveryMethod" TEXT,
ADD COLUMN "deliveryFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_cartId_fkey"
FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryReservation_orderId_productId_key"
ON "InventoryReservation"("orderId", "productId");
CREATE INDEX "InventoryReservation_expiresAt_releasedAt_idx"
ON "InventoryReservation"("expiresAt", "releasedAt");

ALTER TABLE "InventoryReservation"
ADD CONSTRAINT "InventoryReservation_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryReservation"
ADD CONSTRAINT "InventoryReservation_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
