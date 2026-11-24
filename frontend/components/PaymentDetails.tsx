import type { Payment, Quote } from "../lib/types";
import { feeTypeLabel, priceBreakdownText, termLabel } from "../lib/types";

interface PaymentDetailsProps {
  studentRoll: string;
  studentName?: string | null;
  quote: Quote;
}

/**
 * Payment details — NO course list any more. Total credits come from
 * the term only (odd = 19, even = 21) and the amount is
 * credits × 20 BDT + 15 BDT online charge, calculated by the server.
 */
export default function PaymentDetails({ studentRoll, studentName, quote }: PaymentDetailsProps) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-ruet">Payment Details</h2>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Roll</dt>
          <dd className="font-semibold">{studentRoll}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Student</dt>
          <dd className="font-semibold">{studentName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Department</dt>
          <dd className="font-semibold">{quote.departmentCode}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Term</dt>
          <dd className="font-semibold">{termLabel(quote.semester)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-slate-500">Fee Type</dt>
          <dd className="font-semibold">{feeTypeLabel(quote.feeType)}</dd>
        </div>
      </dl>

      <dl className="mt-4 space-y-1 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Total credits</dt>
          <dd className="font-semibold">{quote.totalCredits} credits</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">
            {quote.totalCredits} × {quote.perCreditRateBdt} BDT per credit
          </dt>
          <dd className="font-semibold">৳ {quote.creditAmountBdt.toLocaleString("en-BD")}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-600">Online charge</dt>
          <dd className="font-semibold">৳ {quote.onlineChargeBdt.toLocaleString("en-BD")}</dd>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold text-ruet">
          <dt>Amount Payable</dt>
          <dd>৳ {quote.amountBdt.toLocaleString("en-BD")}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-slate-500">{priceBreakdownText(quote)}</p>
    </section>
  );
}

export function paymentToQuote(payment: Payment, studentRoll: string): Quote {
  return {
    departmentCode: payment.departmentCode,
    semester: payment.semester,
    feeType: payment.feeType,
    courses: [],
    totalCredits: payment.totalCredits,
    perCreditRateBdt: payment.perCreditRateBdt,
    creditAmountBdt: payment.creditAmountBdt,
    onlineChargeBdt: payment.onlineChargeBdt,
    amountBdt: payment.amountBdt,
  };
}
