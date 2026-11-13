ALTER TABLE "ProductVariant"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "CartItem"
ADD COLUMN "variantId" UUID,
ADD COLUMN "lineKey" TEXT;

UPDATE "CartItem"
SET "lineKey" = 'product:' || "productId"::text;

ALTER TABLE "CartItem"
ALTER COLUMN "lineKey" SET NOT NULL;

DROP INDEX "CartItem_cartId_productId_key";
CREATE UNIQUE INDEX "CartItem_cartId_lineKey_key"
ON "CartItem"("cartId", "lineKey");
CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");

ALTER TABLE "CartItem"
ADD CONSTRAINT "CartItem_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem"
ADD COLUMN "variantId" UUID,
ADD COLUMN "variantName" TEXT;

ALTER TABLE "OrderItem"
ADD CONSTRAINT "OrderItem_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryReservation"
ADD COLUMN "variantId" UUID,
ADD COLUMN "lineKey" TEXT;

UPDATE "InventoryReservation"
SET "lineKey" = 'product:' || "productId"::text;

ALTER TABLE "InventoryReservation"
ALTER COLUMN "lineKey" SET NOT NULL;

DROP INDEX "InventoryReservation_orderId_productId_key";
CREATE UNIQUE INDEX "InventoryReservation_orderId_lineKey_key"
ON "InventoryReservation"("orderId", "lineKey");
CREATE INDEX "InventoryReservation_variantId_idx"
ON "InventoryReservation"("variantId");

ALTER TABLE "InventoryReservation"
ADD CONSTRAINT "InventoryReservation_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
