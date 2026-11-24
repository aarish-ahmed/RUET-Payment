import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export type UserRole = "student" | "teacher";

/**
 * JWT payload — ONE account table (students) for everyone.
 * Students carry role "student", teachers carry role "teacher"
 * (Student.role in Prisma is STUDENT / TEACHER). Both carry their
 * roll (for a teacher, the roll is their staff ID, e.g. "T-001")
 * and email. The two roles are checked separately — a student token
 * can never call a teacher endpoint (requireTeacher returns 403)
 * and a teacher token can never call a student endpoint
 * (requireAuth returns 403), so a teacher can never pay as a student.
 * Tokens issued before roles existed have no role field and are
 * treated as student tokens for backwards compatibility.
 */
export interface AuthPayload {
  sub: string;
  role?: UserRole;
  roll?: string;
  email?: string;
  departmentCode?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

export interface TeacherRequest extends Request {
  teacher?: {
    id: string;
    name: string;
    email: string;
    roll: string;
    departmentCode: string | null;
  };
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions);
}

function readToken(req: Request): AuthPayload | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice("Bearer ".length), env.jwtSecret) as AuthPayload;
  } catch {
    return null;
  }
}

/** Student-only auth. Teacher tokens are rejected with 403. */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const decoded = readToken(req);
  if (!decoded) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  if (decoded.role === "teacher") {
    res.status(403).json({ error: "Teacher accounts cannot use student endpoints" });
    return;
  }
  if (!decoded.roll) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const student = await prisma.student.findUnique({
    where: { roll: decoded.roll },
    select: { roll: true, role: true, departmentCode: true },
  });
  if (!student || student.role !== "STUDENT") {
    res.status(401).json({ error: "Student no longer exists" });
    return;
  }
  req.user = {
    sub: decoded.sub,
    role: "student",
    roll: student.roll,
    departmentCode: student.departmentCode,
  };
  next();
}

/**
 * Teacher-only auth, on the SAME account table: the account must
 * have role TEACHER in the database, not just in the token. Any
 * student token — even a valid one — is rejected with 403, as is a
 * token with no role (old student tokens). A teacher can view paid
 * students for ALL departments; their stored departmentCode is
 * only their home department, never a restriction.
 */
export async function requireTeacher(
  req: TeacherRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const decoded = readToken(req);
  if (!decoded) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  if (decoded.role !== "teacher" || !decoded.roll) {
    res.status(403).json({ error: "Teacher access only — student accounts cannot use teacher endpoints" });
    return;
  }
  const teacher = await prisma.student.findUnique({
    where: { roll: decoded.roll },
    select: { id: true, name: true, email: true, roll: true, role: true, departmentCode: true },
  });
  if (!teacher || teacher.role !== "TEACHER") {
    res.status(401).json({ error: "Teacher no longer exists" });
    return;
  }
  req.teacher = {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email ?? "",
    roll: teacher.roll,
    departmentCode: teacher.departmentCode,
  };
  next();
}
