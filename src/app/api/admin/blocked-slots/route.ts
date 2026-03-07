import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  createBlockedSlot,
  deleteBlockedSlot,
  getAdminBlockedSlots,
  parseBlockedSlotId,
  parseCreateBlockedSlotInput,
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

    const weekdayQuery = request.nextUrl.searchParams.get("weekday");
    const weekday =
      weekdayQuery === null || weekdayQuery.trim() === ""
        ? undefined
        : Number(weekdayQuery);

    const blockedSlots = await getAdminBlockedSlots(
      Number.isInteger(weekday) ? weekday : undefined,
    );

    return NextResponse.json({ blockedSlots });
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

    const input = parseCreateBlockedSlotInput(payload);
    const blockedSlot = await createBlockedSlot(input);

    return NextResponse.json(
      { message: "예약 불가 시간이 등록되었습니다.", blockedSlot },
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

    const blockedSlotId = parseBlockedSlotId(payload);
    await deleteBlockedSlot(blockedSlotId);

    return NextResponse.json({ message: "예약 불가 시간이 삭제되었습니다." });
  } catch (error) {
    return handleApiError(error);
  }
}