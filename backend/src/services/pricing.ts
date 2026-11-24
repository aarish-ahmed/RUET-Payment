import type { FeeType } from "@prisma/client";
import { creditsForTerm, priceBreakdown, type PriceBreakdown } from "../config/fees.js";
import { isTermAllowedForDepartment, type TermCode } from "../config/terms.js";

export interface PaymentQuote extends PriceBreakdown {
  departmentCode: string;
  semester: TermCode;
  feeType: FeeType;
  /** Kept for API compatibility — always empty. Payment no longer
   *  shows or requires a course list (see README "Pricing"). */
  courses: never[];
}

/**
 * The single source of truth for a payment card. Total credits come
 * from the TERM only (odd = 19, even = 21) and the amount is
 * credits × 20 BDT + 15 BDT online charge. It never reads the Course
 * table, so a quote/payment never fails because a department/term
 * has no courses seeded — any of the 14 departments and any allowed
 * term (ARCH only for 5th Odd/Even) can pay. Frontend-supplied
 * amounts are never accepted.
 * `semester` is a RUET term code, e.g. "1_ODD" (1st Odd).
 */
export async function buildQuote(
  departmentCode: string,
  semester: TermCode,
  feeType: FeeType,
): Promise<PaymentQuote> {
  if (!isTermAllowedForDepartment(departmentCode, semester)) {
    throw new Error(
      `5th Odd/Even is Architecture only — Architecture is RUET's only 5-year program; ${departmentCode} ends at 4th Even.`,
    );
  }
  const breakdown = priceBreakdown(creditsForTerm(semester));
  return {
    departmentCode,
    semester,
    feeType,
    courses: [],
    ...breakdown,
  };
}
