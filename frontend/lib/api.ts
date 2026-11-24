import type {
  Department,
  PaidStudentRow,
  Payment,
  Quote,
  Student,
  Teacher,
  VerificationResult,
} from "./types";

export type TermCode = string;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ruet_token");
}

export function setToken(token: string): void {
  window.localStorage.setItem("ruet_token", token);
}

export function clearToken(): void {
  window.localStorage.removeItem("ruet_token");
  window.localStorage.removeItem("ruet_student");
}

export function getStoredStudent(): Student | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("ruet_student");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Student;
  } catch {
    return null;
  }
}

// --- Teacher auth: NO separate token. Teachers log in from the
// SAME /login page (roll or email + password) and get the SAME
// ruet_token, with role TEACHER in the JWT. The frontend redirects
// by role; the backend's requireTeacher rejects student tokens
// with 403 on every teacher endpoint.
export function getStoredTeacher(): Teacher | null {
  const stored = getStoredStudent();
  return stored && stored.role === "TEACHER" ? stored : null;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export const api = {
  async login(identifier: string, password: string): Promise<{ student: Student; token: string }> {
    return request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
  },
  async register(input: {
    roll: string;
    name: string;
    email?: string;
    departmentCode: string;
    hall: string;
    password: string;
  }): Promise<{ student: Student; token: string }> {
    return request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async me(): Promise<{ student: Student }> {
    return request("/api/auth/me");
  },
  async updateMe(input: { hall: string }): Promise<{ student: Student }> {
    return request("/api/auth/me", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },
  async departments(): Promise<{ departments: Department[] }> {
    return request("/api/payments/departments");
  },
  async quote(input: {
    departmentCode: string;
    semester: string;
    feeType: string;
  }): Promise<{ quote: Quote; studentRoll: string }> {
    return request("/api/payments/quote", { method: "POST", body: JSON.stringify(input) });
  },
  async initiate(input: {
    departmentCode: string;
    semester: string;
    feeType: string;
  }): Promise<{ payment: Payment; gatewayPageUrl: string }> {
    return request("/api/payments/initiate", { method: "POST", body: JSON.stringify(input) });
  },
  async debugPayment(tranId: string): Promise<{
    tranId: string;
    valId: string | null;
    status: string;
    amountBdt: number;
    totalCredits: number;
    departmentCode: string;
    semester: string;
    termLabel: string;
    feeType: string;
    createdAt: string;
    completedAt: string | null;
  }> {
    return request(`/api/payments/debug/${encodeURIComponent(tranId)}`);
  },
  async payment(id: string): Promise<{
    payment: Payment;
    studentName: string | null;
    studentHall: string | null;
    // Null for any payment that is not COMPLETED: no receipt exists
    // for a pending / failed payment, so no QR or verification URL.
    receiptAvailable: boolean;
    verifyUrl: string | null;
    verifySig: string | null;
    qrDataUrl: string | null;
  }> {
    return request(`/api/payments/${id}`);
  },
  async myPayments(): Promise<{ payments: Payment[] }> {
    return request("/api/ledger/payments?mine=1");
  },
  /**
   * Department ledger — every payment, roll ascending. This is the
   * primary check for department staff (see app/teacher/dashboard): find
   * the roll, check name + amount + COMPLETED. No QR scan needed.
   * Intended for staff use; in production gate it behind a staff /
   * admin role — see README "Receipt verification".
   */
  async allPayments(filters: { department?: string; semester?: string; feeType?: string } = {}): Promise<{
    payments: Payment[];
  }> {
    const params = new URLSearchParams();
    if (filters.department) params.set("department", filters.department);
    if (filters.semester) params.set("semester", filters.semester);
    if (filters.feeType) params.set("feeType", filters.feeType);
    const query = params.toString();
    return request(`/api/ledger/payments${query ? `?${query}` : ""}`);
  },
  /**
   * Public receipt verification — no login needed. Called by the
   * verify page, both from a scanned QR (id + sig) and from the
   * roll / receipt-number lookup box.
   */
  async verifyPayment(id: string, sig: string): Promise<VerificationResult> {
    return request(`/api/payments/verify/${encodeURIComponent(id)}?sig=${encodeURIComponent(sig)}`);
  },
  async lookupPayment(q: string): Promise<VerificationResult> {
    return request(`/api/payments/lookup?q=${encodeURIComponent(q)}`);
  },
};

export interface TeacherPaymentFilters {
  departmentCode?: string;
  semester?: string;
  feeType?: string;
  search?: string;
}

function teacherPaymentQuery(filters: TeacherPaymentFilters): string {
  const params = new URLSearchParams();
  if (filters.departmentCode) params.set("departmentCode", filters.departmentCode);
  if (filters.semester) params.set("semester", filters.semester);
  if (filters.feeType) params.set("feeType", filters.feeType);
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** Teacher-only API — uses the SAME unified token as students.
 * A student token is rejected with 403 by the backend on every
 * endpoint here. Teachers log in via api.login, not here. */
export const teacherApi = {
  async me(): Promise<{ teacher: Teacher }> {
    return request("/api/teachers/me");
  },
  /** Paid students only (COMPLETED), filtered server-side. */
  async payments(filters: TeacherPaymentFilters = {}): Promise<{ payments: PaidStudentRow[]; count: number }> {
    return request(`/api/teachers/payments${teacherPaymentQuery(filters)}`);
  },
  /**
   * Download the CURRENT filtered list as .xlsx. The file is
   * generated in memory by the backend and streamed back — nothing
   * is saved on the server.
   */
  async downloadPayments(filters: TeacherPaymentFilters = {}): Promise<void> {
    const token = getToken();
    const response = await fetch(`${BACKEND_URL}/api/teachers/payments/export${teacherPaymentQuery(filters)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(response.status, data.error ?? `Download failed (${response.status})`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paid-students-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export { ApiError };
