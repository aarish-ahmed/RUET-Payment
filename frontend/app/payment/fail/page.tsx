"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function FailContent() {
  const params = useSearchParams();
  const error = params.get("error");
  const cancelled = params.get("cancelled") === "1";
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-red-700">
        {cancelled ? "Payment Cancelled" : "Payment Failed"}
      </h1>
      {error ? <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      <Link
        href="/dashboard"
        className="mt-6 inline-block rounded-lg bg-ruet px-5 py-2.5 font-semibold text-white"
      >
        Back to Dashboard
      </Link>
    </main>
  );
}

export default function PaymentFailPage() {
  return (
    <Suspense fallback={<main className="px-4 py-16 text-center">Loading…</main>}>
      <FailContent />
    </Suspense>
  );
}
