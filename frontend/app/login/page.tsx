"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, getStoredStudent, setToken } from "../../lib/api";
import type { Department } from "../../lib/types";
import { HALLS } from "../../lib/types";

/**
 * ONE login page for everyone. Log in with a roll number OR an
 * email + password. The backend returns the account's role and
 * this page redirects by role: TEACHER -> /teacher/dashboard,
 * STUDENT -> /dashboard. There is no separate teacher login page.
 * Every new registration is a STUDENT by default; Jidan assigns
 * TEACHER to specified accounts in the database (see README).
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [departmentCode, setDepartmentCode] = useState("");
  const [hall, setHall] = useState<string>("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const stored = getStoredStudent();
    if (stored) {
      router.push(stored.role === "TEACHER" ? "/teacher/dashboard" : "/dashboard");
      return;
    }
    void api.departments().then((data) => setDepartments(data.departments)).catch(() => undefined);
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await api.login(identifier.trim(), password)
          : await api.register({ roll: identifier.trim(), name, email: email || undefined, departmentCode, hall, password });
      setToken(result.token);
      window.localStorage.setItem("ruet_student", JSON.stringify(result.student));
      router.push(result.student.role === "TEACHER" ? "/teacher/dashboard" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ruet">RUET Central Fee Payment</h1>
        <p className="mt-1 text-sm text-slate-600">
          Rajshahi University of Engineering &amp; Technology
        </p>
      </div>

      <div className="mt-6 flex rounded-lg bg-slate-200 p-1">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md py-2 text-sm font-semibold capitalize ${
              mode === m ? "bg-white shadow" : "text-slate-600"
            }`}
          >
            {m === "login" ? "Login" : "Register"}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="identifier" className="text-sm font-semibold">
            {mode === "login" ? "Roll / Email" : "Roll Number"}
          </label>
          <input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </div>
        {mode === "register" && (
          <>
            <div>
              <label htmlFor="name" className="text-sm font-semibold">Full Name</label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="email" className="text-sm font-semibold">Email (optional)</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="department" className="text-sm font-semibold">Department</label>
              <select
                id="department"
                value={departmentCode}
                onChange={(e) => setDepartmentCode(e.target.value)}
                required
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
              <label htmlFor="hall" className="text-sm font-semibold">Hall</label>
              <select
                id="hall"
                value={hall}
                onChange={(e) => setHall(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border px-3 py-2"
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
            </div>
          </>
        )}
        <div>
          <label htmlFor="password" className="text-sm font-semibold">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </div>
        {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || (mode === "register" && (!departmentCode || !hall))}
          className="w-full rounded-lg bg-ruet py-2.5 font-semibold text-white hover:bg-ruet-dark disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "login" ? "Login" : "Create Account"}
        </button>
      </form>
    </main>
  );
}
