import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import ledgerRoutes from "./routes/ledger.js";
import paymentsRoutes from "./routes/payments.js";
import teachersRoutes from "./routes/teachers.js";

const app = express();

// CORS: the frontend origin must match exactly, including the port.
// Next.js runs on :3000 normally but switches to :3001 (or :3002, …)
// when :3000 is already taken — if the backend only allowed :3000,
// login / departments failed with:
//   "Access-Control-Allow-Origin … 'http://localhost:3000'
//    … is not equal to the supplied origin" (http://localhost:3001)
// So allow every origin in env.frontendUrls, plus any localhost /
// 127.0.0.1 origin in non-production (local dev only). Requests with
// no Origin header (curl, SSLCommerz server-to-server IPN) are allowed.
//
// CONFIRMED BUG (2026-11-24): SSLCommerz's form POST / redirect to
// /api/payments/success sends the literal Origin header "null".
// The old code treated "null" as a real origin — `!origin` is false
// for the string "null", it is not in frontendUrls and does not match
// the localhost regex — so cors called back with
// `Error: CORS blocked for origin: null`, and the global error handler
// turned that into {"error":"Internal server error"} on /success.
// A "null" origin comes from a form POST / top-level navigation, not
// from a browser fetch, and CORS does not protect those routes anyway.
// Two fixes, both applied here:
//   1. CORS is skipped entirely for the gateway callback routes
//      (/api/payments/success, /fail, /cancel, /ipn) — they are
//      server-to-server / form POSTs, not XHR, so CORS is meaningless
//      for them. Their handlers always end in a redirect, never JSON.
//   2. The normal API CORS below also allows the literal "null"
//      origin, as a safety net for any other form-POST caller.
const GATEWAY_CALLBACK_PATHS = [
  "/api/payments/success",
  "/api/payments/fail",
  "/api/payments/cancel",
  "/api/payments/ipn",
];

function isGatewayCallback(path: string): boolean {
  return GATEWAY_CALLBACK_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

const apiCors = cors({
  origin: (origin, callback) => {
    // No Origin header, or the literal "null" sent by a form POST /
    // top-level navigation (e.g. SSLCommerz): allow, it is not a
    // browser fetch and CORS cannot protect the route anyway.
    if (!origin || origin === "null") {
      callback(null, true);
      return;
    }
    if (env.frontendUrls.includes(origin)) {
      callback(null, true);
      return;
    }
    if (
      process.env.NODE_ENV !== "production" &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
});

app.use((req, res, next) => {
  if (isGatewayCallback(req.path)) {
    // Gateway callbacks skip CORS entirely (see above).
    next();
    return;
  }
  apiCors(req, res, next);
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "ruet-fee-payment-backend", mode: env.sslcommerzMode });
});

app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/teachers", teachersRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Log the full stack trace — the JSON body below hides the cause,
  // so the backend terminal is where the real error is read. See
  // README "Troubleshooting — /api/payments/success returns
  // Internal server error".
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.stack ?? err);
  if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
});

app.listen(env.port, () => {
  console.log(`RUET fee backend listening on http://localhost:${env.port}`);
  console.log(`SSLCommerz mode: ${env.sslcommerzMode}`);
});
