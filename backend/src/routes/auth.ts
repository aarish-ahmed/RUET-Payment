import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { HALLS } from "../config/halls.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, signToken, type AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

const registerSchema = z.object({
  roll: z.string().trim().min(4).max(20),
  name: z.string().trim().min(2).max(100),
  email: z.string().email().optional(),
  departmentCode: z.string().trim().length(2).or(z.string().trim().min(2).max(5)),
  // Hall is required at registration, chosen from the verified RUET
  // hall list (see config/halls.ts). It appears on the receipt and in
  // the payment list, and on the verification page.
  hall: z.enum(HALLS),
  password: z.string().min(6).max(100),
});

// One login page for everyone: the identifier is a roll OR an email.
// The backend looks up by roll first, then by email. The JWT carries
// the account's role, and the frontend redirects by role: TEACHER
// -> /teacher/dashboard, STUDENT -> /dashboard.
const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(100),
  // Backwards compatibility: older frontend builds send { roll }.
  roll: z.string().trim().min(3).max(100).optional(),
  password: z.string().min(1).max(100),
});

const updateMeSchema = z.object({
  // Existing students (registered before halls were added, including
  // the seeded student 1903001) set or change their hall here, without
  // re-registering.
  hall: z.enum(HALLS),
});

function publicStudent(student: {
  id: string;
  roll: string;
  name: string;
  email: string | null;
  role: "STUDENT" | "TEACHER";
  hall: string | null;
  departmentCode: string;
}) {
  return {
    id: student.id,
    roll: student.roll,
    name: student.name,
    email: student.email,
    role: student.role,
    hall: student.hall,
    departmentCode: student.departmentCode,
  };
}

function accountToken(student: {
  id: string;
  roll: string;
  email: string | null;
  role: "STUDENT" | "TEACHER";
  departmentCode: string;
}): string {
  return signToken({
    sub: student.id,
    role: student.role === "TEACHER" ? "teacher" : "student",
    roll: student.roll,
    email: student.email ?? undefined,
    departmentCode: student.departmentCode,
  });
}

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid registration data", details: parsed.error.flatten() });
    return;
  }
  const { roll, name, email, departmentCode, hall, password } = parsed.data;
  const department = await prisma.department.findUnique({ where: { code: departmentCode } });
  if (!department) {
    res.status(400).json({ error: `Unknown department code: ${departmentCode}` });
    return;
  }
  const existing = await prisma.student.findUnique({ where: { roll } });
  if (existing) {
    res.status(409).json({ error: "A student with this roll already exists" });
    return;
  }
  if (email) {
    const emailTaken = await prisma.student.findUnique({ where: { email } });
    if (emailTaken) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
  }
  const passwordHash = await bcrypt.hash(password, 12);
  // role is NOT accepted from the client: every new registration is
  // a STUDENT by default (Prisma @default(STUDENT)). Jidan assigns
  // TEACHER to specified accounts directly in the database — see
  // README "Teacher system".
  const student = await prisma.student.create({
    data: { roll, name, email: email ?? null, hall, departmentCode, passwordHash },
  });
  res.status(201).json({ student: publicStudent(student), token: accountToken(student) });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Roll / email and password are required" });
    return;
  }
  const identifier = parsed.data.identifier ?? parsed.data.roll ?? "";
  const { password } = parsed.data;
  // Roll first, then email — so a roll that happens to look like an
  // email can never shadow the roll lookup.
  let student = await prisma.student.findUnique({ where: { roll: identifier } });
  if (!student && identifier.includes("@")) {
    student = await prisma.student.findUnique({ where: { email: identifier } });
  }
  if (!student) {
    res.status(401).json({ error: "Invalid roll / email or password" });
    return;
  }
  const ok = await bcrypt.compare(password, student.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid roll / email or password" });
    return;
  }
  res.json({ student: publicStudent(student), token: accountToken(student) });
});

router.get("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { roll: req.user?.roll },
  });
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ student: publicStudent(student) });
});

router.patch("/me", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile data", details: parsed.error.flatten() });
    return;
  }
  const student = await prisma.student.update({
    where: { roll: req.user?.roll },
    data: { hall: parsed.data.hall },
  });
  res.json({ student: publicStudent(student) });
});

export default router;
