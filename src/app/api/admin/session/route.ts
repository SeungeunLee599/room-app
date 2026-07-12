import { NextRequest, NextResponse } from "next/server";
import {
  assertAdminPassword,
  attachAdminSession,
  clearAdminSession,
  isAdminSessionValid,
} from "@/lib/admin-auth";
import { ApiError } from "@/lib/reservation-service";

function jsonNoStore(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return jsonNoStore({ authenticated: isAdminSessionValid(request) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const body = payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : {};
    const password = typeof body.password === "string" ? body.password.trim() : "";

    assertAdminPassword(password);
    return attachAdminSession(jsonNoStore({ message: "관리자 인증이 완료되었습니다." }));
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonNoStore({ message: error.message }, { status: error.status });
    }

    console.error(error);
    return jsonNoStore({ message: "관리자 인증 중 서버 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  return clearAdminSession(jsonNoStore({ message: "로그아웃되었습니다." }));
}
