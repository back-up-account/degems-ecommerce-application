CREATE TABLE "InvoiceAccess" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceAccess_tokenHash_key" ON "InvoiceAccess"("tokenHash");
CREATE INDEX "InvoiceAccess_orderId_createdAt_idx" ON "InvoiceAccess"("orderId", "createdAt");

ALTER TABLE "InvoiceAccess"
ADD CONSTRAINT "InvoiceAccess_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD COLUMN "bankTransferReference" TEXT,
ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedById" UUID;

CREATE UNIQUE INDEX "Payment_bankTransferReference_key" ON "Payment"("bankTransferReference");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_confirmedById_fkey"
FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx"
ON "AuditLog"("entityType", "entityId", "createdAt");

ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
