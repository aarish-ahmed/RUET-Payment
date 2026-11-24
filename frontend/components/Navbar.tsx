"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken, getStoredStudent } from "../lib/api";

export default function Navbar() {
  const router = useRouter();
  const student = getStoredStudent();

  function logout(): void {
    clearToken();
    router.push("/login");
  }

  return (
    <header className="bg-ruet text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="font-bold leading-tight">
          RUET Central Fee Payment
          <span className="block text-xs font-normal text-emerald-200">
            Rajshahi University of Engineering &amp; Technology
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {student ? (
            <>
              <span className="hidden sm:inline">
                {student.name} ({student.roll})
              </span>
              <button
                type="button"
                onClick={logout}
                className="rounded bg-white px-3 py-1.5 font-semibold text-ruet hover:bg-emerald-100"
              >
                Logout
              </button>
            </>
          ) : (
            <Link href="/login" className="rounded bg-white px-3 py-1.5 font-semibold text-ruet">
              Login
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
