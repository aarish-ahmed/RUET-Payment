# RUET Central Online Fee Payment & Automated Ledger System

Production-grade, end-to-end web application for **Rajshahi University
of Engineering & Technology (RUET)** that digitizes departmental academic fee
payments across all 14 departments, with SSLCommerz payment, server-side
amount verification, a printable receipt with QR verification, and a
teacher dashboard for checking paid students (teachers log in from the
same login page and are redirected by their role).

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS v4 |
| Backend | Node.js 20+ + Express 5 + TypeScript — **strict ESM only** (`"type": "module"`, `module: NodeNext`) |
| Database | Neon Postgres (`?sslmode=require`) + Prisma ORM |
| Payment | SSLCommerz API v4 (session initiation + server-side validation + IPN) |
| Receipt verification | QR code + HMAC-SHA256 signature + public `/verify` page (spot-check only) |
| Teacher export | ExcelJS — on-demand `.xlsx` download of the filtered paid-students list, generated in memory (no file is written to disk) |
| Auth | bcryptjs + JSON Web Tokens, with one account table and role `STUDENT` / `TEACHER` |

## Terms — RUET does not use "Semester 1-8"

RUET uses **terms**: 1st Odd, 1st Even, 2nd Odd, 2nd Even, 3rd Odd,
3rd Even, 4th Odd, 4th Even, 5th Odd, 5th Even. The database stores
the term code (`1_ODD`, `1_EVEN`, …, `5_EVEN`); the UI and the teacher
list show the label (`1st Odd`, …).

**Architecture is the only 5-year program.** ARCH shows all 10 terms.
Every other department is a 4-year program ending at 4th Even: the
term dropdown shows 8 terms for them, and the backend rejects a
5th-term quote/payment for a non-ARCH department with a clear error:
"5th Odd/Even is Architecture only".

## Pricing — fixed, no course list

| Item | Value |
|---|---|
| Per credit | **20 BDT** |
| Online charge | **15 BDT** flat, once per payment |
| Total credits, odd terms (1st/2nd/3rd/4th/5th Odd) | **19 credits** |
| Total credits, even terms (1st/2nd/3rd/4th/5th Even) | **21 credits** |
| **Odd-term total** | 19 × 20 + 15 = **395 BDT** |
| **Even-term total** | 21 × 20 + 15 = **435 BDT** |

Both fee types (Semester Final Fee and Course Registration Fee) cost
the same. The rates live only in `backend/src/config/fees.ts`
(`PER_CREDIT_BDT`, `ONLINE_CHARGE_BDT`, `creditsForTerm`).

**There is no course list in the payment flow any more.** No course
names, titles or credits are shown on the payment details, receipt or
teacher list, and no course list is needed to pay. Total credits come
from the term only (odd = 19, even = 21), so **any of the 14
departments and any allowed term can pay** — a department/term with
no courses seeded no longer blocks payment. The `Course` table stays
in Prisma for future use only.

## Student flow

1. Student registers / logs in with roll number + password (JWT, bcrypt)
   — see "Login — one page, redirected by role" below.
2. Selects department (all 14 RUET departments), term and fee
   type: **Semester Final Fee** or **Course Registration Fee**.
3. The payment details shows roll, department, term, fee type, total
   credits and the price breakdown: "Total credits: 19 · 19 × 20 BDT =
   380 BDT + Online charge 15 BDT = Total 395 BDT" (21-credit terms:
   435 BDT).
4. Student pays via SSLCommerz. **The server recalculates total credits
   and amount from the term — frontend amounts are never
   trusted.** A payment is marked `COMPLETED` only after `val_id` is
   verified against SSLCommerz's server-side validation API with status
   `VALID`/`VALIDATED` and a matching BDT amount (compared numerically,
   so `5000.00` matches `5000`).
5. The record is stored in Postgres. A student cannot pay twice for the
   same `(studentRoll, departmentCode, semester, feeType)` once completed
   (Prisma unique constraint + server check).
6. **The record lives only in Postgres.** There is no Excel sheet
   and no Google Sheet — no file is created on payment completion.
   The student gets a printable receipt (see "Receipt" below) and
   department staff check payments in the teacher dashboard
   (see "Teacher system" below).

## Real courses — kept for future use, not needed for payment

Course lists are **real RUET courses, copied from the official
syllabi** in `backend/prisma/courses-data.ts` (see `SOURCES` there).
No sample or fake courses are seeded. They are still seeded by
`npm run db:seed` for future use, but **payment no longer reads them**
— see "Pricing" above. Verified so far (233 courses):

| Department | Terms verified | Source |
|---|---|---|
| ECE | All 8 terms (compulsory courses) | `ece.ruet.ac.bd` — ECE Proposed Syllabus (16-07-2016) |
| EEE | All 8 terms (compulsory courses) | `phy.ruet.ac.bd` — RUET Syllabus for Undergraduate Program (EEE) |
| ARCH | All 10 terms (compulsory courses) | `arch.ruet.ac.bd` — B. Arch Syllabus, Oct 2023 |
| CE | 1st Odd, 1st Even only | `ce.ruet.ac.bd` — CE OBE Syllabus Book |
| MSE | 1st Odd, 1st Even only | `mse.ruet.ac.bd` — MSE Proposed Syllabus |

**Still pending — no courses seeded, by design:** CE and MSE
2nd–4th year, and CSE, ME, ETE, IPE, CME, URP, ChE, BECM, MTE
(all terms). The exact source to check for each is listed in
`PENDING_DEPARTMENTS` in `backend/prisma/courses-data.ts`. A student
in a pending department/term can still pay — the price comes from
the term, not the course list. To add the courses for future use,
add rows to `backend/prisma/official-courses-template.csv` (same
columns as the verified rows), copy them into
`backend/prisma/courses-data.ts` (`REAL_COURSES`) and re-run the seed.

Two things to know about the verified data:

- **Optional / elective courses are not seeded.** ECE "Optional I–IV",
  EEE "Elective I–V" and the ARCH "only one" optional have no fixed
  code for a given student — the student chooses one.
- **EEE 4000 (Project & Thesis)** appears in both 4th Odd (1.5 cr)
  and 4th Even (3 cr) — that is correct in the official syllabus, one
  project split across the two terms (total 4.5 cr). The EEE 2nd Odd
  total in the PDF is printed as 20.50 but the rows add to 20.25;
  the row sum is used.

The old per-fee-type sample rates (Semester Final: base 1500 + 500/credit;
Course Registration: base 500 + 1000/credit) are **gone**, replaced by the
fixed pricing in "Pricing" above. `backend/prisma/official-fees-template.csv`
is kept for reference only and is no longer read by the code.

## Project structure

```
ruet-fee-payment/
  README.md
  NEON_SETUP.md               # Neon checklist (start here after cloning)
  SSLCOMMERZ_TROUBLESHOOTING.md
  .env.example            # copy to backend/.env and frontend/.env.local
  backend/
    package.json          # "type": "module"
    tsconfig.json         # module/moduleResolution: NodeNext
    prisma/schema.prisma  # semester is String (term code)
    prisma/seed.ts        # seeds departments + real courses only
    prisma/courses-data.ts  # verified courses + pending list + sources
    prisma/official-courses-template.csv  # 233 verified rows
    prisma/official-fees-template.csv
    prisma/migrations/20261124000000_init/migration.sql
    prisma/migrations/20261124120000_term_names/migration.sql
    prisma/migrations/20261124180000_receipt_hall_receipt_no/migration.sql
    prisma/migrations/20261124190000_teacher/migration.sql  # adds teachers table — superseded, see below
    prisma/migrations/20261124190001_unified_role_login/migration.sql  # drops teachers, adds students.role + unique email
    src/index.ts          # Express app entry
    src/config/env.ts     # typed env loading
    src/config/fees.ts    # fee rates — the ONLY place rates live
    src/config/terms.ts   # term codes, labels, ARCH-only rule
    src/config/halls.ts   # verified RUET hall list + sources
    src/lib/prisma.ts     # PrismaClient singleton
    src/middleware/auth.ts  # JWT, role student/teacher, requireAuth + requireTeacher (one account table)
    src/services/pricing.ts  # term -> credits -> 20 BDT/credit + 15 BDT charge; no Course table
    src/services/sslcommerz.ts
    src/services/receipt.ts  # receiptNo, HMAC signature, QR code
    src/routes/auth.ts    # register/login (roll or email)/me, PATCH /me (hall); role in JWT
    src/routes/teachers.ts  # teacher paid-students list/export (requireTeacher only, no login routes)
    src/routes/payments.ts
    src/routes/ledger.ts  # student payment history (Postgres only)
  frontend/
    package.json
    next.config.ts
    postcss.config.mjs
    public/ruet-logo.png  # official RUET logo from ruet.ac.bd
    app/layout.tsx app/page.tsx app/globals.css
    app/login/page.tsx
    app/dashboard/page.tsx   # term dropdown depends on department
    app/payment/success/page.tsx
    app/payment/fail/page.tsx
    app/receipt/[id]/page.tsx
    app/verify/[id]/page.tsx  # public receipt verification + lookup
    app/teacher/dashboard/page.tsx  # paid-students list + .xlsx download (no teacher login page — see below)
    components/Navbar.tsx components/PaymentCard.tsx
    lib/api.ts lib/types.ts   # TERMS, termLabel, termsForDepartment, HALLS
```

## Setup in VS Code

### 1. Prerequisites

- Node.js 20+ (tested on Node 24), npm 10+
- A Neon Postgres database — https://neon.tech — create a project and
  copy its connection string (it ends with `?sslmode=require`).
- SSLCommerz sandbox credentials for testing (see below).

### 2. Clone / open

Open the `ruet-fee-payment/` folder in VS Code.

### 3. Configure environment

```bash
cp .env.example backend/.env
cp .env.example frontend/.env.local
```

Edit `backend/.env`:

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
For live payments, set `SSLCOMMERZ_MODE="live"` and use your real
store ID / password from your SSLCommerz merchant panel. Never commit
real credentials.

### 4. Install, migrate, seed

**If you already ran the first version (Semester 1-8), this update
changes the semester column — run the reset below, not just
`migrate dev`. The reset wipes the database, which is safe at this
early stage (only seeded data exists). Do NOT run `migrate reset`
after real payments exist.**

```bash
# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate reset
npm run db:seed

# Frontend (new terminal)
cd frontend
npm install
```

`migrate reset` applies all migrations (term codes as TEXT; receipt
migration adds `students.hall` and `payments.receipt_no`; the teacher
migration adds the `teachers` table, and the unified-login migration
`20261124190001` immediately drops it again and adds `students.role`
+ a unique index on `students.email`), then re-seeds. Seeding creates
the 14 departments, the 233 verified real courses, a seeded student and
a seeded teacher:

- Student — Roll: `1903001`, password: `student123`, department: `CSE`, role STUDENT
- Teacher — Roll: `T-001` (staff ID) or email `teacher@ruet.ac.bd`,
  password: `teacher123`, role TEACHER, all departments (see
  "Teacher system" — change/delete in production)

Any department and term can pay — pick any department, e.g. CSE,
1st Odd (395 BDT) or 1st Even (435 BDT). No course list is needed.

### 5. Run (two terminals in VS Code)

```bash
# Terminal 1 — backend on http://localhost:5000
cd backend
npm run dev

# Terminal 2 — frontend on http://localhost:3000
cd frontend
npm run dev
```

Open http://localhost:3000, log in as `1903001` / `student123`,
pick a department, term and fee type, and pay in SSLCommerz
sandbox (use a sandbox test card from the SSLCommerz test panel).

Production build:

```bash
cd backend && npm run build && npm start
cd frontend && npm run build && npm start
```

## API endpoints (backend, base `http://localhost:5000`)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Register (roll, name, department, hall, password) — always role STUDENT; the client cannot set a role |
| POST | `/api/auth/login` | Login with **roll or email** + password, returns JWT with `role: "student"` or `"teacher"` (frontend redirects by role) |
| GET | `/api/auth/me` | Current student (JWT) |
| PATCH | `/api/auth/me` | Set / update own hall (JWT) |
| GET | `/api/teachers/me` | Current teacher (teacher JWT) — no `/api/teachers/register` or `/api/teachers/login` any more |
| GET | `/api/teachers/payments?departmentCode=&semester=1_ODD&feeType=&search=` | Paid students, COMPLETED only, server-side filters (teacher JWT) |
| GET | `/api/teachers/payments/export?departmentCode=&semester=&feeType=&search=` | Download the current filtered list as `.xlsx`, generated in memory (teacher JWT) |
| GET | `/api/payments/departments` | All 14 departments |
| POST | `/api/payments/quote` | Server-calculated payment details from the term only (JWT; teacher tokens get 403) |
| POST | `/api/payments/initiate` | Create PENDING payment, start SSLCommerz (JWT) |
| GET | `/api/payments/:id` | Payment / receipt data (JWT, owner only) |
| GET | `/api/payments/debug/:tranId` | Payment gateway state (JWT, owner only) |
| GET | `/api/payments/verify/:id?sig=…` | **Public, no login** — live verification of a receipt (see below) |
| GET | `/api/payments/lookup?q=…` | **Public, no login** — verify by roll or receipt number |
| GET/POST | `/api/payments/success?tran_id=…&val_id=…` | Server-side validation, marks COMPLETED |
| GET/POST | `/api/payments/fail?tran_id=…` | Marks FAILED |
| GET/POST | `/api/payments/cancel?tran_id=…` | Marks CANCELLED |
| POST | `/api/payments/ipn` | SSLCommerz IPN listener (validates `val_id`, best-effort) |
| GET | `/api/ledger/payments` | Student payment history from Postgres (JWT; optional `?department=&semester=1_ODD&feeType=&mine=1`) |

## No Excel / Google Sheet — payment lives only in Postgres

There is **no Excel sheet and no Google Sheet**. No file is created
when a payment completes, and there is no auto-appended ledger file
anywhere (`backend/data/ledger/` was removed, along with the old
`POST /api/ledger/rebuild` endpoint and `src/services/excel.ts`).

**Payment is recorded only in Postgres. There is no Excel or Google
Sheet.** The record is the `payments` row (status `COMPLETED`,
receipt number, transaction ID, completed date) plus the printable
receipt the student gets. Department staff check payments in the
teacher dashboard (`/teacher/dashboard`), which reads the same live
Postgres data — see "Teacher system" below.

The one exception is an **on-demand download**: a teacher can press
"Download list (.xlsx)" on the teacher dashboard and the backend
builds a `.xlsx` file **in memory** from the live Postgres query and
streams it back as a download. Nothing is written to disk, and it
does not recreate any ledger file.

## Halls

Registration asks for the student's residential hall, chosen from
the RUET hall list (`backend/src/config/halls.ts`,
`frontend/lib/types.ts` — `HALLS`). Source: the RUET provosts list
(`hum.ruet.ac.bd/list/provosts-of-residential-halls`) screenshots
provided by Jidan on 2026-11-24 — only these names are used:

- Shahid President Ziaur Rahman Hall
- Shahid Lt. Selim Hall
- Sher-e-Bangla A K Fazlul Huq Hall
- Shahid Abdul Hamid Hall
- Shahid Shahidul Islam Hall
- Tin Shed Hall (Extension)
- Male Hall-1
- Male Hall-2
- Male Hall-3
- Female Hall-1
- Female Hall-2
- Non-residential / Day Scholar
- Other

Deshratna Sheikh Hasina Hall and Bangabandhu Sheikh Mujibur Rahman
Hall were in an earlier build (from the 2024 syllabus list of seven
halls) but are **not** in the provosts-list screenshots, so they
were removed as named options. A student in such a hall should
choose "Other" for now. Existing students registered before halls
were added set their hall on the dashboard ("My Hall") via
`PATCH /api/auth/me` — no re-registration needed. The seeded student
(`1903001`) has no hall set; set it from the dashboard after logging in.

## Receipt

After a successful payment the student is taken to
`/receipt/<paymentId>` — a formal, printable receipt:

- Header: the official RUET logo (`frontend/public/ruet-logo.png`,
  downloaded from
  `https://ruet.ac.bd/public/assets/images/ruet_website_logo2.png`),
  "Rajshahi University of Engineering & Technology", "Official Fee
  Payment Receipt", and the unique receipt number (`RUET-<year>-<6-digit
  sequential>`, e.g. `RUET-2026-000123` — generated once when the
  payment completes, never reused).
- Student Roll, Student Name, Department, Term (label, e.g. 1st Odd),
  Hall, Fee Type, Transaction ID, Date of Payment, and **PAID AMOUNT
  (BDT)** in large bold type.
- Price breakdown: total credits, credits × 20 BDT, online charge
  15 BDT, total paid (e.g. "Total credits: 19 · 19 × 20 BDT = 380 BDT
  + Online charge 15 BDT = Total 395 BDT"). No course list.
- A QR code + verification URL, and a footer (see "Receipt
  verification" below).

**No receipt for a pending or failed payment.** A receipt exists
only for a `COMPLETED` payment. If a payment is `PENDING`, `FAILED`
or `CANCELLED`, `/receipt/<paymentId>` shows only a status card
("Payment Pending" / "Payment Failed", roll, term, fee type, amount
payable, status, and "No receipt has been generated for this
payment.") — no logo, no receipt number, no paid-amount receipt
block, no QR and no Print button. The dashboard shows a "Receipt"
link only for `COMPLETED` payments, and the teacher dashboard lists
`COMPLETED` payments only. A receipt number is issued only when a
payment becomes `COMPLETED`, never before.

If `frontend/public/ruet-logo.png` is ever missing, the receipt
falls back to a text "RUET" monogram. To replace the logo, overwrite
that file with the official RUET logo from `ruet.ac.bd`.

## Receipt verification (anti-forgery)

**A printed or screenshotted receipt is NEVER proof by itself. The
only proof is the live database record.**

Verification is about the student's **identity**, not just the amount:
when anyone scans the QR code, they get the student roll, student
name and paid amount — plus term, hall, department, fee type,
transaction ID and status — from the live database, to check that
the receipt really belongs to that student.

How it works:

- **Unique receipt number** — `payments.receiptNo`, e.g.
  `RUET-2026-000123`, generated once on completion.
- **QR code** — on the receipt, encoding the public verification URL
  `${FRONTEND_URL}/verify/<paymentId>?sig=<HMAC>`.
- **HMAC signature** — `HMAC-SHA256` over
  `id|tranId|studentRoll|studentName|amount (2dp)` with the server
  secret `RECEIPT_SECRET` (optional in `.env.example`; falls back to
  `JWT_SECRET`). The signature protects the roll/name/amount identity
  binding: a forged QR with a changed amount, roll or name fails
  signature validation. Verified server-side only.
- **Public verification endpoint** — `GET /api/payments/verify/:id?sig=…`
  (no login, read-only). Returns `valid: true` only if the signature
  matches **and** the payment status is `COMPLETED`; `valid: false`
  for PENDING / FAILED / CANCELLED, a missing payment, or a bad
  signature. It never leaks email or password.
- **Public verification page** — `/verify/<paymentId>`, big green
  VALID or red INVALID / NOT VERIFIED banner, showing in this order:
  Student Roll, Student Name, Paid Amount (BDT), then Term, Hall,
  Department, Fee Type, Transaction ID, Receipt No, and status. It
  also has a **quick lookup box**: type or paste a roll or receipt
  number (no QR needed) and get the same live result.
- The clerk's check: **"does the roll + name + amount on the receipt
  match the roll + name + amount on the live verification page?"**
  If they don't match, it's forged.

### Teacher workflow — QR is a spot-check only, not the normal path

Scanning a QR for every student would burden teachers, so it is
**not** required:

- **Primary check (no extra work):** the teacher dashboard
  (`/teacher/dashboard`) — find the roll in the paid-students list.
  If the roll + name + amount are there with status COMPLETED, the
  student paid. No scan, no extra step. See "Teacher system" below.
- **Spot-check only:** scan the QR (one scan, no login, big
  VALID/INVALID + roll/name/amount in under 2 seconds) only if a
  receipt looks suspicious, or use the lookup box on the verify page
  with the roll or receipt number.
- The receipt footer and this README say it plainly: *"Teachers do
  NOT need to scan every receipt. Check the teacher dashboard by
  roll. Scan the QR only if a receipt looks suspicious."*

## Login — one page, redirected by role

There is **one login page** (`/login`) for everyone — no separate
teacher login page, no separate teacher table, no extra hassle for
teachers.

- **Login identifier:** a roll number **or** an email + password.
  The backend looks up by roll first, then by email.
- **Roles:** one account table (`students`) with a `role` column
  (`STUDENT` / `TEACHER`, default `STUDENT`). The JWT carries the
  role, and after login the frontend redirects by role:
  `TEACHER` → `/teacher/dashboard`, `STUDENT` → `/dashboard`.
- **Students cannot see the teacher side:** there is no link to
  `/teacher/dashboard` in the student Navbar or dashboard, and a
  student token gets **403** from every `/api/teachers/*` endpoint
  (`requireTeacher`). A teacher token gets **403** from student
  payment endpoints (`requireAuth`), so a teacher can never pay as
  a student.
- **Registering never creates a teacher:** the client cannot send a
  role — every new registration is a STUDENT.

### How Jidan assigns TEACHER to a specified account

Pick the account (an existing student account, or one you create
for the teacher), then run one of these. The teacher then logs in
from the same `/login` page with their roll (staff ID) or email.

**Option A — SQL (psql / Neon SQL editor):**

```sql
UPDATE students SET role = 'TEACHER' WHERE roll = '<roll>';
-- or by email:
UPDATE students SET role = 'TEACHER' WHERE email = '<email>';
-- to take it back:
UPDATE students SET role = 'STUDENT' WHERE roll = '<roll>';
```

**Option B — Prisma (from `backend/`, needs `DATABASE_URL`):**

```bash
npx prisma studio
# open the Student table, find the account, set role to TEACHER
```

**Option C — seed a teacher** (`npm run db:seed` creates it):

- Roll: `T-001` (staff ID), email `teacher@ruet.ac.bd`, password
  `teacher123`, name "RUET Teacher", role TEACHER. **Change or
  delete this account in production.**

## Teacher system

Teachers are **ordinary accounts with role TEACHER** in the
`students` table — not a separate model. The old separate `Teacher`
model (`teachers` table, `POST /api/teachers/register`,
`POST /api/teachers/login`, `/teacher/login` page) was removed by
migration `20261124190001_unified_role_login`, which drops the
`teachers` table and adds `students.role` (default STUDENT) plus a
unique index on `students.email` (so login by email is unambiguous;
students without an email are unaffected — Postgres allows multiple
NULLs in a unique index).

- **Dashboard** — `/teacher/dashboard`: list of **PAID students only**
  (status COMPLETED, by default), with server-side filters —
  Department (all 14, dropdown), Term (1st Odd … 5th Even), Fee Type
  (Semester Final / Course Registration), plus search by roll or name.
  Each row shows roll, name, hall, department, term, fee type, total
  credits, amount, transaction ID, receipt no, completed date,
  status. A teacher can view **all departments** — their stored
  `departmentCode` is only their home department, never a restriction.
- **Download** — a "Download list (.xlsx)" button downloads the
  **current filtered list** (`GET /api/teachers/payments/export`
  with the same filters). The backend builds the `.xlsx` **in
  memory** from the live Postgres query (columns: Roll, Name, Hall,
  Department, Term, Fee Type, Total Credits, Amount (BDT),
  Transaction ID, Receipt No, Status, Completed Date; sorted by roll
  ascending) and streams it as a download. Nothing is written to
  disk — this does **not** bring back the auto-created Excel ledger
  files, which stay removed.
- **Seeded teacher** (seeded by `npm run db:seed`) — roll `T-001` or
  email `teacher@ruet.ac.bd`, password `teacher123`, name "RUET
  Teacher", all departments. **Change or delete this account in
  production.**

## SSLCommerz — the bug that was fixed

The success / fail / cancel routes were GET-only, but SSLCommerz
calls them with a **POST** (form POST: `tran_id`, `val_id`, `amount`,
`status` in the body). The POST got a 404, validation never ran, and
the payment stayed `PENDING`. Those routes now accept **both GET and
POST**, amounts are compared numerically (`5000.00` == `5000`), and
every callback is logged to the backend terminal.

IPN cannot reach `http://localhost:5000` from the sandbox, so IPN is
best-effort and the success-redirect POST is the primary completion
path locally. For IPN testing, `BACKEND_URL` must be a public URL
(e.g. ngrok). Full checklist: `SSLCOMMERZ_TROUBLESHOOTING.md`.

## Troubleshooting — "column `payments.receiptNo` does not exist"

If Pay fails with `The column 'payments.receiptNo' does not exist in
the current database` (at `prisma.payment.findUnique` in
`backend/src/routes/payments.ts`, or `findMany` in
`backend/src/routes/ledger.ts`), this was a naming bug in the
project, fixed in this version — **not** a missing migration.
Migration `20261124180000` created the column as snake_case
`"receipt_no"`, but `schema.prisma` declared `receiptNo` with no
`@map`, so Prisma queried a camelCase column that never existed.
That is why `npx prisma migrate deploy` said "No pending migrations
to apply": the migration had applied, under a different column name.
The fix is schema-only: `receiptNo` now has `@map("receipt_no")`,
and migration `20261124193000_receipt_no_map` (guarded, no-op on a
database where the column is already `receipt_no`) records it.

Apply it — no data loss, no `migrate reset`, no `db:seed` needed:

```bash
# replace your local files with this zip first, then in backend/
cd backend
npx prisma generate
npx prisma migrate deploy
npm run dev   # restart the backend
```

Then try Pay again. Existing students, payments and TEACHER roles
are untouched.

## Troubleshooting — `/api/payments/success` returns "Internal server error"

**Confirmed root cause (2026-11-24): `CORS blocked for origin: null`.**
SSLCommerz's form POST / redirect to `/api/payments/success` sends
the literal Origin header `"null"`. The old CORS middleware treated
that as a real origin — it is not empty, not in `frontendUrls`, and
does not match the localhost regex — so it threw
`Error: CORS blocked for origin: null` at `backend/src/index.ts`,
and the global error handler turned it into
`{"error":"Internal server error"}` in the browser. The browser JSON
hides the cause; the backend terminal shows it, with a stack trace.

**Fix (in this version):** CORS is skipped entirely for the gateway
callback routes (`/api/payments/success`, `/fail`, `/cancel`,
`/ipn`) — they are server-to-server / form POSTs, not browser
fetches, so CORS does not protect them — and the literal `"null"`
origin is also allowed by the normal API CORS as a safety net.
The success / fail / cancel handlers are wrapped end-to-end in
try/catch as well, so they always end in a redirect to
`/payment/fail` (with the error in the URL) instead of a 500 JSON,
and every failure is logged with its full stack trace in the
backend terminal.

Apply it: replace your local files with this zip, then in `backend/`
(stop the backend first):

```bash
npx prisma generate
npx prisma migrate deploy
npm run dev   # restart the backend — an old backend still running
              # serves the old CORS code, so a restart is required
```

Then pay again through SSLCommerz. **Do not** test the success URL
by opening `http://localhost:5000/api/payments/success` directly in
the browser: with no `tran_id` / `val_id` it redirects to the fail
page — it is not a page to visit. If it still fails, read the
backend terminal: the `[sslcommerz]` lines and the stack trace
under them are the real error — paste those back, not the browser
JSON.

## Troubleshooting — CORS: frontend on :3001

If the browser console says login / departments failed with
`Access to fetch at 'http://localhost:5000/api/auth/login' from
origin 'http://localhost:3001' … blocked by CORS policy …
'Access-Control-Allow-Origin' … 'http://localhost:3000' … is not
equal to the supplied origin`, the frontend is running on port
3001, not 3000. Next.js does that when port 3000 is already in use
by another process.

The backend now allows `http://localhost:3000`, `:3001`,
`127.0.0.1:3000` and `127.0.0.1:3001`, plus any localhost origin
in non-production — so after updating to this version, just
**restart the backend** (`Ctrl+C`, then `npm run dev` again) and
log in again. No `.env` change is needed locally.

To force the frontend back to port 3000 instead, stop whatever is
using port 3000, or run `npx next dev -p 3000` in `frontend/`.
For a deployed frontend, set its exact URL in
`FRONTEND_URLS` in `backend/.env` (comma-separated).
