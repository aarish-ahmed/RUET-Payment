-- Unified login by role (2026-11-24): removes the separate Teacher
-- model/login added in 20261124190000_teacher.
-- 1. DROP TABLE "teachers" — teachers are now ordinary accounts in
--    the students table with role='TEACHER' (see below).
-- 2. Role enum + students.role (default STUDENT). Every new
--    registration is a STUDENT; Jidan assigns TEACHER to specified
--    accounts: UPDATE students SET role='TEACHER' WHERE roll='...' OR
--    email='...'; (see README "Teacher system").
-- 3. students.email becomes UNIQUE so login by email is unambiguous.
--    Postgres allows multiple NULLs in a unique index, so students
--    without an email are unaffected.
-- Recommended path at this early stage (see README / NEON_SETUP):
--   cd backend && npx prisma migrate reset && npm run db:seed
-- Do NOT run `migrate reset` after real payments exist — it wipes data.
-- On an existing database, `npx prisma migrate dev` applies this
-- migration in place instead. Existing accounts keep working and
-- become STUDENT by default; re-assign TEACHER roles afterwards,
-- and re-create the demo teacher with `npm run db:seed`
-- (teacher@ruet.ac.bd / teacher123, roll T-001).

DROP TABLE IF EXISTS "teachers";

CREATE TYPE "Role" AS ENUM ('STUDENT', 'TEACHER');

ALTER TABLE "students" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'STUDENT';

CREATE UNIQUE INDEX "students_email_key" ON "students"("email");
