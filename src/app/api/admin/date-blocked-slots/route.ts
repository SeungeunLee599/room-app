import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  createDateBlockedSlot,
  deleteDateBlockedSlot,
  getAdminDateBlockedSlots,
  parseCreateDateBlockedSlotInput,
  parseDateBlockedSlotId,
} from "@/lib/reservation-service";
import { assertAdminPassword } from "@/lib/admin-auth";

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const password = request.headers.get("x-admin-password")?.trim() ?? "";
    assertAdminPassword(password);

    const date = request.nextUrl.searchParams.get("date")?.trim() || undefined;
    const dateBlockedSlots = await getAdminDateBlockedSlots(date);

    return NextResponse.json({ dateBlockedSlots });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const body = payload as { adminPassword?: unknown };
    const password =
      typeof body.adminPassword === "string" ? body.adminPassword.trim() : "";
    assertAdminPassword(password);

    const input = parseCreateDateBlockedSlotInput(payload);
    const dateBlockedSlot = await createDateBlockedSlot(input);

    return NextResponse.json(
      { message: "예약 불가 시간이 등록되었습니다.", dateBlockedSlot },
      { status: 201 },
    );
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

    const dateBlockedSlotId = parseDateBlockedSlotId(payload);
    await deleteDateBlockedSlot(dateBlockedSlotId);

    return NextResponse.json({ message: "예약 불가 시간이 삭제되었습니다." });
  } catch (error) {
    return handleApiError(error);
  }
}

