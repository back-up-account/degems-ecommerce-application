CREATE TABLE "DeliveryZone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "deliveryFee" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
ADD COLUMN "deliveryZoneId" UUID,
ADD COLUMN "deliveryZoneName" TEXT,
ADD COLUMN "deliveryAddress" TEXT;

CREATE UNIQUE INDEX "DeliveryZone_name_key" ON "DeliveryZone"("name");
CREATE INDEX "DeliveryZone_active_name_idx" ON "DeliveryZone"("active", "name");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_deliveryZoneId_fkey"
FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
