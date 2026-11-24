import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load backend/.env (project root of the backend package is two levels up
// from src/config). dotenv also picks up process env in production.
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const resolvedFrontendUrl =
  process.env.FRONTEND_URL?.trim().replace(/\/+$/, "") || "http://localhost:3000";

const resolvedBackendUrl =
  (process.env.BACKEND_URL?.trim() || process.env.RENDER_EXTERNAL_URL?.trim() || "").replace(
    /\/+$/,
    "",
  ) || "http://localhost:5000";

export const env = {
  port: Number(process.env.PORT ?? "5000"),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  frontendUrl: resolvedFrontendUrl,
  // All origins the API will accept CORS requests from. FRONTEND_URL is
  // always included. Add more with FRONTEND_URLS (comma-separated), e.g.
  // FRONTEND_URLS="http://localhost:3000,http://localhost:3001" — Next.js
  // picks port 3001 when 3000 is already in use, which is exactly the
  // CORS error in the screenshot: the backend only allowed :3000.
  // Localhost origins are also allowed automatically in non-production
  // (see src/index.ts), so a new Next port does not break login again.
  frontendUrls: [
    ...new Set(
      [
        resolvedFrontendUrl,
        ...(process.env.FRONTEND_URLS ?? "")
          .split(",")
          .map((origin) => origin.trim().replace(/\/+$/, ""))
          .filter(Boolean),
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
      ],
    ),
  ],
  backendUrl: resolvedBackendUrl,
  // Secret used to HMAC-sign receipt verification URLs (see
  // services/receipt.ts). Falls back to JWT_SECRET so a deployment
  // that only sets JWT_SECRET still works; set RECEIPT_SECRET to a
  // different long random value in production for defence in depth.
  // Never expose this value to the frontend or in a receipt.
  receiptSecret: process.env.RECEIPT_SECRET ?? required("JWT_SECRET"),
  // SSLCommerz mode: "sandbox" (default) or "live". The legacy value
  // "demo" is accepted as an alias for "sandbox", so an existing
  // .env with SSLCOMMERZ_MODE="demo" keeps working unchanged.
  sslcommerzMode: ((): "sandbox" | "live" => {
    const raw = (process.env.SSLCOMMERZ_MODE ?? "sandbox").trim().toLowerCase();
    return raw === "live" ? "live" : "sandbox";
  })(),
  sslcommerzStoreId: required("SSLCOMMERZ_STORE_ID"),
  sslcommerzStorePassword: required("SSLCOMMERZ_STORE_PASSWORD"),
} as const;