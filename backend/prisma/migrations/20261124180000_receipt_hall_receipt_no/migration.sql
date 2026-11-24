-- Receipt redesign + anti-forgery (2026-11-24).
-- 1. Student hall: nullable TEXT, so students registered before this
--    change keep working and set their hall via PATCH /api/auth/me.
-- 2. Payment receipt number: nullable TEXT with a unique index.
--    It is generated once when a payment completes (RUET-2026-000123);
--    PENDING payments have NULL, and Postgres allows multiple NULLs in
--    a unique index, so no backfill is needed.
-- Recommended path at this early stage (see README / NEON_SETUP):
--   cd backend && npx prisma migrate reset && npm run db:seed
-- Do NOT run `migrate reset` after real payments exist — it wipes data.
-- On an existing database, `npx prisma migrate dev` applies this
-- migration in place instead; existing payments keep receiptNo NULL
-- until they complete, and existing students keep hall NULL until
-- they set it.

ALTER TABLE "students" ADD COLUMN "hall" TEXT;

ALTER TABLE "payments" ADD COLUMN "receipt_no" TEXT;

CREATE UNIQUE INDEX "payments_receipt_no_key" ON "payments"("receipt_no");
