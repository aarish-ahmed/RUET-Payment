-- Fix for: "The column `payments.receiptNo` does not exist in the
-- current database" on Pay (prisma.payment.findUnique in
-- backend/src/routes/payments.ts:164, and findMany in
-- backend/src/routes/ledger.ts:36).
--
-- Root cause: migration 20261124180000_receipt_hall_receipt_no
-- created this column as snake_case "receipt_no", but
-- schema.prisma declared `receiptNo String? @unique` with no @map,
-- so Prisma queried the camelCase column "receiptNo", which was
-- never created. Every other column in the schema is camelCase
-- ("tranId", "studentRoll", "amountBdt", "createdAt", ...), so that
-- one migration was the only inconsistent one. This was why
-- `npx prisma migrate deploy` reported "No pending migrations to
-- apply" — the migration HAD applied; it just created the column
-- under a different name than Prisma expected.
--
-- Fix (schema-only): `receiptNo` in schema.prisma now has
-- `@map("receipt_no")`, so Prisma maps to the column that already
-- exists. The database column is NOT renamed and no data is lost.
--
-- This migration itself is deliberately idempotent and a no-op on
-- every database it can meet:
--   * Jidan's Neon DB (20261124180000 already applied, column is
--     "receipt_no"): both DO blocks find nothing to do.
--   * A fresh DB (all migrations run in order, column is created
--     as "receipt_no" by 20261124180000): both DO blocks find
--     nothing to do.
--   * A hypothetical DB where the column was created as camelCase
--     "receiptNo" (e.g. by an earlier manual fix): the first DO
--     block renames it to "receipt_no", so it matches @map.
-- The second DO block renames the unique index to Prisma's default
-- name "payments_receiptNo_key" (it was created as
-- "payments_receipt_no_key"), so a future `prisma migrate dev`
-- does not try to rename it. Both blocks are guarded by
-- information_schema / pg_indexes checks, so they never fail.
--
-- Apply: replace files with the new zip, then in backend:
--   npx prisma generate
--   npx prisma migrate deploy   (applies only this migration)
--   npm run dev                 (restart the backend)
-- No data loss, no `migrate reset`, no `db:seed` needed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'receiptNo'
  ) THEN
    ALTER TABLE "payments" RENAME COLUMN "receiptNo" TO "receipt_no";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'payments_receipt_no_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'payments_receiptNo_key'
  ) THEN
    ALTER INDEX "payments_receipt_no_key" RENAME TO "payments_receiptNo_key";
  END IF;
END $$;
