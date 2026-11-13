ALTER TABLE "User"
ADD COLUMN "disabledAt" TIMESTAMP(3);

ALTER TABLE "Order"
ADD COLUMN "dispatchProvider" TEXT,
ADD COLUMN "dispatchReference" TEXT,
ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3);

ALTER TABLE "Payment"
ADD COLUMN "refundReference" TEXT,
ADD COLUMN "refundedAt" TIMESTAMP(3),
ADD COLUMN "refundedById" UUID;

CREATE UNIQUE INDEX "Payment_refundReference_key" ON "Payment"("refundReference");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_refundedById_fkey"
FOREIGN KEY ("refundedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "orderId" UUID,
    "eventType" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "payload" JSONB,
    "secretPayload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_status_availableAt_createdAt_idx"
ON "Notification"("status", "availableAt", "createdAt");
CREATE INDEX "Notification_orderId_createdAt_idx"
ON "Notification"("orderId", "createdAt");

ALTER TABLE "Notification"
ADD CONSTRAINT "Notification_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
