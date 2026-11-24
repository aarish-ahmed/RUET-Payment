/**
 * Seed script — run with `npm run db:seed` (tsx prisma/seed.ts).
 *
 * Courses are still seeded from backend/prisma/courses-data.ts
 * (real RUET courses from the official syllabi), but payment NO
 * longer depends on them: total credits come from the term only
 * (odd = 19, even = 21) and the price is 20 BDT/credit + 15 BDT
 * online charge (see src/config/fees.ts). The Course table is kept
 * for future use. Departments and terms not in courses-data.ts are
 * intentionally left EMPTY — no sample or fake courses are seeded.
 * Fee rates live in src/config/fees.ts, not here.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PENDING_DEPARTMENTS, REAL_COURSES } from "./courses-data.js";

const prisma = new PrismaClient();

const DEPARTMENTS: Array<{ code: string; name: string }> = [
  { code: "CE", name: "Civil Engineering" },
  { code: "EEE", name: "Electrical and Electronic Engineering" },
  { code: "ME", name: "Mechanical Engineering" },
  { code: "CSE", name: "Computer Science and Engineering" },
  { code: "ETE", name: "Electronics and Telecommunication Engineering" },
  { code: "IPE", name: "Industrial and Production Engineering" },
  { code: "CME", name: "Chemical and Materials Engineering" },
  { code: "URP", name: "Urban and Regional Planning" },
  { code: "ARCH", name: "Architecture" },
  { code: "MSE", name: "Materials Science and Engineering" },
  { code: "ChE", name: "Chemical Engineering" },
  { code: "BECM", name: "Building Engineering and Construction Management" },
  { code: "ECE", name: "Electrical and Computer Engineering" },
  { code: "MTE", name: "Mechatronics Engineering" },
];

async function main(): Promise<void> {
  for (const dept of DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: dept,
    });
  }

  for (const course of REAL_COURSES) {
    await prisma.course.upsert({
      where: {
        code_departmentCode_semester: {
          code: course.code,
          departmentCode: course.departmentCode,
          semester: course.semester,
        },
      },
      update: { title: course.title, credits: course.credits },
      create: course,
    });
  }

  const passwordHash = await bcrypt.hash("student123", 12);
  await prisma.student.upsert({
    where: { roll: "1903001" },
    update: { name: "RUET Student", departmentCode: "CSE", role: "STUDENT" },
    create: {
      roll: "1903001",
      name: "RUET Student",
      email: "1903001@ruet.ac.bd",
      role: "STUDENT",
      departmentCode: "CSE",
      passwordHash,
    },
  });

  // Seeded teacher — an ORDINARY account in the students table with
  // role TEACHER (no separate Teacher model). Logs in from the SAME
  // /login page (roll "T-001" or email teacher@ruet.ac.bd) and is
  // redirected to /teacher/dashboard. Its stored departmentCode
  // (CSE) is only its home department — a teacher can view paid
  // students for ALL departments. Change or delete this account in
  // production (see README "Teacher system").
  const teacherHash = await bcrypt.hash("teacher123", 12);
  await prisma.student.upsert({
    where: { roll: "T-001" },
    update: { name: "RUET Teacher", email: "teacher@ruet.ac.bd", role: "TEACHER" },
    create: {
      roll: "T-001",
      name: "RUET Teacher",
      email: "teacher@ruet.ac.bd",
      role: "TEACHER",
      hall: "Non-residential / Day Scholar",
      departmentCode: "CSE",
      passwordHash: teacherHash,
    },
  });

  const byDept = new Map<string, number>();
  for (const c of REAL_COURSES) byDept.set(c.departmentCode, (byDept.get(c.departmentCode) ?? 0) + 1);
  console.log(`Seeded ${DEPARTMENTS.length} departments, ${REAL_COURSES.length} real courses:`);
  for (const [code, count] of [...byDept.entries()].sort()) {
    console.log(`  ${code}: ${count} courses`);
  }
  console.log("Pending (no courses seeded — see courses-data.ts PENDING_DEPARTMENTS):");
  for (const p of PENDING_DEPARTMENTS) {
    console.log(`  ${p.departmentCode}: ${p.terms}`);
  }
  console.log("Seeded student: roll 1903001 / password student123 (department CSE, role STUDENT)");
  console.log(
    "Seeded teacher: roll T-001 or email teacher@ruet.ac.bd / password teacher123 (role TEACHER, all departments) — change/delete in production",
  );
  console.log("Pricing: odd terms 19 credits = 395 BDT, even terms 21 credits = 435 BDT (20 BDT/credit + 15 BDT online charge). Any department/term can pay — no course list needed.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
