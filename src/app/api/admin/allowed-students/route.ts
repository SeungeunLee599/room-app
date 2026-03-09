import { NextRequest, NextResponse } from "next/server";
import { assertAdminPassword } from "@/lib/admin-auth";
import { ApiError } from "@/lib/reservation-service";
import {
  StudentRegistryError,
  deleteAllowedStudent,
  listAllowedStudents,
  upsertAllowedStudent,
  upsertAllowedStudentsInBulk,
  type AllowedStudent,
} from "@/lib/student-registry";

function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError || error instanceof StudentRegistryError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json(
    { message: "서버 오류가 발생했습니다." },
    { status: 500 },
  );
}

function parseAdminPasswordFromBody(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const body = payload as Record<string, unknown>;
  return typeof body.adminPassword === "string" ? body.adminPassword.trim() : "";
}

function parseAllowedStudent(payload: unknown): AllowedStudent {
  if (!payload || typeof payload !== "object") {
    throw new StudentRegistryError(400, "잘못된 요청 형식입니다.");
  }

  const body = payload as Record<string, unknown>;
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!studentId) {
    throw new StudentRegistryError(400, "학번을 입력해주세요.");
  }
  if (!name) {
    throw new StudentRegistryError(400, "이름을 입력해주세요.");
  }

  return { studentId, name };
}

function parseStudentId(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new StudentRegistryError(400, "잘못된 요청 형식입니다.");
  }

  const body = payload as Record<string, unknown>;
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) {
    throw new StudentRegistryError(400, "학번을 입력해주세요.");
  }

  return studentId;
}

function parseBulkAllowedStudents(payload: unknown): AllowedStudent[] {
  if (!payload || typeof payload !== "object") {
    throw new StudentRegistryError(400, "잘못된 요청 형식입니다.");
  }

  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.students)) {
    throw new StudentRegistryError(400, "students 배열이 필요합니다.");
  }

  return body.students
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      studentId: typeof item.studentId === "string" ? item.studentId.trim() : "",
      name: typeof item.name === "string" ? item.name.trim() : "",
    }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const password = request.headers.get("x-admin-password")?.trim() ?? "";
    assertAdminPassword(password);

    const students = await listAllowedStudents();
    return NextResponse.json({ students });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const password = parseAdminPasswordFromBody(payload);
    assertAdminPassword(password);

    const student = parseAllowedStudent(payload);
    const saved = await upsertAllowedStudent(student);

    return NextResponse.json(
      {
        message: "학생 명단이 저장되었습니다.",
        student: saved,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const password = parseAdminPasswordFromBody(payload);
    assertAdminPassword(password);

    const students = parseBulkAllowedStudents(payload);
    const upsertedCount = await upsertAllowedStudentsInBulk(students);

    return NextResponse.json({
      message: `${upsertedCount}건의 학생 명단을 저장했습니다.`,
      upsertedCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const password = parseAdminPasswordFromBody(payload);
    assertAdminPassword(password);

    const studentId = parseStudentId(payload);
    await deleteAllowedStudent(studentId);

    return NextResponse.json({ message: "학생 명단에서 삭제되었습니다." });
  } catch (error) {
    return handleApiError(error);
  }
}
