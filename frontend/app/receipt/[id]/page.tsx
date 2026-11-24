"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "../../../components/Navbar";
import { api, getStoredStudent } from "../../../lib/api";
import type { Payment } from "../../../lib/types";
import { feeTypeLabel, termLabel } from "../../../lib/types";

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [studentName, setStudentName] = useState<string | null>(null);
  const [studentHall, setStudentHall] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [logoMissing, setLogoMissing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getStoredStudent()) {
      router.push("/login");
      return;
    }
    void api
      .payment(params.id)
      .then((data) => {
        setPayment(data.payment);
        setStudentName(data.studentName);
        setStudentHall(data.studentHall);
        setQrDataUrl(data.qrDataUrl ?? "");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load receipt"));
  }, [params.id, router]);

  if (error) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-10">
          <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          <Link href="/dashboard" className="mt-4 inline-block font-semibold text-ruet underline">
            Back to Dashboard
          </Link>
        </main>
      </div>
    );
  }
  if (!payment) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-10 text-slate-600">Loading receipt…</main>
      </div>
    );
  }

  const isCompleted = payment.status === "COMPLETED";
  const completedAt = payment.completedAt ? new Date(payment.completedAt) : null;

  // NO RECEIPT FOR PENDING / FAILED PAYMENTS: a payment that is not
  // COMPLETED has no receipt — so no RUET logo header, no "Official
  // Fee Payment Receipt" heading, no Receipt No, no Paid Amount
  // receipt block, no QR and no Print button. Only a simple status
  // card: what the payment is, and that no receipt was generated.
  if (!isCompleted) {
    const title =
      payment.status === "PENDING"
        ? "Payment Pending"
        : payment.status === "CANCELLED"
          ? "Payment Cancelled"
          : "Payment Failed";
    return (
      <div className="min-h-screen">
        <div className="no-print">
          <Navbar />
        </div>
        <main className="mx-auto max-w-3xl px-4 py-6">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Student Roll</dt>
                <dd className="text-base font-semibold text-slate-900">{payment.studentRoll}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Term</dt>
                <dd className="text-base text-slate-900">{payment.termLabel ?? termLabel(payment.semester)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Fee Type</dt>
                <dd className="text-base text-slate-900">{feeTypeLabel(payment.feeType)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Amount Payable</dt>
                <dd className="text-base font-semibold text-slate-900">
                  ৳{" "}
                  {payment.amountBdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
                <dd className="text-base font-semibold text-slate-900">{payment.status}</dd>
              </div>
            </dl>
            <p className="mt-5 text-sm text-slate-600">No receipt has been generated for this payment.</p>
          </div>
          <div className="no-print mt-4">
            <Link href="/dashboard" className="rounded-lg border bg-white px-5 py-2.5 font-semibold">
              Back to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="no-print">
        <Navbar />
      </div>
      <main className="mx-auto max-w-3xl px-4 py-4">
        <div className="receipt-sheet rounded-xl border bg-white p-4 shadow-sm">
          {/* Formal header with the official RUET logo */}
          <header className="border-b-2 border-slate-900 pb-2 text-center">
            {logoMissing ? (
              <p className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-slate-900 text-base font-bold text-slate-900">
                RUET
              </p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/ruet-logo.png"
                alt="RUET logo"
                className="mx-auto h-auto max-h-14 w-auto max-w-full"
                onError={() => setLogoMissing(true)}
              />
            )}
            <h1 className="mt-2 text-lg font-bold text-slate-900">
              Rajshahi University of Engineering &amp; Technology
            </h1>
            <p className="mt-1 text-sm font-semibold uppercase tracking-widest text-slate-600">
              Official Fee Payment Receipt
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Receipt No: <span className="font-semibold text-slate-800">{payment.receiptNo ?? "—"}</span>
            </p>
          </header>

          {/* Identity + payment details */}
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Student Roll</dt>
              <dd className="text-base font-semibold text-slate-900">{payment.studentRoll}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Student Name</dt>
              <dd className="text-base font-semibold text-slate-900">{studentName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Department</dt>
              <dd className="text-base text-slate-900">{payment.departmentCode}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Term</dt>
              <dd className="text-base text-slate-900">{payment.termLabel ?? termLabel(payment.semester)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Hall</dt>
              <dd className="text-base text-slate-900">{studentHall ?? payment.studentHall ?? "Not set"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Fee Type</dt>
              <dd className="text-base text-slate-900">{feeTypeLabel(payment.feeType)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Transaction ID</dt>
              <dd className="break-all font-mono text-base text-slate-900">{payment.tranId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                {isCompleted ? "Date of Payment" : "Date"}
              </dt>
              <dd className="text-base text-slate-900">
                {completedAt
                  ? completedAt.toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })
                  : new Date(payment.createdAt).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" })}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex items-center justify-between rounded-lg border bg-slate-50 px-4 py-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Paid Amount (BDT)</span>
            <span className="text-sm font-bold text-slate-900">
              ৳{" "}
              {payment.amountBdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Price breakdown — no course list */}
          <dl className="mt-3 space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Total credits</dt>
              <dd className="font-semibold">{payment.totalCredits} credits</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">
                {payment.totalCredits} × {payment.perCreditRateBdt} BDT per credit
              </dt>
              <dd className="font-semibold">৳ {payment.creditAmountBdt.toLocaleString("en-BD")}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Online charge</dt>
              <dd className="font-semibold">৳ {payment.onlineChargeBdt.toLocaleString("en-BD")}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-bold text-slate-900">
              <dt>Total paid</dt>
              <dd>
                ৳ {payment.amountBdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </dd>
            </div>
          </dl>

          <p className="mt-3 text-sm">
            <span className="font-medium text-slate-600">Status: </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {payment.status}
            </span>
          </p>
          {!isCompleted && (
            <p className="mt-2 text-sm text-amber-800">Not completed yet.</p>
          )}

          {/* QR verification — QR code only, no link. Spot-check only:
              scanning it shows roll, name and amount from the live record. */}
          {isCompleted && qrDataUrl && (
            <section className="mt-3 flex flex-col items-center gap-3 border-t border-slate-200 pt-3 text-center sm:flex-row sm:text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR code to verify this receipt" className="h-24 w-24 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Verify this receipt</h2>
                <p className="mt-1 text-xs text-slate-600">Scan the QR code to check the roll, name and amount.</p>
              </div>
            </section>
          )}

          {/* Footer */}
          <footer className="mt-3 border-t border-slate-200 pt-2 text-sm text-slate-700">
            <p className="text-xs text-slate-500">
              Receipt No {payment.receiptNo ?? "—"} · Transaction ID {payment.tranId} · Rajshahi University of
              Engineering &amp; Technology
            </p>
          </footer>
        </div>

        <div className="no-print mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-ruet px-5 py-2.5 font-semibold text-white hover:bg-ruet-dark"
          >
            Print Receipt
          </button>
          <Link href="/dashboard" className="rounded-lg border px-5 py-2.5 font-semibold">
            Back to Dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
