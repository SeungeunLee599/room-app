import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  cancelReservationByUser,
  parseCancelByUserInput,
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

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const input = parseCancelByUserInput(payload);
    await cancelReservationByUser(input);

    return NextResponse.json({ message: "예약이 취소되었습니다." });
  } catch (error) {
    return handleApiError(error);
  }
}

