import { Prisma } from "@prisma/client";
import allowedStudents from "@/data/allowed-students.json";
import { prisma } from "@/lib/prisma";

export type AllowedStudent = {
  studentId: string;
  name: string;
};

export class StudentRegistryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function normalizeStudentId(value: string): string {
  return value.trim();
}

function normalizeAllowedStudentInput(item: AllowedStudent): AllowedStudent {
  return {
    studentId: normalizeStudentId(item.studentId),
    name: item.name.trim(),
  };
}

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021"
  );
}

function formatWriteError(error: unknown): StudentRegistryError {
  if (isMissingTableError(error)) {
    return new StudentRegistryError(
      500,
      "학생 명단 테이블을 찾을 수 없습니다. 데이터베이스 마이그레이션 후 다시 시도해주세요.",
    );
  }

  console.error(error);
  return new StudentRegistryError(
    500,
    "학생 명단 저장 중 서버 오류가 발생했습니다.",
  );
}

const fallbackAllowedStudents = Array.from(
  (allowedStudents as AllowedStudent[]).reduce((accumulator, item) => {
    const normalized = normalizeAllowedStudentInput(item);
    if (normalized.studentId && normalized.name) {
      accumulator.set(normalized.studentId, normalized.name);
    }
    return accumulator;
  }, new Map<string, string>()),
).map(([studentId, name]) => ({ studentId, name }));

const fallbackAllowedStudentMap = new Map(
  fallbackAllowedStudents.map((item) => [
    item.studentId,
    normalizeName(item.name),
  ]),
);

let ensuredAllowedStudentTable = false;
let seededFallbackStudents = false;

async function ensureAllowedStudentTable(): Promise<void> {
  if (ensuredAllowedStudentTable) {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AllowedStudent" (
      "studentId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AllowedStudent_pkey" PRIMARY KEY ("studentId")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AllowedStudent_name_idx"
    ON "AllowedStudent"("name");
  `);

  ensuredAllowedStudentTable = true;
}

async function ensureSeededFallbackStudents(): Promise<void> {
  await ensureAllowedStudentTable();

  if (seededFallbackStudents) {
    return;
  }

  const count = await prisma.allowedStudent.count();
  if (count === 0 && fallbackAllowedStudents.length > 0) {
    await prisma.allowedStudent.createMany({
      data: fallbackAllowedStudents,
      skipDuplicates: true,
    });
  }

  seededFallbackStudents = true;
}

function sortAllowedStudents(items: AllowedStudent[]): AllowedStudent[] {
  return [...items].sort((a, b) => a.studentId.localeCompare(b.studentId));
}

export async function listAllowedStudents(): Promise<AllowedStudent[]> {
  try {
    await ensureSeededFallbackStudents();
    const students = await prisma.allowedStudent.findMany({
      orderBy: { studentId: "asc" },
      select: { studentId: true, name: true },
    });
    return students;
  } catch (error) {
    if (isMissingTableError(error)) {
      return sortAllowedStudents(fallbackAllowedStudents);
    }
    console.error(error);
    return sortAllowedStudents(fallbackAllowedStudents);
  }
}

export async function isAllowedStudentName(
  studentId: string,
  name: string,
): Promise<boolean> {
  const normalizedStudentId = normalizeStudentId(studentId);
  const normalizedName = normalizeName(name.trim());

  try {
    await ensureSeededFallbackStudents();
    const student = await prisma.allowedStudent.findUnique({
      where: { studentId: normalizedStudentId },
      select: { name: true },
    });

    if (!student) {
      return false;
    }
    return normalizeName(student.name) === normalizedName;
  } catch (error) {
    if (isMissingTableError(error)) {
      const expected = fallbackAllowedStudentMap.get(normalizedStudentId);
      return expected === normalizedName;
    }
    console.error(error);
    const expected = fallbackAllowedStudentMap.get(normalizedStudentId);
    return expected === normalizedName;
  }
}

export async function upsertAllowedStudent(
  item: AllowedStudent,
): Promise<AllowedStudent> {
  const normalized = normalizeAllowedStudentInput(item);
  if (!normalized.studentId) {
    throw new StudentRegistryError(400, "학번을 입력해주세요.");
  }
  if (!normalized.name) {
    throw new StudentRegistryError(400, "이름을 입력해주세요.");
  }

  try {
    await ensureSeededFallbackStudents();
    const saved = await prisma.allowedStudent.upsert({
      where: { studentId: normalized.studentId },
      create: normalized,
      update: { name: normalized.name },
      select: { studentId: true, name: true },
    });
    return saved;
  } catch (error) {
    throw formatWriteError(error);
  }
}

export async function deleteAllowedStudent(studentId: string): Promise<void> {
  const normalizedStudentId = normalizeStudentId(studentId);
  if (!normalizedStudentId) {
    throw new StudentRegistryError(400, "삭제할 학번을 입력해주세요.");
  }

  try {
    await ensureSeededFallbackStudents();
    const exists = await prisma.allowedStudent.findUnique({
      where: { studentId: normalizedStudentId },
      select: { studentId: true },
    });

    if (!exists) {
      throw new StudentRegistryError(404, "해당 학번을 찾을 수 없습니다.");
    }

    await prisma.allowedStudent.delete({
      where: { studentId: normalizedStudentId },
    });
  } catch (error) {
    if (error instanceof StudentRegistryError) {
      throw error;
    }
    throw formatWriteError(error);
  }
}

export async function upsertAllowedStudentsInBulk(
  items: AllowedStudent[],
): Promise<number> {
  const normalizedMap = new Map<string, string>();

  for (const item of items) {
    const normalized = normalizeAllowedStudentInput(item);
    if (!normalized.studentId || !normalized.name) {
      continue;
    }
    normalizedMap.set(normalized.studentId, normalized.name);
  }

  const normalizedItems = Array.from(normalizedMap.entries()).map(
    ([studentId, name]) => ({ studentId, name }),
  );

  if (normalizedItems.length === 0) {
    throw new StudentRegistryError(400, "유효한 학번/이름 데이터가 없습니다.");
  }

  try {
    await ensureSeededFallbackStudents();
    await prisma.$transaction(
      normalizedItems.map((item) =>
        prisma.allowedStudent.upsert({
          where: { studentId: item.studentId },
          create: item,
          update: { name: item.name },
        }),
      ),
    );
    return normalizedItems.length;
  } catch (error) {
    throw formatWriteError(error);
  }
}
