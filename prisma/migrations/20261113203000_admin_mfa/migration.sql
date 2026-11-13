ALTER TABLE "User"
    ADD COLUMN "mfaSecret" TEXT,
    ADD COLUMN "mfaEnabledAt" TIMESTAMP(3),
    ADD COLUMN "mfaLastStep" INTEGER;

CREATE TABLE "AdminRecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "AdminRecoveryCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminRecoveryCode_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AdminRecoveryCode_tokenHash_key" ON "AdminRecoveryCode"("tokenHash");
CREATE INDEX "AdminRecoveryCode_userId_usedAt_idx" ON "AdminRecoveryCode"("userId", "usedAt");
