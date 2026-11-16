ALTER TABLE "User"
  ADD COLUMN "staffSetupRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "staffSetupExpiresAt" TIMESTAMP(3);
