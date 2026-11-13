CREATE TABLE "AdminAuthThrottle" (
    "userId" UUID NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminAuthThrottle_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "AdminAuthThrottle_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AdminAuthThrottle_lockedUntil_idx" ON "AdminAuthThrottle"("lockedUntil");
