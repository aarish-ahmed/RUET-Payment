"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Navbar from "../../../components/Navbar";
import { api } from "../../../lib/api";
import type { VerificationResult } from "../../../lib/types";
import { feeTypeLabel } from "../../../lib/types";

function VerificationFields({ result }: { result: VerificationResult }) {
  const rows: Array<[string, string]> = [
    ["Student Roll", result.studentRoll],
    ["Student Name", result.studentName ?? "—"],
    [
      "Paid Amount (BDT)",
      `৳ ${result.amountBdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    ],
    ["Term", result.termLabel],
    ["Hall", result.hall ?? "Not set"],
    ["Department", result.departmentCode],
    ["Fee Type", feeTypeLabel(result.feeType)],
    ["Transaction ID", result.tranId],
    ["Receipt No", result.receiptNo ?? "—"],
    [
      "Completed At",
      result.completedAt ? new Date(result.completedAt).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" }) : "—",
    ],
  ];
  return (
    <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      {rows.slice(0, 3).map(([label, value]) => (
        <div key={label} className={label.startsWith("Paid Amount") ? "sm:col-span-2" : ""}>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd
            className={
              label.startsWith("Paid Amount")
                ? "text-2xl font-extrabold text-slate-900"
                : "text-base font-semibold text-slate-900"
            }
          >
            {value}
          </dd>
        </div>
      ))}
      {rows.slice(3).map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
          <dd className="break-all text-base text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function VerifyContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const sig = searchParams.get("sig") ?? "";
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const verify = useCallback(async (id: string, signature: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await api.verifyPayment(id, signature);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not verify this receipt");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (params.id && sig) {
      void verify(params.id, sig);
    }
  }, [params.id, sig, verify]);

  const onLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.lookupPayment(q);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No payment found for that roll or receipt number");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const isValid = result !== null && result.valid && result.status === "COMPLETED";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Receipt Verification</h1>

      {loading && <p className="mt-6 text-slate-600">Checking the live record…</p>}
      {error && <p className="mt-6 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!sig && !result && !loading && (
        <p className="mt-6 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">No verification signature.</p>
      )}

      {result && (
        <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
          <div
            className={`rounded-lg px-4 py-3 text-center text-xl font-extrabold ${
              isValid ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
            }`}
          >
            {isValid ? "✓ VALID — Payment COMPLETED" : "✕ INVALID / NOT VERIFIED"}
          </div>
          <p className="mt-2 text-sm">
            <span className="font-medium text-slate-600">Status: </span>
            <span className="font-bold text-slate-900">{result.status}</span>
          </p>
          <VerificationFields result={result} />
        </section>
      )}

      <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Lookup</h2>
        <form onSubmit={onLookup} className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Roll or receipt number"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            aria-label="Roll or receipt number"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-ruet px-5 py-2.5 text-sm font-semibold text-white hover:bg-ruet-dark disabled:opacity-50"
          >
            Look up
          </button>
        </form>
      </section>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <Suspense fallback={<main className="mx-auto max-w-3xl px-4 py-8 text-slate-600">Loading…</main>}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
