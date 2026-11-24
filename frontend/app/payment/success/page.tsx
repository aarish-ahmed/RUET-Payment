"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const params = useSearchParams();
  const tranId = params.get("tran_id") ?? "";
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-ruet">Payment Successful</h1>
      {tranId ? (
        <p className="mt-2 text-sm text-slate-600">
          Transaction ID: <code className="font-mono font-semibold">{tranId}</code>
        </p>
      ) : null}
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-lg bg-ruet px-5 py-2.5 font-semibold text-white"
      >
        View My Receipts
      </Link>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<main className="px-4 py-16 text-center">Loading…</main>}>
      <SuccessContent />
    </Suspense>
  );
}
