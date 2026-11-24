# SSLCommerz troubleshooting

## The bug that was fixed (Nov 2026)

**Root cause, confirmed in code:** the backend's success / fail / cancel
routes were GET-only (`router.get("/success", ...)`), but SSLCommerz
calls `success_url` / `fail_url` / `cancel_url` with a **POST** — a form
POST from the gateway carrying `tran_id`, `val_id`, `amount` and `status`
in the body. A POST to a GET-only route returns **404**, so
`completeFromValidation` never ran and the payment stayed `PENDING`
forever, even though the money was taken in the sandbox.

**Fix:** `/success`, `/fail` and `/cancel` now accept **both GET and
POST** (`router.route("/success").get(...).post(...)`), reading
`tran_id`/`val_id` from the request body first, then the query string.
The IPN listener was already POST and stays POST.

If a payment still fails, work through the checklist below and paste
the backend terminal lines (see "What to paste back") — they now log
every gateway callback.

## (a) What to check in the backend terminal

Start the backend (`cd backend && npm run dev`) and watch its terminal
while you pay. You should see, in order:

1. **Initiation** — no error, and the browser is redirected to the
   SSLCommerz sandbox page. If you see:
   - `[sslcommerz] initiation rejected ... failedreason=...` — the
     gateway rejected the session. The `failedreason` is the gateway's
     own explanation (wrong store ID/password is the usual one).
   - `SSLCommerz initiation failed with HTTP ...` — the gateway did not
     answer; check your internet connection and `SSLCOMMERZ_MODE`.
2. **Success callback** — after paying you must see:
   - `[sslcommerz] success callback method=POST tran_id=RUET-... val_id=present`
   - `[sslcommerz] validation tran_id=... status=VALID validated_amount=... expected_amount=...`
   - After completion the payment is `COMPLETED` in Postgres and the
     receipt is available at `/receipt/<paymentId>`. There is no
     ledger file any more — payment is recorded only in Postgres.
   If you see `method=GET` instead of POST, the gateway fell back to a
   browser redirect — the GET path still works, but check that
   `BACKEND_URL` in `backend/.env` is the URL the gateway was given.
   If you see `val_id=MISSING`, the gateway did not send a `val_id` —
   the payment cannot be marked COMPLETED without it; check the
   `success_url` in the initiation log and re-try.
3. **Validation** — if you see:
   - `SSLCommerz validation failed: status ...` — the validation API
     did not return `VALID`/`VALIDATED`. In sandbox mode this usually
     means the payment was not actually completed in the sandbox
     (e.g. you used a wrong test card) or the store credentials are
     wrong.
   - `AMOUNT MISMATCH ... validated=... expected=...` — the gateway
     validated a different amount than the server calculated. Amounts
     are compared numerically (5000.00 == 5000), so a mismatch means a
     real difference — do not pay it. The expected amount is fixed
     by the term (odd = 395 BDT, even = 435 BDT); check `fees.ts`.
   - `Validation transaction ID does not match` — the `val_id` belongs
     to a different transaction; do not mark it complete.
4. **Record** — the payment is recorded only in Postgres (status
   `COMPLETED`, receipt number, completed date). There is no Excel
   or Google Sheet and no ledger file: if a payment is COMPLETED in
   Postgres, that is the record — check it at
   `GET /api/payments/debug/<tran_id>` or in the teacher dashboard
   (`/teacher/dashboard`).

You can also check one payment directly (logged in, owner only):
`GET /api/payments/debug/<tran_id>` — returns status, `valId`,
amount, term, `completedAt`. If `status` is `PENDING` and `valId` is
null, the success callback never reached the backend.

## (b) Sandbox credentials

```env
SSLCOMMERZ_STORE_ID="testbox"
SSLCOMMERZ_STORE_PASSWORD="qwerty"
SSLCOMMERZ_MODE="sandbox"
```

These are SSLCommerz's public sandbox test credentials. Use a sandbox
test card from the SSLCommerz test panel (the sandbox gateway shows
test card numbers on its payment page). For live payments set
`SSLCOMMERZ_MODE="live"` and use your real store ID / password from
your SSLCommerz merchant panel. Never commit real credentials.

## (c) success / fail / cancel URLs must be the backend URL

The backend builds them from `BACKEND_URL` in `backend/.env`:

```env
BACKEND_URL="http://localhost:5000"
```

- `success_url` = `<BACKEND_URL>/api/payments/success`
- `fail_url` = `<BACKEND_URL>/api/payments/fail`
- `cancel_url` = `<BACKEND_URL>/api/payments/cancel`
- `ipn_url` = `<BACKEND_URL>/api/payments/ipn`

If `BACKEND_URL` is wrong, the gateway posts to the wrong place and
the payment stays `PENDING`. The frontend URL (`FRONTEND_URL`) is only
where the backend redirects the browser *after* validation — it is
never where the gateway posts.

## (d) Localhost IPN limitation

SSLCommerz's sandbox server cannot reach `http://localhost:5000`, so
**IPN will fail locally** — that is expected and harmless. The IPN
listener is best-effort: it logs the failure and returns 200 so the
gateway stops retrying. The **success-redirect POST is the primary
completion path** locally.

For IPN to work in testing, `BACKEND_URL` must be a public URL (for
example, expose the backend with ngrok and set
`BACKEND_URL="https://<your-ngrok-url>"`). Do not hardcode a tunnel
URL in the code — set it in `backend/.env` when you need it.

## (e) Test card flow in the sandbox

1. Log in at `http://localhost:3000` (seeded student: roll `1903001` /
   `student123`). Pick any department and term — no course list is
   needed to pay (odd terms 395 BDT, even terms 435 BDT).
2. Pick a department, term and fee type, click "Show Payment Card",
   then "Pay via SSLCommerz".
3. On the sandbox page, pay with a sandbox test card (shown on the
   sandbox page itself). Do not use a real card in sandbox mode.
4. After paying, the gateway POSTs to the backend, the backend
   validates `val_id` server-side, and you land on
   `/receipt/<paymentId>` with status `COMPLETED`.
5. Check the teacher dashboard: log in at `/login` as the seeded
   teacher (roll `T-001` or email `teacher@ruet.ac.bd` /
   `teacher123`) — you are redirected to `/teacher/dashboard`.
   The payment must be listed there with status COMPLETED.
   PENDING / FAILED payments are never in it.

## (f) `/api/payments/success` returns "Internal server error"

**Confirmed root cause (2026-11-24): `CORS blocked for origin: null`.**
The backend terminal showed:

```
Error: CORS blocked for origin: null
  at origin (backend/src/index.ts:38:16)
```

SSLCommerz's form POST / redirect to `/success` sends the literal
Origin header `"null"`. The old CORS middleware treated that as a
real origin and threw, and the global error handler turned it into
`{"error":"Internal server error"}` in the browser. That JSON hides
the cause — the backend terminal, with its stack trace, is the
real error.

**Fix (in this version):** CORS is skipped entirely for the gateway
callback routes (`/api/payments/success`, `/fail`, `/cancel`,
`/ipn`), and the literal `"null"` origin is also allowed by the
normal API CORS. The success / fail / cancel handlers are wrapped
end-to-end in try/catch, so they always end in a redirect to
`/payment/fail` instead of a 500 JSON, and log the full stack.
Apply it by replacing files with the latest zip, running
`npx prisma generate` + `npx prisma migrate deploy`, and
**restarting the backend** — an old backend still running serves
the old CORS code.

Do not test the success URL by opening
`http://localhost:5000/api/payments/success` directly in the
browser: with no `tran_id` / `val_id` it redirects to the fail
page. Test it only through a real SSLCommerz payment.

## (g) No receipt for a pending or failed payment

A receipt exists only for a `COMPLETED` payment. `GET
/api/payments/:id` returns no QR code, verification URL, signature
or receipt number for a `PENDING` / `FAILED` / `CANCELLED` payment,
and the receipt page shows only a status card ("Payment Pending" /
"Payment Failed" + "No receipt has been generated for this
payment."). The dashboard shows a "Receipt" link only for
`COMPLETED` payments. A receipt number is issued only when a
payment becomes `COMPLETED`.

## What to paste back if a payment still fails

Paste these, exactly as they appear — no secrets are in them:

1. The backend terminal lines starting `[sslcommerz]`
   from the failed attempt.
2. The output of `GET /api/payments/debug/<tran_id>` (logged in).
3. Your `backend/.env` values for `SSLCOMMERZ_MODE` and
   `BACKEND_URL` only — never paste `SSLCOMMERZ_STORE_PASSWORD` or
   `JWT_SECRET`.
