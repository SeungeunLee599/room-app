import { NextResponse } from "next/server";
import { ApiError } from "@/lib/reservation-service";
import { getPublicNotices } from "@/lib/notice-service";

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

export async function GET(): Promise<NextResponse> {
  try {
    const notices = await getPublicNotices();
    return NextResponse.json({ notices });
  } catch (error) {
    return handleApiError(error);
  }
}