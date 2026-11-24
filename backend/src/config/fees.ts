/**
 * Fee configuration — the ONLY place fee rates live.
 *
 * Fixed pricing (2026-11-24, per Jidan — no course list, no per-fee-type
 * rates, no official fee table to wait for):
 *   - 20 BDT per credit
 *   - 15 BDT online charge, flat, once per payment
 *   - Total credits come from the TERM only:
 *       odd terms  (1st/2nd/3rd/4th/5th Odd)  = 19 credits
 *       even terms (1st/2nd/3rd/4th/5th Even) = 21 credits
 *   - Odd total  = 19 × 20 + 15 = 395 BDT
 *   - Even total = 21 × 20 + 15 = 435 BDT
 * Both fee types (Semester Final Fee and Course Registration Fee)
 * cost the same. `calculateAmount` / `priceBreakdown` are the single
 * functions the payment service uses, so changing rates here changes
 * them everywhere. The Course table is kept in Prisma for future use
 * only — payment no longer reads it.
 */
import type { FeeType } from "@prisma/client";
import type { TermCode } from "./terms.js";

export const PER_CREDIT_BDT = 20;
export const ONLINE_CHARGE_BDT = 15;

/** Odd terms are 19 credits, even terms are 21 credits. */
export const ODD_TERM_CREDITS = 19;
export const EVEN_TERM_CREDITS = 21;

export function creditsForTerm(semester: TermCode | string): number {
  return semester.endsWith("_ODD") ? ODD_TERM_CREDITS : EVEN_TERM_CREDITS;
}

export interface PriceBreakdown {
  totalCredits: number;
  perCreditRateBdt: number;
  creditAmountBdt: number;
  onlineChargeBdt: number;
  amountBdt: number;
}

export function priceBreakdown(totalCredits: number): PriceBreakdown {
  const creditAmountBdt = totalCredits * PER_CREDIT_BDT;
  return {
    totalCredits,
    perCreditRateBdt: PER_CREDIT_BDT,
    creditAmountBdt,
    onlineChargeBdt: ONLINE_CHARGE_BDT,
    amountBdt: creditAmountBdt + ONLINE_CHARGE_BDT,
  };
}

/** Total payable for a term: credits × 20 BDT + 15 BDT online charge. */
export function calculateAmount(totalCredits: number): number {
  return priceBreakdown(totalCredits).amountBdt;
}

export function feeTypeLabel(feeType: FeeType): string {
  return feeType === "SEMESTER_FINAL"
    ? "Semester Final Fee"
    : "Course Registration Fee";
}
