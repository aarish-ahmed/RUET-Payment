import { createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { env } from "../config/env.js";

/**
 * Receipt verification — the anti-forgery core.
 *
 * A printed receipt / screenshot is NEVER proof by itself. A student
 * can edit any number on it with Photoshop or AI. The only proof is
 * the live database record, reached through the QR code on the receipt.
 *
 * What the QR protects is the IDENTITY BINDING: the receipt belongs
 * to one student (roll + name) for one paid amount. When anyone scans
 * the QR they land on /verify/<paymentId>?sig=<HMAC> and the page
 * shows, from the live database, in this order:
 *   1. Student Roll
 *   2. Student Name
 *   3. Paid Amount (BDT)
 *   4. Term, Hall, Department, Fee Type, Transaction ID, Receipt No
 *   5. COMPLETED / NOT VERIFIED status
 * The clerk's check is: "does the roll + name + amount on the receipt
 * match the roll + name + amount on the live verification page?"
 * If they don't match, the receipt is forged — whatever the paper says.
 *
 * The HMAC signature binds paymentId + tranId + studentRoll +
 * studentName + amountBdt together with a server secret. If anyone
 * changes the roll, the name or the amount in the QR / URL, the
 * signature no longer matches and verification returns valid:false.
 * The secret never leaves the server; the frontend only ever receives
 * the signed URL and the QR image for it.
 */

export interface ReceiptIdentity {
  id: string;
  tranId: string;
  studentRoll: string;
  studentName: string;
  amountBdt: number;
}

function signaturePayload(identity: ReceiptIdentity): string {
  // Amount is normalised to 2 decimals so "5000" and "5000.00" sign identically.
  return [
    identity.id,
    identity.tranId,
    identity.studentRoll,
    identity.studentName,
    Number(identity.amountBdt).toFixed(2),
  ].join("|");
}

export function signReceipt(identity: ReceiptIdentity): string {
  return createHmac("sha256", env.receiptSecret)
    .update(signaturePayload(identity), "utf8")
    .digest("hex");
}

export function verifyReceiptSignature(identity: ReceiptIdentity, sig: string): boolean {
  if (!sig || !/^[0-9a-f]{64}$/i.test(sig)) return false;
  const expected = Buffer.from(signReceipt(identity), "utf8");
  const provided = Buffer.from(sig.toLowerCase(), "utf8");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function receiptVerifyUrl(identity: ReceiptIdentity): string {
  const sig = signReceipt(identity);
  return `${env.frontendUrl}/verify/${identity.id}?sig=${sig}`;
}

export async function receiptQrDataUrl(identity: ReceiptIdentity): Promise<string> {
  return QRCode.toDataURL(receiptVerifyUrl(identity), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
}

/**
 * Receipt number, e.g. RUET-2026-000123.
 * Sequential per calendar year, generated once when a payment
 * completes and never reused. The caller must handle a unique-
 * constraint collision (two payments completing at the same instant)
 * by retrying — see makeReceiptNo in routes/payments.ts.
 */
export async function nextReceiptNo(
  countCompletedThisYear: (year: number) => Promise<number>,
): Promise<string> {
  const year = new Date().getFullYear();
  const count = await countCompletedThisYear(year);
  return `RUET-${year}-${String(count + 1).padStart(6, "0")}`;
}
