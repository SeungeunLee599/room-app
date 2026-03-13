import { NextResponse } from "next/server";
import { ApiError } from "@/lib/reservation-service";
import { logApiError } from "@/lib/server-log";
import { getPublicNotices } from "@/lib/notice-service";

function handleApiError(error: unknown, context?: Record<string, string>): NextResponse {
  if (error instanceof ApiError) {
    logApiError("/api/notices", error, context);
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  logApiError("/api/notices", error, context);
  return NextResponse.json(
    { message: "서버 오류가 발생했습니다." },
    { status: 500 },
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const notices = await getPublicNotices();
    return NextResponse.json({ notices });
  } catch (error) {
    return handleApiError(error, {
      method: "GET",
    });
  }
}
