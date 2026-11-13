CREATE TABLE "PendingAccount" (
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingAccount_pkey" PRIMARY KEY ("email")
);

CREATE INDEX "PendingAccount_expiresAt_idx" ON "PendingAccount"("expiresAt");

ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
