import { NextRequest, NextResponse } from "next/server";
import { getLocalDateString } from "@/lib/date";
import { logApiError } from "@/lib/server-log";
import {
  ApiError,
  createReservation,
  getPublicReservationsByDate,
  parseCreateReservationInput,
} from "@/lib/reservation-service";

function handleApiError(error: unknown, context?: Record<string, string>): NextResponse {
  if (error instanceof ApiError) {
    logApiError("/api/reservations", error, context);
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  logApiError("/api/reservations", error, context);
  return NextResponse.json(
    { message: "서버 오류가 발생했습니다." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const date = request.nextUrl.searchParams.get("date") ?? getLocalDateString();
    const reservations = await getPublicReservationsByDate(date);
    return NextResponse.json({ reservations });
  } catch (error) {
    return handleApiError(error, {
      method: "GET",
      date: request.nextUrl.searchParams.get("date") ?? "",
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const input = parseCreateReservationInput(payload);
    const reservation = await createReservation(input);
    return NextResponse.json(
      { message: "예약이 완료되었습니다.", reservation },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error, {
      method: "POST",
    });
  }
}
