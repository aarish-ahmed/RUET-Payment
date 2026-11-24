"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  api,
  clearToken,
  getStoredStudent,
  getStoredTeacher,
  getToken,
  teacherApi,
  type TeacherPaymentFilters,
} from "../../../lib/api";
import type { Department, PaidStudentRow, Student } from "../../../lib/types";
import { TERMS, feeTypeLabel, termLabel } from "../../../lib/types";

/**
 * Teacher dashboard — paid students only (COMPLETED). Teachers
 * filter by department / term / fee type and search by roll or name;
 * filtering is server-side. A "Download list" button downloads the
 * CURRENT filtered list as .xlsx (generated in memory by the
 * backend — no file is saved on the server).
 * Teachers log in from the SAME /login page as students (roll or
 * email + password) and are redirected here by their role. There is
 * no separate teacher login page. Students never see this page: no
 * link to it exists in the student Navbar or dashboard, and a
 * student token gets 403 from the API. A teacher can view ALL
 * departments.
 */
export default function TeacherDashboardPage() {
  const router = useRouter();
  const [teacher, setTeacher] = useState<Student | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [rows, setRows] = useState<PaidStudentRow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const [departmentCode, setDepartmentCode] = useState("");
  const [semester, setSemester] = useState("");
  const [feeType, setFeeType] = useState("");
  const [searchInput, setSearchInput] = useState("");
  // Nothing is selected by default: the paid-students list does
  // not load until the teacher has chosen a department, a term
  // and a fee type. "ALL" is an explicit choice, never the default.
  const [applied, setApplied] = useState<TeacherPaymentFilters | null>(null);
  const filtersChosen = departmentCode !== "" && semester !== "" && feeType !== "";

  useEffect(() => {
    const stored = getStoredTeacher();
    if (!getToken() || !stored) {
      router.push("/login");
      return;
    }
    setTeacher(stored);
    void api
      .departments()
      .then((data) => setDepartments(data.departments))
      .catch(() => setDepartments([]));
  }, [router]);

  const load = useCallback(async (filters: TeacherPaymentFilters) => {
    setLoading(true);
    setError("");
    try {
      const data = await teacherApi.payments(filters);
      setRows(data.payments);
      setCount(data.count);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load paid students");
      setRows([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (teacher && applied) void load(applied);
  }, [applied, load, teacher]);

  const onApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!filtersChosen) return;
    // "ALL" is an explicit choice meaning no filter for that field.
    const filters: TeacherPaymentFilters = {
      ...(departmentCode !== "ALL" ? { departmentCode } : {}),
      ...(semester !== "ALL" ? { semester } : {}),
      ...(feeType !== "ALL" ? { feeType } : {}),
      ...(searchInput.trim() ? { search: searchInput.trim() } : {}),
    };
    setApplied(filters);
  };

  const onDownload = async () => {
    if (!applied) return;
    setDownloading(true);
    setError("");
    try {
      await teacherApi.downloadPayments(applied);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const logout = () => {
    clearToken();
    router.push("/login");
  };

  const deptLocked = false;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-ruet text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <p className="font-bold leading-tight">
            RUET Central Fee Payment — Teacher
            <span className="block text-xs font-normal text-emerald-200">
              Paid students · Rajshahi University of Engineering &amp; Technology
            </span>
          </p>
          <div className="flex items-center gap-4 text-sm">
            {teacher ? (
              <span className="hidden sm:inline">
                {teacher.name} ({teacher.roll} · All departments)
              </span>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="rounded bg-white px-3 py-1.5 font-semibold text-ruet hover:bg-emerald-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-bold text-slate-900">Paid Students</h1>

        <form
          onSubmit={onApply}
          className="mt-5 grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          <div>
            <label htmlFor="t-dept" className="text-sm font-semibold">
              Department
            </label>
            <select
              id="t-dept"
              value={departmentCode}
              onChange={(e) => setDepartmentCode(e.target.value)}
              disabled={deptLocked}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="" disabled>
                Select department
              </option>
              <option value="ALL">All departments</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.name}
                </option>
              ))}
            </select>
            {deptLocked ? (
              <p className="mt-1 text-xs text-slate-500">Your account is limited to {teacher?.departmentCode}.</p>
            ) : null}          </div>
          <div>
            <label htmlFor="t-term" className="text-sm font-semibold">
              Term
            </label>
            <select
              id="t-term"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select term
              </option>
              <option value="ALL">All terms</option>
              {TERMS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="t-feetype" className="text-sm font-semibold">
              Fee Type
            </label>
            <select
              id="t-feetype"
              value={feeType}
              onChange={(e) => setFeeType(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select fee type
              </option>
              <option value="ALL">All fee types</option>
              <option value="SEMESTER_FINAL">Semester Final Fee</option>
              <option value="COURSE_REGISTRATION">Course Registration Fee</option>
            </select>
          </div>
          <div>
            <label htmlFor="t-search" className="text-sm font-semibold">
              Search by roll or name
            </label>
            <input
              id="t-search"
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading || !filtersChosen}
              className="w-full rounded-lg bg-ruet px-5 py-2.5 font-semibold text-white hover:bg-ruet-dark disabled:opacity-50"
            >
              Apply filters
            </button>
          </div>
        </form>
        {!filtersChosen ? (
          <p className="mt-4 text-sm text-slate-600">
            Choose a department, a term and a fee type to see paid students.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            {!applied
              ? "No filters chosen yet."
              : loading
                ? "Loading…"
                : `${count} paid student${count === 1 ? "" : "s"} found`}
          </p>
          <button
            type="button"
            onClick={() => void onDownload()}
            disabled={downloading || loading || !applied || count === 0}
            className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {downloading ? "Preparing download…" : "Download list (.xlsx)"}
          </button>
        </div>

        {error ? <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {applied ? (
        <div className="mt-4 overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Roll</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Hall</th>
                <th className="px-3 py-2">Dept</th>
                <th className="px-3 py-2">Term</th>
                <th className="px-3 py-2">Fee Type</th>
                <th className="px-3 py-2 text-right">Credits</th>
                <th className="px-3 py-2 text-right">Amount (BDT)</th>
                <th className="px-3 py-2">Transaction ID</th>
                <th className="px-3 py-2">Receipt No</th>
                <th className="px-3 py-2">Completed Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tranId} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-semibold">{row.studentRoll}</td>
                  <td className="px-3 py-2">{row.studentName}</td>
                  <td className="px-3 py-2">{row.studentHall ?? "—"}</td>
                  <td className="px-3 py-2">{row.departmentCode}</td>
                  <td className="px-3 py-2">{row.termLabel ?? termLabel(row.semester)}</td>
                  <td className="px-3 py-2">{feeTypeLabel(row.feeType)}</td>
                  <td className="px-3 py-2 text-right">{row.totalCredits}</td>
                  <td className="px-3 py-2 text-right font-semibold">
                    ৳ {row.amountBdt.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.tranId}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.receiptNo ?? "—"}</td>
                  <td className="px-3 py-2">
                    {row.completedAt
                      ? new Date(row.completedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
                      : "—"}
                  </td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                    No paid students match these filters yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        ) : null}
      </main>
    </div>
  );
}
