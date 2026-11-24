/**
 * RUET academic terms — the single source of truth for term codes.
 * RUET does not use "Semester 1-8". It uses 10 terms, in this order:
 * 1st Odd, 1st Even, 2nd Odd, 2nd Even, 3rd Odd, 3rd Even,
 * 4th Odd, 4th Even, 5th Odd, 5th Even.
 * The database stores the code (e.g. "1_ODD"); the label (e.g. "1st Odd")
 * is only for display, in the UI and in the payment list.
 */
export const TERMS = [
  "1_ODD",
  "1_EVEN",
  "2_ODD",
  "2_EVEN",
  "3_ODD",
  "3_EVEN",
  "4_ODD",
  "4_EVEN",
  "5_ODD",
  "5_EVEN",
] as const;

export type TermCode = (typeof TERMS)[number];

export const TERM_LABELS: Record<TermCode, string> = {
  "1_ODD": "1st Odd",
  "1_EVEN": "1st Even",
  "2_ODD": "2nd Odd",
  "2_EVEN": "2nd Even",
  "3_ODD": "3rd Odd",
  "3_EVEN": "3rd Even",
  "4_ODD": "4th Odd",
  "4_EVEN": "4th Even",
  "5_ODD": "5th Odd",
  "5_EVEN": "5th Even",
};

export function termLabel(code: string): string {
  return (TERM_LABELS as Record<string, string>)[code] ?? code;
}

export function isTermCode(value: unknown): value is TermCode {
  return typeof value === "string" && (TERMS as readonly string[]).includes(value);
}

/**
 * Architecture is RUET's only 5-year program (10 terms). Every other
 * department is a 4-year program ending at 4th Even.
 */
export const ARCH_ONLY_TERMS: readonly TermCode[] = ["5_ODD", "5_EVEN"];

export function termsForDepartment(departmentCode: string): readonly TermCode[] {
  return departmentCode === "ARCH" ? TERMS : TERMS.slice(0, 8);
}

export function isTermAllowedForDepartment(
  departmentCode: string,
  term: TermCode,
): boolean {
  return termsForDepartment(departmentCode).includes(term);
}

/** 1-based position of a term, used only to keep sample course codes stable. */
export function termIndex(code: TermCode): number {
  return TERMS.indexOf(code) + 1;
}
