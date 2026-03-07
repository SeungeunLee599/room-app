import { NextRequest, NextResponse } from "next/server";
import { assertAdminPassword } from "@/lib/admin-auth";
import {
  createNotice,
  deleteNotice,
  getPublicNotices,
  parseNoticeId,
  parseNoticeInput,
  updateNotice,
} from "@/lib/notice-service";
import { ApiError } from "@/lib/reservation-service";

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

    const notices = await getPublicNotices();
    return NextResponse.json({ notices });
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

    const input = parseNoticeInput(payload);
    const notice = await createNotice(input);

    return NextResponse.json(
      { message: "공지사항이 등록되었습니다.", notice },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.json();
    const body = payload as { adminPassword?: unknown };
    const password =
      typeof body.adminPassword === "string" ? body.adminPassword.trim() : "";
    assertAdminPassword(password);

    const noticeId = parseNoticeId(payload);
    const input = parseNoticeInput(payload);
    const notice = await updateNotice(noticeId, input);

    return NextResponse.json({ message: "공지사항이 수정되었습니다.", notice });
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

    const noticeId = parseNoticeId(payload);
    await deleteNotice(noticeId);

    return NextResponse.json({ message: "공지사항이 삭제되었습니다." });
  } catch (error) {
    return handleApiError(error);
  }
}