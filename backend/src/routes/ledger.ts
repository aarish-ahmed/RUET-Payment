import { Router } from "express";
import { z } from "zod";
import { isTermCode, termLabel } from "../config/terms.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const filterSchema = z.object({
  department: z.string().trim().min(2).max(5).optional(),
  semester: z
    .string()
    .optional()
    .refine((v) => v === undefined || isTermCode(v), { message: "semester must be a term code, e.g. 1_ODD" }),
  feeType: z.enum(["SEMESTER_FINAL", "COURSE_REGISTRATION"]).optional(),
  mine: z.string().optional(),
});

/**
 * List payments (My Payments / department payment list / receipt history).
 * GET /api/ledger/payments?department=CSE&semester=1_ODD&feeType=SEMESTER_FINAL&mine=1
 * The list is read straight from Postgres — there is no Excel or Google
 * Sheet. Payment is recorded only in Postgres; the receipt is generated
 * from the same record. This list is the teacher's primary verification
 * tool: search by roll and check roll + name + amount with status
 * COMPLETED. There is no rebuild endpoint and no file export.
 */
router.get("/payments", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = filterSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid ledger filters" });
      return;
    }
    const { department, semester, feeType, mine } = parsed.data;
    const payments = await prisma.payment.findMany({
      where: {
        ...(department ? { departmentCode: department } : {}),
        ...(semester ? { semester } : {}),
        ...(feeType ? { feeType } : {}),
        ...(mine === "1" ? { studentRoll: req.user?.roll } : {}),
      },
      include: { student: { select: { name: true, hall: true } } },
      orderBy: [{ studentRoll: "asc" }, { createdAt: "asc" }],
    });
    res.json({
      payments: payments.map((p) => ({
        id: p.id,
        tranId: p.tranId,
        receiptNo: p.receiptNo,
        studentRoll: p.studentRoll,
        studentName: p.student.name,
        studentHall: p.student.hall,
        departmentCode: p.departmentCode,
        semester: p.semester,
        termLabel: termLabel(p.semester),
        feeType: p.feeType,
        totalCredits: p.totalCredits,
        amountBdt: Number(p.amountBdt),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not load ledger" });
  }
});

export default router;
