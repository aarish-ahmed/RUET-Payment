-- Teacher system (2026-11-24): a separate Teacher model with its own
-- login, separate from students. Teachers see the list of PAID
-- students and can download it as .xlsx (generated in memory on
-- demand — no file is ever written to disk; the old auto-created
-- Excel ledger stays removed).
-- Recommended path at this early stage (see README / NEON_SETUP):
--   cd backend && npx prisma migrate reset && npm run db:seed
-- Do NOT run `migrate reset` after real payments exist — it wipes data.
-- On an existing database, `npx prisma migrate dev` applies this
-- migration in place instead.

CREATE TABLE "teachers" (
    "id"              TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "email"           TEXT NOT NULL,
    "departmentCode"  TEXT,
    "passwordHash"    TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "teachers_email_key" ON "teachers"("email");

ALTER TABLE "teachers"
    ADD CONSTRAINT "teachers_departmentCode_fkey"
    FOREIGN KEY ("departmentCode") REFERENCES "departments"("code")
    ON DELETE SET NULL ON UPDATE CASCADE;
