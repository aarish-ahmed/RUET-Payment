import ExcelJS from "exceljs";
import { Router } from "express";
import { z } from "zod";
import { isTermCode, termLabel } from "../config/terms.js";
import { prisma } from "../lib/prisma.js";
import { requireTeacher, type TeacherRequest } from "../middleware/auth.js";

const router = Router();

const paymentsFilterSchema = z.object({
  departmentCode: z.string().trim().min(2).max(5).optional(),
  semester: z
    .string()
    .optional()
    .refine((v) => v === undefined || isTermCode(v), { message: "semester must be a term code, e.g. 1_ODD" }),
  feeType: z.enum(["SEMESTER_FINAL", "COURSE_REGISTRATION"]).optional(),
  search: z.string().trim().max(100).optional(),
});

/**
 * Teacher account — NOT a separate model. Teachers are ordinary
 * accounts in the students table with role TEACHER (see README
 * "Teacher system"). They log in from the SAME /login page as
 * students (roll or email + password) and are redirected to
 * /teacher/dashboard by their role. There is no separate teacher
 * login page and no /api/teachers/register or /api/teachers/login.
 */
function publicTeacher(teacher: {
  id: string;
  name: string;
  email: string;
  roll: string;
  departmentCode: string | null;
}) {
  return {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    roll: teacher.roll,
    role: "TEACHER" as const,
    departmentCode: teacher.departmentCode,
  };
}

router.get("/me", requireTeacher, async (req: TeacherRequest, res) => {
  const teacher = await prisma.student.findUnique({ where: { id: req.teacher?.id } });
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json({
    teacher: publicTeacher({
      id: teacher.id,
      name: teacher.name,
      email: teacher.email ?? "",
      roll: teacher.roll,
      departmentCode: teacher.departmentCode,
    }),
  });
});

/**
 * Shared filter logic for the paid-students list and its export.
 * Only COMPLETED payments are ever returned. A teacher can view
 * ALL departments — their stored departmentCode is only their home
 * department, never a restriction.
 */
async function findPaidPayments(req: TeacherRequest) {
  const parsed = paymentsFilterSchema.safeParse(req.query);
  if (!parsed.success) {
    throw new Error("Invalid filters");
  }
  const { departmentCode, semester, feeType, search } = parsed.data;
  const where = {
    status: "COMPLETED" as const,
    ...(departmentCode ? { departmentCode } : {}),
    ...(semester ? { semester } : {}),
    ...(feeType ? { feeType } : {}),
    ...(search
      ? {
          student: {
            OR: [
              { roll: { contains: search, mode: "insensitive" as const } },
              { name: { contains: search, mode: "insensitive" as const } },
            ],
          },
        }
      : {}),
  };
  return prisma.payment.findMany({
    where,
    include: { student: { select: { name: true, hall: true } } },
    orderBy: [{ studentRoll: "asc" }, { createdAt: "asc" }],
  });
}

function toPaidStudentRow(p: {
  studentRoll: string;
  student: { name: string; hall: string | null };
  departmentCode: string;
  semester: string;
  feeType: "SEMESTER_FINAL" | "COURSE_REGISTRATION";
  totalCredits: number;
  amountBdt: unknown;
  tranId: string;
  receiptNo: string | null;
  status: string;
  completedAt: Date | null;
}) {
  return {
    studentRoll: p.studentRoll,
    studentName: p.student.name,
    studentHall: p.student.hall,
    departmentCode: p.departmentCode,
    semester: p.semester,
    termLabel: termLabel(p.semester),
    feeType: p.feeType,
    totalCredits: p.totalCredits,
    amountBdt: Number(p.amountBdt),
    tranId: p.tranId,
    receiptNo: p.receiptNo,
    status: p.status,
    completedAt: p.completedAt?.toISOString() ?? null,
  };
}

/**
 * Paid-students list for teachers (the primary verification tool).
 * GET /api/teachers/payments?departmentCode=CSE&semester=1_ODD&feeType=SEMESTER_FINAL&search=1903
 * Server-side filtering; students (even with a valid student token)
 * get 403 from requireTeacher.
 */
router.get("/payments", requireTeacher, async (req: TeacherRequest, res) => {
  try {
    const payments = await findPaidPayments(req);
    res.json({ payments: payments.map(toPaidStudentRow), count: payments.length });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not load paid students" });
  }
});

/**
 * Download the CURRENT filtered paid-students list as .xlsx.
 * GET /api/teachers/payments/export?departmentCode=&semester=&feeType=&search=
 * The workbook is built IN MEMORY from the live Postgres query and
 * streamed back as a download. Nothing is written to disk — this is
 * an on-demand export only and does NOT bring back the old
 * auto-created Excel ledger files (backend/data/ledger), which stay
 * removed. Payment is recorded only in Postgres.
 */
router.get("/payments/export", requireTeacher, async (req: TeacherRequest, res) => {
  try {
    const payments = await findPaidPayments(req);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "RUET Fee Payment System";
    const sheet = workbook.addWorksheet("Paid Students");
    sheet.columns = [
      { header: "Roll", key: "roll", width: 14 },
      { header: "Name", key: "name", width: 28 },
      { header: "Hall", key: "hall", width: 34 },
      { header: "Department", key: "department", width: 12 },
      { header: "Term", key: "term", width: 10 },
      { header: "Fee Type", key: "feeType", width: 22 },
      { header: "Total Credits", key: "credits", width: 13 },
      { header: "Amount (BDT)", key: "amount", width: 14 },
      { header: "Transaction ID", key: "tranId", width: 30 },
      { header: "Receipt No", key: "receiptNo", width: 20 },
      { header: "Status", key: "status", width: 11 },
      { header: "Completed Date", key: "completedAt", width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const p of payments) {
      const row = toPaidStudentRow(p);
      sheet.addRow({
        roll: row.studentRoll,
        name: row.studentName,
        hall: row.studentHall ?? "",
        department: row.departmentCode,
        term: row.termLabel,
        feeType: row.feeType === "SEMESTER_FINAL" ? "Semester Final Fee" : "Course Registration Fee",
        credits: row.totalCredits,
        amount: row.amountBdt,
        tranId: row.tranId,
        receiptNo: row.receiptNo ?? "",
        status: row.status,
        completedAt: row.completedAt ? new Date(row.completedAt).toLocaleString("en-GB") : "",
      });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="paid-students-${today}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not export paid students" });
  }
});

export default router;
