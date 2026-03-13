import { NextRequest, NextResponse } from "next/server";
import { getLocalDateString, isValidDateString } from "@/lib/date";
import { logApiError } from "@/lib/server-log";
import {
  ApiError,
  getPublicLookupReservationsByDate,
} from "@/lib/reservation-service";

const PUBLIC_LOOKUP_VERSION = "public-lookup-2026-03-13-2";

function jsonWithNoStore(body: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Public-Lookup-Version", PUBLIC_LOOKUP_VERSION);
  return response;
}

function handleApiError(error: unknown, context?: Record<string, string>): NextResponse {
  if (error instanceof ApiError) {
    logApiError("/api/public-reservations", error, context);
    return jsonWithNoStore({ message: error.message }, { status: error.status });
  }

  logApiError("/api/public-reservations", error, context);
  return jsonWithNoStore(
    { message: "서버 오류가 발생했습니다." },
    { status: 500 },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const rawDate = request.nextUrl.searchParams.get("date");
    const date =
      rawDate && isValidDateString(rawDate)
        ? rawDate
        : getLocalDateString();

    const reservations = await getPublicLookupReservationsByDate(date);

    return jsonWithNoStore({
      reservations,
      meta: { version: PUBLIC_LOOKUP_VERSION, route: "public-reservations" },
    });
  } catch (error) {
    return handleApiError(error, {
      method: "GET",
      date: request.nextUrl.searchParams.get("date") ?? "",
    });
  }
}
