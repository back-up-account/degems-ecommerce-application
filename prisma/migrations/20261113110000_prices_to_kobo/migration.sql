DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "Product"
        WHERE "price" NOT BETWEEN -21474836 AND 21474836
           OR "compareAtPrice" NOT BETWEEN -21474836 AND 21474836
    ) OR EXISTS (
        SELECT 1 FROM "ProductVariant"
        WHERE "price" NOT BETWEEN -21474836 AND 21474836
    ) OR EXISTS (
        SELECT 1 FROM "Order"
        WHERE "total" NOT BETWEEN -21474836 AND 21474836
           OR "deliveryFee" NOT BETWEEN -21474836 AND 21474836
    ) OR EXISTS (
        SELECT 1 FROM "OrderItem"
        WHERE "unitPrice" NOT BETWEEN -21474836 AND 21474836
    ) OR EXISTS (
        SELECT 1 FROM "Payment"
        WHERE "amount" NOT BETWEEN -21474836 AND 21474836
    ) THEN
        RAISE EXCEPTION 'Cannot convert prices to kobo: a value exceeds the supported PostgreSQL integer range. Review affected records and migrate them explicitly.';
    END IF;
END $$;

UPDATE "Product"
SET "price" = "price" * 100,
    "compareAtPrice" = "compareAtPrice" * 100;

UPDATE "ProductVariant"
SET "price" = "price" * 100
WHERE "price" IS NOT NULL;

UPDATE "Order"
SET "total" = "total" * 100,
    "deliveryFee" = "deliveryFee" * 100;

UPDATE "OrderItem"
SET "unitPrice" = "unitPrice" * 100;

UPDATE "Payment"
SET "amount" = "amount" * 100;
