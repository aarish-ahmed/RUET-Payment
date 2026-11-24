export type FeeType = "SEMESTER_FINAL" | "COURSE_REGISTRATION";
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type Role = "STUDENT" | "TEACHER";

/** RUET term code, e.g. "1_ODD" (1st Odd). Architecture is the only
 * 5-year program; all other departments end at 4th Even. */
export type TermCode = string;

export const TERMS: Array<{ code: string; label: string }> = [
  { code: "1_ODD", label: "1st Odd" },
  { code: "1_EVEN", label: "1st Even" },
  { code: "2_ODD", label: "2nd Odd" },
  { code: "2_EVEN", label: "2nd Even" },
  { code: "3_ODD", label: "3rd Odd" },
  { code: "3_EVEN", label: "3rd Even" },
  { code: "4_ODD", label: "4th Odd" },
  { code: "4_EVEN", label: "4th Even" },
  { code: "5_ODD", label: "5th Odd" },
  { code: "5_EVEN", label: "5th Even" },
];

export function termLabel(code: string): string {
  return TERMS.find((t) => t.code === code)?.label ?? code;
}

export function termsForDepartment(departmentCode: string): Array<{ code: string; label: string }> {
  return departmentCode === "ARCH" ? TERMS : TERMS.slice(0, 8);
}

/** RUET residential halls — ONLY the names from the RUET provosts
 * list (hum.ruet.ac.bd) screenshots provided by Jidan on 2026-11-24.
 * See backend/src/config/halls.ts for the source note. "Other"
 * covers halls not in that list. */
export const HALLS = [
  "Shahid President Ziaur Rahman Hall",
  "Shahid Lt. Selim Hall",
  "Sher-e-Bangla A K Fazlul Huq Hall",
  "Shahid Abdul Hamid Hall",
  "Shahid Shahidul Islam Hall",
  "Tin Shed Hall (Extension)",
  "Male Hall-1",
  "Male Hall-2",
  "Male Hall-3",
  "Female Hall-1",
  "Female Hall-2",
  "Non-residential / Day Scholar",
  "Other",
] as const;

export type Hall = (typeof HALLS)[number];

export interface Department {
  code: string;
  name: string;
}

/** One account for everyone. Default role is STUDENT; Jidan assigns
 * TEACHER to specified accounts. A teacher's roll is their staff ID
 * (e.g. "T-001") and they log in from the same /login page. */
export interface Student {
  id: string;
  roll: string;
  name: string;
  email: string | null;
  role: Role;
  hall: string | null;
  departmentCode: string;
}

/** A teacher, as returned by GET /api/teachers/me — the same
 * account shape as Student, with role TEACHER. */
export type Teacher = Student;

/** One row of the teacher's paid-students list (COMPLETED only). */
export interface PaidStudentRow {
  studentRoll: string;
  studentName: string;
  studentHall: string | null;
  departmentCode: string;
  semester: string;
  termLabel: string;
  feeType: FeeType;
  totalCredits: number;
  amountBdt: number;
  tranId: string;
  receiptNo: string | null;
  status: string;
  completedAt: string | null;
}

/**
 * Price breakdown for a payment. Total credits come from the term
 * only (odd = 19, even = 21); amount = credits × 20 BDT + 15 BDT
 * online charge. No course list is shown or stored any more.
 */
export interface PriceBreakdown {
  totalCredits: number;
  perCreditRateBdt: number;
  creditAmountBdt: number;
  onlineChargeBdt: number;
  amountBdt: number;
}

export interface Quote extends PriceBreakdown {
  departmentCode: string;
  semester: string;
  feeType: FeeType;
  /** Kept for API compatibility — always empty. */
  courses: never[];
}

export interface Payment extends PriceBreakdown {
  id: string;
  tranId: string;
  receiptNo: string | null;
  studentRoll: string;
  studentName?: string | null;
  studentHall?: string | null;
  departmentCode: string;
  semester: string;
  termLabel?: string;
  feeType: FeeType;
  status: PaymentStatus;
  /** Kept for API compatibility — always empty. */
  courses: never[];
  createdAt: string;
  completedAt: string | null;
}

/**
 * Live verification result — from GET /api/payments/verify/:id or
 * /api/payments/lookup. The clerk's check, in this order: Student
 * Roll, Student Name, Paid Amount must match the receipt. Then Term,
 * Hall, Department, Fee Type, Transaction ID, Receipt No, and the
 * COMPLETED / NOT VERIFIED status.
 */
export interface VerificationResult {
  valid: boolean;
  status: string;
  receiptNo: string | null;
  tranId: string;
  studentRoll: string;
  studentName: string | null;
  hall: string | null;
  departmentCode: string;
  semester: string;
  termLabel: string;
  feeType: FeeType;
  amountBdt: number;
  completedAt: string | null;
  verifyUrl?: string;
  paymentId?: string;
  error?: string;
}

export function feeTypeLabel(feeType: FeeType): string {
  return feeType === "SEMESTER_FINAL" ? "Semester Final Fee" : "Course Registration Fee";
}

/** "Total credits: 19 · 19 × 20 BDT = 380 BDT + Online charge 15 BDT = Total 395 BDT" */
export function priceBreakdownText(b: PriceBreakdown): string {
  return `Total credits: ${b.totalCredits} · ${b.totalCredits} × ${b.perCreditRateBdt} BDT = ${b.creditAmountBdt} BDT + Online charge ${b.onlineChargeBdt} BDT = Total ${b.amountBdt} BDT`;
}
