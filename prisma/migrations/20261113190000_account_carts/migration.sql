ALTER TABLE "Cart"
    ALTER COLUMN "guestToken" DROP NOT NULL,
    ALTER COLUMN "expiresAt" DROP NOT NULL,
    ADD COLUMN "userId" UUID;

CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");

ALTER TABLE "Cart"
    ADD CONSTRAINT "Cart_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
