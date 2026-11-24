import { env } from "../config/env.js";

export interface InitiateParams {
  tranId: string;
  amountBdt: number;
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  productName: string;
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
}

export interface InitiateResult {
  status: string;
  gatewayPageUrl: string;
  sessionKey?: string;
}

export interface ValidationResult {
  status: string;
  tranId: string;
  amount: string;
  currency: string;
  valid: boolean;
  raw: Record<string, unknown>;
}

function baseUrl(): string {
  return env.sslcommerzMode === "live"
    ? "https://securepay.sslcommerz.com"
    : "https://sandbox.sslcommerz.com";
}

/**
 * SSLCommerz API v4 — session initiation.
 * Docs: https://developer.sslcommerz.com (gwprocess/v4/api.php)
 */
export async function initiatePayment(params: InitiateParams): Promise<InitiateResult> {
  const body = new URLSearchParams({
    store_id: env.sslcommerzStoreId,
    store_passwd: env.sslcommerzStorePassword,
    total_amount: String(params.amountBdt),
    currency: "BDT",
    tran_id: params.tranId,
    success_url: params.successUrl,
    fail_url: params.failUrl,
    cancel_url: params.cancelUrl,
    ipn_url: params.ipnUrl,
    cus_name: params.customerName,
    cus_email: params.customerEmail ?? "student@ruet.ac.bd",
    cus_phone: params.customerPhone ?? "01700000000",
    cus_add1: "RUET, Rajshahi",
    cus_city: "Rajshahi",
    cus_country: "Bangladesh",
    shipping_method: "NO",
    product_name: params.productName,
    product_category: "Education",
    product_profile: "general",
  });

  const response = await fetch(`${baseUrl()}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    console.error(`[sslcommerz] initiation HTTP ${response.status} for tran_id ${params.tranId}`);
    throw new Error(`SSLCommerz initiation failed with HTTP ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const gatewayPageUrl = data.GatewayPageURL;
  if (data.status !== "SUCCESS" || typeof gatewayPageUrl !== "string") {
    // failedreason is the gateway's own explanation — log it, never a secret.
    console.error(
      `[sslcommerz] initiation rejected for tran_id ${params.tranId}: status=${String(data.status ?? "")} failedreason=${String(data.failedreason ?? "")}`,
    );
    throw new Error(
      `SSLCommerz initiation rejected: ${String(data.failedreason ?? data.status ?? "unknown error")}`,
    );
  }
  return {
    status: String(data.status),
    gatewayPageUrl,
    sessionKey: typeof data.sessionkey === "string" ? data.sessionkey : undefined,
  };
}

/**
 * SSLCommerz server-side Order Validation API.
 * A payment is NEVER trusted from a browser redirect alone — this call
 * is the only thing that can mark a payment COMPLETED.
 */
export async function validatePayment(valId: string): Promise<ValidationResult> {
  const url = new URL(`${baseUrl()}/validator/api/validationserverAPI.php`);
  url.searchParams.set("val_id", valId);
  url.searchParams.set("store_id", env.sslcommerzStoreId);
  url.searchParams.set("store_passwd", env.sslcommerzStorePassword);
  url.searchParams.set("v", "1");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`SSLCommerz validation failed with HTTP ${response.status}`);
  }
  const data = (await response.json()) as Record<string, unknown>;
  const status = String(data.status ?? "");
  return {
    status,
    tranId: String(data.tran_id ?? ""),
    amount: String(data.amount ?? ""),
    currency: String(data.currency ?? ""),
    valid: status === "VALID" || status === "VALIDATED",
    raw: data,
  };
}
