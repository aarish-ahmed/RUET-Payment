import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { ONLINE_CHARGE_BDT, PER_CREDIT_BDT } from "../config/fees.js";
import { TERMS, termLabel } from "../config/terms.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { buildQuote } from "../services/pricing.js";
import {
  nextReceiptNo,
  receiptQrDataUrl,
  receiptVerifyUrl,
  signReceipt,
  verifyReceiptSignature,
  type ReceiptIdentity,
} from "../services/receipt.js";
import { initiatePayment, validatePayment } from "../services/sslcommerz.js";

const router = Router();

const quoteSchema = z.object({
  departmentCode: z.string().trim().min(2).max(5),
  semester: z.enum(TERMS),
  feeType: z.enum(["SEMESTER_FINAL", "COURSE_REGISTRATION"]),
});

const ipnSchema = z.object({
  tran_id: z.string(),
  val_id: z.string(),
  // The gateway posts these as form fields; amount may arrive as a
  // decimal string ("5000.00") and status as "VALID" / "VALIDATED".
  amount: z.union([z.string(), z.number()]).optional(),
  status: z.union([z.string(), z.number()]).optional(),
});

function makeTranId(): string {
  return `RUET-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function publicPayment(payment: {
  id: string;
  tranId: string;
  receiptNo: string | null;
  studentRoll: string;
  departmentCode: string;
  semester: string;
  feeType: string;
  totalCredits: number;
  amountBdt: unknown;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
}) {
  // Price breakdown, recomputed from the stored total credits —
  // no course list is shown or stored for a payment any more.
  const totalCredits = payment.totalCredits;
  return {
    id: payment.id,
    tranId: payment.tranId,
    receiptNo: payment.receiptNo,
    studentRoll: payment.studentRoll,
    departmentCode: payment.departmentCode,
    semester: payment.semester,
    termLabel: termLabel(payment.semester),
    feeType: payment.feeType,
    totalCredits,
    perCreditRateBdt: PER_CREDIT_BDT,
    creditAmountBdt: totalCredits * PER_CREDIT_BDT,
    onlineChargeBdt: ONLINE_CHARGE_BDT,
    amountBdt: Number(payment.amountBdt),
    status: payment.status,
    courses: [] as never[],
    createdAt: payment.createdAt.toISOString(),
    completedAt: payment.completedAt?.toISOString() ?? null,
  };
}

/**
 * Generate a unique receipt number (RUET-2026-000123), sequential per
 * calendar year. Retries with a random suffix if two payments complete
 * at the same instant and collide on the unique constraint.
 */
async function makeReceiptNo(): Promise<string> {
  const countThisYear = async (year: number): Promise<number> =>
    prisma.payment.count({
      where: {
        status: "COMPLETED",
        receiptNo: { not: null },
        completedAt: {
          gte: new Date(`${year}-01-01T00:00:00.000Z`),
          lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
        },
      },
    });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const receiptNo =
      attempt === 0
        ? await nextReceiptNo(countThisYear)
        : `RUET-${new Date().getFullYear()}-${String(Math.floor(100000 + Math.random() * 900000))}`;
    const clash = await prisma.payment.findUnique({ where: { receiptNo } });
    if (!clash) return receiptNo;
  }
  // Extremely unlikely fallback: time-based suffix, still unique.
  return `RUET-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

function receiptIdentity(payment: {
  id: string;
  tranId: string;
  studentRoll: string;
  amountBdt: unknown;
}, studentName: string): ReceiptIdentity {
  return {
    id: payment.id,
    tranId: payment.tranId,
    studentRoll: payment.studentRoll,
    studentName,
    amountBdt: Number(payment.amountBdt),
  };
}

/** List all 14 RUET departments. */
router.get("/departments", async (_req, res) => {
  const departments = await prisma.department.findMany({ orderBy: { code: "asc" } });
  res.json({ departments });
});

/**
 * Server-calculated payment card. The amount comes from the term
 * only (odd = 19 credits, even = 21; 20 BDT/credit + 15 BDT online
 * charge) — the frontend never supplies an amount, and no course
 * list is needed. The /courses endpoint was removed with the course
 * list: the Course table stays in Prisma for future use only.
 */
router.post("/quote", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid quote request", details: parsed.error.flatten() });
    return;
  }
  try {
    const quote = await buildQuote(parsed.data.departmentCode, parsed.data.semester, parsed.data.feeType);
    res.json({ quote, studentRoll: req.user?.roll });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not build quote" });
  }
});

/** Create a PENDING payment and start an SSLCommerz session. */
router.post("/initiate", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = quoteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payment request", details: parsed.error.flatten() });
    return;
  }
  const { departmentCode, semester, feeType } = parsed.data;
  const roll = req.user?.roll;
  if (!roll) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const existing = await prisma.payment.findUnique({
      where: { studentRoll_departmentCode_semester_feeType: { studentRoll: roll, departmentCode, semester, feeType } },
    });
    if (existing?.status === "COMPLETED") {
      res.status(409).json({ error: `This fee has already been paid for ${termLabel(semester)}` });
      return;
    }
    if (existing && existing.status !== "PENDING") {
      await prisma.payment.delete({ where: { id: existing.id } });
    }

    // Recalculate from Postgres — never trust the frontend.
    const quote = await buildQuote(departmentCode, semester, feeType);
    const student = await prisma.student.findUnique({ where: { roll } });
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    const tranId = makeTranId();
    const payment = existing?.status === "PENDING"
      ? existing
      : await prisma.payment.create({
          data: {
            tranId,
            studentRoll: roll,
            departmentCode,
            semester,
            feeType,
            totalCredits: quote.totalCredits,
            amountBdt: quote.amountBdt,
            status: "PENDING",
            // No course list is stored for a payment any more.
            coursesJson: [],
          },
        });

    const productName = `${feeType === "SEMESTER_FINAL" ? "Semester Final Fee" : "Course Registration Fee"} — ${departmentCode} ${termLabel(semester)}`;
    const initiated = await initiatePayment({
      tranId: payment.tranId,
      amountBdt: Number(payment.amountBdt),
      customerName: student.name,
      customerEmail: student.email,
      productName,
      successUrl: `${env.backendUrl}/api/payments/success`,
      failUrl: `${env.backendUrl}/api/payments/fail`,
      cancelUrl: `${env.backendUrl}/api/payments/cancel`,
      ipnUrl: `${env.backendUrl}/api/payments/ipn`,
    });
    res.json({
      payment: publicPayment(payment),
      gatewayPageUrl: initiated.gatewayPageUrl,
    });
  } catch (error) {
    console.error(`[payments] initiate failed for roll ${roll}:`, error instanceof Error ? error.message : error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not initiate payment" });
  }
});

/**
 * Complete a payment ONLY after server-side SSLCommerz validation.
 * A redirect alone never marks a payment COMPLETED. On completion the
 * payment is recorded in Postgres (status COMPLETED, receiptNo issued)
 * and the receipt is generated from that record. There is no Excel or
 * Google Sheet — Postgres is the only record; see README.
 */
async function completeFromValidation(tranId: string, valId: string) {
  const payment = await prisma.payment.findUnique({
    where: { tranId },
    include: { student: { select: { name: true, hall: true } } },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.status === "COMPLETED") {
    // Already completed (e.g. IPN beat the redirect) — return without
    // duplicating anything.
    return payment;
  }
  const validation = await validatePayment(valId);
  console.log(
    `[sslcommerz] validation tran_id=${tranId} val_id=${valId ? "present" : "MISSING"} status=${validation.status} validated_amount=${validation.amount} expected_amount=${Number(payment.amountBdt)}`,
  );
  if (!validation.valid) {
    throw new Error(`SSLCommerz validation failed: status ${validation.status}`);
  }
  if (validation.tranId !== tranId) {
    throw new Error("Validation transaction ID does not match this payment");
  }
  // Amounts arrive as decimal strings ("5000.00") — compare numerically
  // with a 1-paisa tolerance, never by string equality.
  const validatedAmount = Number(validation.amount);
  const expectedAmount = Number(payment.amountBdt);
  if (!Number.isFinite(validatedAmount) || Math.abs(validatedAmount - expectedAmount) > 0.01) {
    console.error(
      `[sslcommerz] AMOUNT MISMATCH tran_id=${tranId}: validated=${validation.amount} expected=${expectedAmount}`,
    );
    throw new Error("Validated amount does not match the payment amount");
  }
  // The receipt number is issued once, at completion, and never reused.
  // It is issued ONLY here, when a payment becomes COMPLETED — a
  // PENDING / FAILED / CANCELLED payment never gets a receiptNo, and
  // therefore never gets a receipt.
  let receiptNo: string;
  try {
    receiptNo = payment.receiptNo ?? (await makeReceiptNo());
  } catch (error) {
    // Do NOT mark the payment COMPLETED without a receiptNo. Log the
    // full stack so the real cause is visible in the backend terminal
    // (a stale Prisma client / missing column shows up here), and let
    // the caller redirect to the fail page with this error instead of
    // the bare 500 JSON from the global error handler.
    console.error(
      `[sslcommerz] receiptNo generation failed tran_id=${tranId}:`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
    throw new Error(
      `Receipt number generation failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const completed = await prisma.payment.update({
    where: { tranId },
    data: { status: "COMPLETED", valId, receiptNo, completedAt: new Date() },
    include: { student: { select: { name: true, hall: true } } },
  });
  return completed;
}

/**
 * SSLCommerz calls success_url / fail_url / cancel_url with a POST
 * (form POST from the gateway: tran_id, val_id, amount, status in the
 * body). The old code only had GET routes, so the gateway's POST got a
 * 404, completeFromValidation never ran, and the payment stayed
 * PENDING — that was the bug. These routes now accept BOTH GET
 * (browser / manual retry) and POST (gateway), reading tran_id/val_id
 * from the body first, then the query string.
 */
function gatewayParams(req: Request): { tranId: string; valId: string } {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const query = req.query;
  return {
    tranId: String(body.tran_id ?? query.tran_id ?? ""),
    valId: String(body.val_id ?? query.val_id ?? ""),
  };
}

// The frontend URL the gateway callbacks redirect the browser to.
// env.frontendUrl already defaults to http://localhost:3000, but fall
// back defensively so a missing env value can never throw here.
function frontendBaseUrl(): string {
  return env.frontendUrl || "http://localhost:3000";
}

function failRedirectUrl(error: unknown): string {
  const message = error instanceof Error ? error.message : "validation-failed";
  return `${frontendBaseUrl()}/payment/fail?error=${encodeURIComponent(message)}`;
}

// Every gateway callback (success / fail / cancel) must end in a
// redirect to the frontend — NEVER in a 500 JSON response. The
// browser / gateway only ever sees a redirect; the real error, with
// its stack trace, goes to the backend terminal. Each handler below
// is therefore wrapped end-to-end in try/catch, including the
// parameter parsing and the redirect itself.
async function handleSuccess(req: Request, res: Response): Promise<void> {
  let tranId = "";
  try {
    const params = gatewayParams(req);
    tranId = params.tranId;
    const { valId } = params;
    console.log(`[sslcommerz] success callback method=${req.method} tran_id=${tranId} val_id=${valId ? "present" : "MISSING"}`);
    if (!tranId || !valId) {
      console.error(`[sslcommerz] success callback missing tran_id/val_id (method=${req.method})`);
      res.redirect(`${frontendBaseUrl()}/payment/fail?error=missing-validation`);
      return;
    }
    const payment = await completeFromValidation(tranId, valId);
    res.redirect(`${frontendBaseUrl()}/receipt/${payment.id}`);
  } catch (error) {
    console.error(
      `[sslcommerz] success callback failed tran_id=${tranId || "(none)"}:`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
    try {
      res.redirect(failRedirectUrl(error));
    } catch (redirectError) {
      console.error(
        "[sslcommerz] success fail-redirect failed:",
        redirectError instanceof Error ? redirectError.stack ?? redirectError.message : redirectError,
      );
      if (!res.headersSent) res.status(302).setHeader("Location", failRedirectUrl(error)).end();
    }
  }
}

async function handleFail(req: Request, res: Response): Promise<void> {
  let tranId = "";
  try {
    tranId = gatewayParams(req).tranId;
    console.log(`[sslcommerz] fail callback method=${req.method} tran_id=${tranId}`);
    if (tranId) {
      await prisma.payment.updateMany({ where: { tranId, status: "PENDING" }, data: { status: "FAILED" } });
    }
    res.redirect(`${frontendBaseUrl()}/payment/fail?tran_id=${encodeURIComponent(tranId)}`);
  } catch (error) {
    console.error(
      `[sslcommerz] fail callback failed tran_id=${tranId || "(none)"}:`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
    try {
      res.redirect(failRedirectUrl(error));
    } catch (redirectError) {
      console.error(
        "[sslcommerz] fail redirect failed:",
        redirectError instanceof Error ? redirectError.stack ?? redirectError.message : redirectError,
      );
      if (!res.headersSent) res.status(302).setHeader("Location", failRedirectUrl(error)).end();
    }
  }
}

async function handleCancel(req: Request, res: Response): Promise<void> {
  let tranId = "";
  try {
    tranId = gatewayParams(req).tranId;
    console.log(`[sslcommerz] cancel callback method=${req.method} tran_id=${tranId}`);
    if (tranId) {
      await prisma.payment.updateMany({ where: { tranId, status: "PENDING" }, data: { status: "CANCELLED" } });
    }
    res.redirect(`${frontendBaseUrl()}/payment/fail?tran_id=${encodeURIComponent(tranId)}&cancelled=1`);
  } catch (error) {
    console.error(
      `[sslcommerz] cancel callback failed tran_id=${tranId || "(none)"}:`,
      error instanceof Error ? error.stack ?? error.message : error,
    );
    try {
      res.redirect(failRedirectUrl(error));
    } catch (redirectError) {
      console.error(
        "[sslcommerz] cancel redirect failed:",
        redirectError instanceof Error ? redirectError.stack ?? redirectError.message : redirectError,
      );
      if (!res.headersSent) res.status(302).setHeader("Location", failRedirectUrl(error)).end();
    }
  }
}

// Route ordering matters: /success, /fail, /cancel, /ipn, /debug,
// /verify and /lookup must all be registered BEFORE the generic
// /:id route below, or Express would match e.g. "/success" as an
// id and the gateway callback would never reach its handler.
router.route("/success").get(handleSuccess).post(handleSuccess);
router.route("/fail").get(handleFail).post(handleFail);
router.route("/cancel").get(handleCancel).post(handleCancel);

/**
 * SSLCommerz IPN listener — validates val_id server-side.
 * Best-effort: the sandbox gateway cannot reach http://localhost:5000,
 * so IPN will fail locally and the success-redirect POST is the primary
 * completion path (see SSLCOMMERZ_TROUBLESHOOTING.md). A failed IPN
 * therefore returns 200 with the error logged, so the gateway stops
 * retrying a validation that cannot succeed — it never changes a
 * payment's status on its own.
 */
router.post("/ipn", async (req, res) => {
  try {
    const parsed = ipnSchema.safeParse(req.body);
    if (!parsed.success) {
      console.error("[sslcommerz] IPN invalid payload:", JSON.stringify(req.body ?? {}).slice(0, 500));
      res.status(400).json({ error: "Invalid IPN payload" });
      return;
    }
    console.log(
      `[sslcommerz] IPN tran_id=${parsed.data.tran_id} status=${String(parsed.data.status ?? "")} amount=${String(parsed.data.amount ?? "")}`,
    );
    try {
      await completeFromValidation(parsed.data.tran_id, parsed.data.val_id);
      res.json({ status: "ok" });
    } catch (error) {
      console.error(
        `[sslcommerz] IPN validation failed tran_id=${parsed.data.tran_id}:`,
        error instanceof Error ? error.stack ?? error.message : error,
      );
      res.json({ status: "ignored", error: error instanceof Error ? error.message : "IPN validation failed" });
    }
  } catch (error) {
    // Never let the IPN handler itself throw to the global 500 handler.
    console.error(
      "[sslcommerz] IPN handler failed:",
      error instanceof Error ? error.stack ?? error.message : error,
    );
    if (!res.headersSent) res.json({ status: "ignored", error: "IPN handler failed" });
  }
});

/**
 * Debug endpoint — owner only. Returns the payment's gateway state so
 * a failed payment can be diagnosed from the backend terminal + this
 * endpoint, without exposing anything to other students.
 * GET /api/payments/debug/:tranId
 */
router.get("/debug/:tranId", requireAuth, async (req: AuthenticatedRequest, res) => {
  const payment = await prisma.payment.findUnique({ where: { tranId: String(req.params.tranId) } });
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (payment.studentRoll !== req.user?.roll) {
    res.status(403).json({ error: "This payment belongs to another student" });
    return;
  }
  res.json({
    tranId: payment.tranId,
    valId: payment.valId ?? null,
    status: payment.status,
    amountBdt: Number(payment.amountBdt),
    totalCredits: payment.totalCredits,
    departmentCode: payment.departmentCode,
    semester: payment.semester,
    termLabel: termLabel(payment.semester),
    feeType: payment.feeType,
    createdAt: payment.createdAt.toISOString(),
    completedAt: payment.completedAt?.toISOString() ?? null,
  });
});

/**
 * Public receipt verification — NO auth, read-only, single DB lookup.
 * GET /api/payments/verify/:id?sig=<HMAC>
 *
 * This is the anti-forgery check. A printed receipt or screenshot is
 * never proof by itself — anyone can edit the roll, name or amount
 * with Photoshop or AI. The proof is the live database record shown
 * by the verification page (/verify/<id>), reached by scanning the
 * QR code on the receipt.
 *
 * The QR / URL carries an HMAC signature over the identity binding
 * (payment id + transaction id + student roll + student name +
 * amount). If any of those were changed, the signature fails and
 * valid is false. valid is true ONLY when the signature matches AND
 * the payment status is COMPLETED. It is false for PENDING / FAILED /
 * CANCELLED payments, for a missing payment, and for a bad signature.
 * The page shows, in order: Student Roll, Student Name, Paid Amount,
 * then Term, Hall, Department, Fee Type, Transaction ID, Receipt No.
 * The clerk's check: does the roll + name + amount on the receipt
 * match the roll + name + amount on this live page? If not, forged.
 * No email or password is ever returned here.
 */
router.get("/verify/:id", async (req, res) => {
  const payment = await prisma.payment.findUnique({
    where: { id: String(req.params.id) },
    include: { student: { select: { name: true, hall: true } } },
  });
  if (!payment) {
    res.status(404).json({ valid: false, error: "Receipt not found" });
    return;
  }
  const identity = receiptIdentity(payment, payment.student.name);
  const signatureOk = verifyReceiptSignature(identity, String(req.query.sig ?? ""));
  const valid = signatureOk && payment.status === "COMPLETED";
  res.json({
    valid,
    status: payment.status,
    // No receipt exists for a non-completed payment: never expose a
    // receipt number for PENDING / FAILED / CANCELLED, even a stale one.
    receiptNo: payment.status === "COMPLETED" ? payment.receiptNo : null,
    tranId: payment.tranId,
    studentRoll: payment.studentRoll,
    studentName: payment.student.name,
    hall: payment.student.hall,
    departmentCode: payment.departmentCode,
    semester: payment.semester,
    termLabel: termLabel(payment.semester),
    feeType: payment.feeType,
    amountBdt: Number(payment.amountBdt),
    completedAt: payment.completedAt?.toISOString() ?? null,
  });
});

/**
 * Public quick lookup — NO auth, read-only.
 * GET /api/payments/lookup?q=<roll OR receipt number>
 *
 * The no-QR way to verify: a teacher types or pastes a roll number
 * (e.g. 1903001) or a receipt number (e.g. RUET-2026-000123) and gets
 * the same live-database result as scanning the QR — roll, name,
 * amount, term, hall, department, fee type, transaction ID, receipt
 * number and COMPLETED / NOT VERIFIED status. No login, no scan.
 * Returns the most recent COMPLETED payment for that roll if there
 * is one, otherwise the most recent payment for that roll.
 * This is server-side, so no HMAC signature is needed from the
 * caller; `valid` here means "a COMPLETED record exists for this
 * roll / receipt number in the live database".
 */
router.get("/lookup", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) {
    res.status(400).json({ valid: false, error: "Enter a roll number or receipt number" });
    return;
  }
  const byReceipt = q.toUpperCase().startsWith("RUET-");
  const payments = byReceipt
    ? await prisma.payment.findMany({
        where: { receiptNo: q.toUpperCase() },
        include: { student: { select: { name: true, hall: true } } },
      })
    : await prisma.payment.findMany({
        where: { studentRoll: q },
        include: { student: { select: { name: true, hall: true } } },
        orderBy: { createdAt: "desc" },
      });
  if (payments.length === 0) {
    res.status(404).json({ valid: false, error: `No payment found for "${q}"` });
    return;
  }
  const payment =
    payments.find((p) => p.status === "COMPLETED") ?? payments[0];
  const identity = receiptIdentity(payment, payment.student.name);
  res.json({
    valid: payment.status === "COMPLETED",
    status: payment.status,
    // No receipt exists for a non-completed payment.
    receiptNo: payment.status === "COMPLETED" ? payment.receiptNo : null,
    tranId: payment.tranId,
    studentRoll: payment.studentRoll,
    studentName: payment.student.name,
    hall: payment.student.hall,
    departmentCode: payment.departmentCode,
    semester: payment.semester,
    termLabel: termLabel(payment.semester),
    feeType: payment.feeType,
    amountBdt: Number(payment.amountBdt),
    completedAt: payment.completedAt?.toISOString() ?? null,
    verifyUrl: receiptVerifyUrl(identity),
    paymentId: payment.id,
  });
});

/** Receipt / payment detail — owner only.
 *
 * NO RECEIPT FOR PENDING / FAILED PAYMENTS: if the payment is not
 * COMPLETED, no receipt exists — so no QR code, no verification URL
 * and no receipt number are returned, even if a stale receiptNo is
 * stored. Only a COMPLETED payment gets verifyUrl / qrDataUrl /
 * verifySig, and receiptAvailable is true only then. The frontend
 * receipt page renders the formal receipt only for COMPLETED
 * payments; for anything else it shows only a status card.
 */
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: String(req.params.id) } });
  if (!payment) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (payment.studentRoll !== req.user?.roll) {
    res.status(403).json({ error: "This receipt belongs to another student" });
    return;
  }
  const student = await prisma.student.findUnique({ where: { roll: payment.studentRoll } });
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  if (payment.status !== "COMPLETED") {
    res.json({
      payment: { ...publicPayment(payment), receiptNo: null },
      studentName: student.name,
      studentHall: student.hall,
      receiptAvailable: false,
      verifyUrl: null,
      verifySig: null,
      qrDataUrl: null,
    });
    return;
  }
  // Signed verification URL + QR image for this receipt. The QR is
  // generated server-side so the secret never leaves the backend.
  const identity = receiptIdentity(payment, student.name);
  const verifyUrl = receiptVerifyUrl(identity);
  const qrDataUrl = await receiptQrDataUrl(identity);
  res.json({
    payment: publicPayment(payment),
    studentName: student.name,
    studentHall: student.hall,
    receiptAvailable: true,
    verifyUrl,
    verifySig: signReceipt(identity),
    qrDataUrl,
  });
});

export default router;
