import { NextRequest, NextResponse } from "next/server";
import { getLocalDateString } from "@/lib/date";
import {
  ApiError,
  createReservation,
  getPublicReservationsByDate,
  parseCreateReservationInput,
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const date = request.nextUrl.searchParams.get("date") ?? getLocalDateString();
    const reservations = await getPublicReservationsByDate(date);
    return NextResponse.json({ reservations });
  } catch (error) {
    return handleApiError(error);
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
    return handleApiError(error);
  }
}

