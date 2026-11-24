# RUET Fee Payment — Neon setup checklist

The project is built and verified (backend typecheck + build clean, frontend
`next build` clean). This is the one remaining step before a real end-to-end
test: point it at a live Neon Postgres database, seed it, and run a test
payment in SSLCommerz sandbox mode.

## 1. Create the Neon database (about 5 minutes)

1. Go to https://neon.tech and sign in / create a free account.
2. Create a new project (any name, e.g. `ruet-fee-payment`, region closest to
   Bangladesh / Singapore).
3. Open the project dashboard → **Connection Details**.
4. Copy the connection string. It looks like:
   `postgresql://<user>:<password>@<host>/<database>?sslmode=require`
   Keep the `?sslmode=require` at the end.

## 2. Configure the backend

In VS Code, from the `ruet-fee-payment/` folder:

```bash
cp .env.example backend/.env
cp .env.example frontend/.env.local
```

Edit `backend/.env` and set at least:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>/<database>?sslmode=require"
JWT_SECRET="change-this-to-a-long-random-secret"
SSLCOMMERZ_STORE_ID="testbox"
SSLCOMMERZ_STORE_PASSWORD="qwerty"
SSLCOMMERZ_MODE="sandbox"
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:5000"
PORT="5000"
```

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL="http://localhost:5000"
```

`testbox` / `qwerty` are SSLCommerz's public sandbox test credentials.
For live payments, set `SSLCOMMERZ_MODE="live"` and use the real store ID /
password from the SSLCommerz merchant panel. Never commit real credentials.

## 3. Migrate and seed

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate reset
npm run db:seed
```

**If you already ran an earlier version:** use `npx prisma migrate reset`
(the recommended path at this early stage) — it wipes the database,
which is safe while only seeded data exists. Do NOT run
`migrate reset` after real payments exist. The latest migration
(`20261124190001_unified_role_login`) drops the old separate
`teachers` table and adds `students.role` (default STUDENT) plus a
unique index on `students.email`. On an existing database,
`npx prisma migrate dev` applies it in place instead — existing
accounts become STUDENT by default; re-assign TEACHER roles
afterwards (see README "Teacher system") and re-run the seed for
the seeded teacher.

Seeding creates all 14 departments and **233 real courses**
(ECE, EEE, ARCH fully verified against their official syllabi; CE and
MSE 1st year only — see `backend/prisma/courses-data.ts`), plus a
seeded student and a seeded teacher:

- Student — Roll: `1903001`, password: `student123`, department: `CSE`
- Teacher — Roll: `T-001` or email `teacher@ruet.ac.bd`, password:
  `teacher123`, role TEACHER (logs in from the same `/login` page)

**Pricing (fixed):** odd terms 19 credits = **395 BDT**, even terms
21 credits = **435 BDT** (20 BDT per credit + 15 BDT online charge).
Any department and term can pay — no course list is needed.

**Terms:** RUET uses terms, not Semester 1-8 — 1st Odd through
5th Even. Architecture is the only 5-year program (10 terms); the
other 13 departments end at 4th Even.

## 4. Run it

Two terminals in VS Code:

```bash
# Terminal 1 — backend on http://localhost:5000
cd backend
npm run dev

# Terminal 2 — frontend on http://localhost:3000
cd frontend
npm run dev
```

Open http://localhost:3000, log in as `1903001` / `student123`, pick a
department, term and fee type, and pay in SSLCommerz sandbox (use a
sandbox test card from the SSLCommerz test panel).

## 5. First test payment — what to check

- The payment card shows total credits and the price breakdown
  (e.g. 19 × 20 BDT = 380 + 15 online charge = 395 BDT). No course list.
- After paying, the receipt opens at `/receipt/<paymentId>` with the
  receipt number, transaction ID, roll, name, hall, department, term,
  fee type, total credits, price breakdown, amount and status `COMPLETED`.
- The same payment appears in `GET /api/ledger/payments` (student
  history) and in the teacher dashboard at `/login` →
  `/teacher/dashboard` (seeded teacher: roll `T-001` or email
  `teacher@ruet.ac.bd` / `teacher123`). **Payment is recorded only in
  Postgres. There is no Excel or Google Sheet** — no file is created
  on completion.
- Trying to pay again for the same roll + department + term + fee
  type is blocked once the first payment is `COMPLETED`.
- The backend terminal shows `[sslcommerz] success callback
  method=POST …` and `[sslcommerz] validation … status=VALID …`.
  If a payment stays PENDING, see `SSLCOMMERZ_TROUBLESHOOTING.md` —
  the success/fail/cancel routes now accept both GET and POST, and
  IPN cannot reach `http://localhost:5000` from the sandbox (expected
  locally; the success-redirect POST is the primary path).

## 6. Pricing and the (optional) official course lists

**Pricing is fixed and needs no official fee table any more:**
20 BDT per credit + 15 BDT online charge; odd terms 19 credits
(395 BDT), even terms 21 credits (435 BDT). It lives only in
`backend/src/config/fees.ts` — change the rates there and they
change everywhere.

Real courses are already seeded for ECE, EEE, ARCH, and CE/MSE
1st year; the rest are intentionally empty, not sample data — but
**payment does not need them**. If you want the course lists in the
system for future use, see `backend/prisma/courses-data.ts`
(`PENDING_DEPARTMENTS` — it lists the exact official source URL to
check for each pending department/term): add rows to
`backend/prisma/official-courses-template.csv`
(columns: `departmentCode,semester,code,title,credits` — `semester`
is a term code, e.g. `1_ODD`), one row per real course from that
department's official syllabus, then copy them into
`backend/prisma/courses-data.ts` (`REAL_COURSES`) and re-run
`npm run db:seed`. Do not invent course codes, titles or credits.
`backend/prisma/official-fees-template.csv` is kept for reference
only and is no longer read by the code.

## If something fails

- `The column 'payments.receiptNo' does not exist in the current
  database` on Pay: this was a naming bug, fixed in this version.
  Replace files with the new zip, then in `backend/` run
  `npx prisma generate`, `npx prisma migrate deploy`, restart the
  backend with `npm run dev`. No data loss, no `migrate reset`, no
  `db:seed` needed. (Root cause: migration `20261124180000` created
  the column as `"receipt_no"`, but the schema had no `@map`, so
  Prisma queried `"receiptNo"`. Migration
  `20261124193000_receipt_no_map` adds the `@map` mapping; see
  README "Troubleshooting — column `payments.receiptNo`".)
- `npx prisma generate` failing with a network error: check the internet
  connection and retry — on a normal network it works without any code
  change.
- `P1001` / connection refused from Prisma: the `DATABASE_URL` is wrong
  or Neon is paused — re-copy it from the Neon dashboard, including
  `?sslmode=require`.
- SSLCommerz redirect failing in sandbox: confirm `SSLCOMMERZ_MODE="sandbox"`,
  store ID `testbox`, password `qwerty`, and that `BACKEND_URL` is
  reachable from the browser.
- Payment stays PENDING after paying: see
  `SSLCOMMERZ_TROUBLESHOOTING.md` and paste the backend terminal lines
  starting `[sslcommerz]`, plus the output of
  `GET /api/payments/debug/<tran_id>` (logged in).
