-- Migrate Semester 1-8 (Int) to RUET term codes (TEXT).
--   1 -> 1_ODD (1st Odd)      2 -> 1_EVEN (1st Even)
--   3 -> 2_ODD (2nd Odd)      4 -> 2_EVEN (2nd Even)
--   5 -> 3_ODD (3rd Odd)      6 -> 3_EVEN (3rd Even)
--   7 -> 4_ODD (4th Odd)      8 -> 4_EVEN (4th Even)
-- 5th Odd / 5th Even (5_ODD / 5_EVEN) have no old equivalent: they are
-- Architecture only, and their courses arrive with the re-seed.
--
-- The DO blocks only alter the column when it is still an integer, so
-- this migration is a no-op on a fresh database created by the init
-- migration (where semester is already TEXT). That is what makes
-- `npx prisma migrate reset` work cleanly at this early stage.
-- Recommended path for this update (see README / NEON_SETUP):
--   cd backend && npx prisma migrate reset && npm run db:seed
-- Do NOT run `migrate reset` after real payments exist — it wipes data.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'semester' AND data_type = 'integer'
  ) THEN
    ALTER TABLE "courses" ALTER COLUMN "semester" TYPE TEXT USING CASE "semester"
      WHEN 1 THEN '1_ODD'
      WHEN 2 THEN '1_EVEN'
      WHEN 3 THEN '2_ODD'
      WHEN 4 THEN '2_EVEN'
      WHEN 5 THEN '3_ODD'
      WHEN 6 THEN '3_EVEN'
      WHEN 7 THEN '4_ODD'
      WHEN 8 THEN '4_EVEN'
      ELSE '1_ODD'
    END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'semester' AND data_type = 'integer'
  ) THEN
    ALTER TABLE "payments" ALTER COLUMN "semester" TYPE TEXT USING CASE "semester"
      WHEN 1 THEN '1_ODD'
      WHEN 2 THEN '1_EVEN'
      WHEN 3 THEN '2_ODD'
      WHEN 4 THEN '2_EVEN'
      WHEN 5 THEN '3_ODD'
      WHEN 6 THEN '3_EVEN'
      WHEN 7 THEN '4_ODD'
      WHEN 8 THEN '4_EVEN'
      ELSE '1_ODD'
    END;
  END IF;
END $$;
