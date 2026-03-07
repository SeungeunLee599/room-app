import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  cancelReservationAsAdmin,
  getAdminReservations,
  parseReservationId,
} from "@/lib/reservation-service";

function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json(
    { message: "서버 오류가 발생했습니다." },
    { status: 500 },
  );
}

function assertAdminPassword(password: string): void {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new ApiError(500, "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  }
  if (password !== adminPassword) {
    throw new ApiError(401, "관리자 인증에 실패했습니다.");
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const password = request.headers.get("x-admin-password")?.trim() ?? "";
    assertAdminPassword(password);

    const date = request.nextUrl.searchParams.get("date")?.trim();
    const reservations = await getAdminReservations(date || undefined);

    return NextResponse.json({ reservations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const body = payload as { adminPassword?: unknown };
    const password =
      typeof body.adminPassword === "string" ? body.adminPassword.trim() : "";
    assertAdminPassword(password);

    const reservationId = parseReservationId(payload);
    await cancelReservationAsAdmin(reservationId);

    return NextResponse.json({ message: "관리자 권한으로 예약을 취소했습니다." });
  } catch (error) {
    return handleApiError(error);
  }
}

