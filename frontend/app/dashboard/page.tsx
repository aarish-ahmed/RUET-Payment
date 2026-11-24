"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import PaymentDetails from "../../components/PaymentDetails";
import { api, getStoredStudent } from "../../lib/api";
import type { Department, FeeType, Payment, Quote } from "../../lib/types";
import { HALLS, termLabel, termsForDepartment } from "../../lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const [student, setStudent] = useState(() => getStoredStudent());
  const [hall, setHall] = useState("");
  const [hallSaved, setHallSaved] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  // Nothing is selected by default: department, term and fee type
  // all start empty and the student must choose each one.
  const [departmentCode, setDepartmentCode] = useState("");
  const [semester, setSemester] = useState("");
  // Architecture is the only 5-year program: it shows 10 terms,
  // every other department shows 8 (1st Odd – 4th Even).
  const terms = termsForDepartment(departmentCode);
  const [feeType, setFeeType] = useState<FeeType | "">("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!getStoredStudent()) {
      router.push("/login");
      return;
    }
    void api.departments().then((data) => setDepartments(data.departments)).catch(() => undefined);
    void api.myPayments().then((data) => setHistory(data.payments)).catch(() => undefined);
  }, [router]);

  useEffect(() => {
    const stored = getStoredStudent();
    if (stored) {
      setHall(stored.hall ?? "");
    }
  }, []);

  async function saveHall(): Promise<void> {
    if (!hall) return;
    setError("");
    try {
      const result = await api.updateMe({ hall });
      setStudent(result.student);
      window.localStorage.setItem("ruet_student", JSON.stringify(result.student));
      setHallSaved("Hall saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save hall");
    }
  }

  async function loadQuote(): Promise<void> {
    if (!departmentCode || !semester || !feeType) {
      setQuote(null);
      setError("Choose a department, a term and a fee type first.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await api.quote({ departmentCode, semester, feeType });
      setQuote(result.quote);
    } catch (err) {
      setQuote(null);
      setError(err instanceof Error ? err.message : "Could not load the payment details");
    } finally {
      setBusy(false);
    }
  }

  async function payNow(): Promise<void> {
    if (!quote) return;
    setError("");
    setPaying(true);
    try {
      const result = await api.initiate({ departmentCode, semester, feeType });
      window.location.href = result.gatewayPageUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment");
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold">Pay Your Academic Fee</h1>
        </div>

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">My Hall</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Hall"
              value={hall}
              onChange={(e) => {
                setHall(e.target.value);
                setHallSaved("");
              }}
              className="flex-1 rounded-lg border px-3 py-2"
            >
              <option value="" disabled>
                Select your hall
              </option>
              {HALLS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void saveHall()}
              disabled={!hall}
              className="rounded-lg bg-ruet px-5 py-2 font-semibold text-white hover:bg-ruet-dark disabled:opacity-50"
            >
              Save Hall
            </button>
          </div>
          {hallSaved ? <p className="mt-2 text-sm text-emerald-700">{hallSaved}</p> : null}
        </section>

        <section className="grid gap-4 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-4">
          <div>
            <label htmlFor="dept" className="text-sm font-semibold">Department</label>
            <select
              id="dept"
              value={departmentCode}
              onChange={(e) => {
                const next = e.target.value;
                setDepartmentCode(next);
                // Drop a 5th-term selection when leaving Architecture.
                if (next !== "ARCH" && (semester === "5_ODD" || semester === "5_EVEN")) {
                  setSemester("");
                }
                setQuote(null);
              }}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="" disabled>
                Select department
              </option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="semester" className="text-sm font-semibold">Term</label>
            <select
              id="semester"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="" disabled>
                Select term
              </option>
              {terms.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <span className="text-sm font-semibold">Fee Type</span>
            <div className="mt-1 flex gap-2">
              {(
                [
                  ["SEMESTER_FINAL", "Semester Final Fee"],
                  ["COURSE_REGISTRATION", "Course Registration Fee"],
                ] as Array<[FeeType, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFeeType(value)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    feeType === value ? "border-ruet bg-ruet-light text-ruet" : "bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-4">
            <button
              type="button"
              onClick={() => void loadQuote()}
              disabled={busy || !departmentCode || !semester || !feeType}
              className="rounded-lg bg-ruet px-5 py-2.5 font-semibold text-white hover:bg-ruet-dark disabled:opacity-50"
            >
              {busy ? "Loading…" : "Show Payment Details"}
            </button>
            {!departmentCode || !semester || !feeType ? (
              <p className="mt-2 text-sm text-slate-600">Choose a department, a term and a fee type to see the payment details.</p>
            ) : null}
          </div>
        </section>

        {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {quote && student ? (
          <>
            <PaymentDetails studentRoll={student.roll} studentName={student.name} quote={quote} />
            <button
              type="button"
              onClick={() => void payNow()}
              disabled={paying}
              className="w-full rounded-lg bg-ruet py-3 text-base font-bold text-white hover:bg-ruet-dark disabled:opacity-50"
            >
              {paying ? "Redirecting to SSLCommerz…" : `Pay ৳ ${quote.amountBdt.toLocaleString("en-BD")} via SSLCommerz`}
            </button>
          </>
        ) : null}

        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">My Payments</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No payments yet.</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {history.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {p.departmentCode} · {termLabel(p.semester)} ·{" "}
                    {p.feeType === "SEMESTER_FINAL" ? "Semester Final" : "Course Registration"} · ৳{" "}
                    {p.amountBdt.toLocaleString("en-BD")}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        p.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-800"
                          : p.status === "PENDING"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {p.status}
                    </span>
                    {p.status === "COMPLETED" ? (
                      <Link href={`/receipt/${p.id}`} className="font-semibold text-ruet underline">
                        Receipt
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
