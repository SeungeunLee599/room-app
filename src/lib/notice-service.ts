import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/reservation-service";

export type PublicNotice = {
  id: number;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

type NoticeInput = {
  title: string;
  content: string;
};

function parseTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function assertNoticeInput(input: NoticeInput): void {
  if (!input.title) {
    throw new ApiError(400, "공지사항 제목을 입력하세요.");
  }
  if (!input.content) {
    throw new ApiError(400, "공지사항 내용을 입력하세요.");
  }
}

export function parseNoticeInput(payload: unknown): NoticeInput {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const title = parseTrimmedString(body.title);
  const content = parseTrimmedString(body.content);

  const input = { title, content };
  assertNoticeInput(input);
  return input;
}

export function parseNoticeId(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const noticeId = typeof body.noticeId === "number" ? body.noticeId : Number(body.noticeId);

  if (!Number.isInteger(noticeId) || noticeId <= 0) {
    throw new ApiError(400, "공지사항 ID가 올바르지 않습니다.");
  }

  return noticeId;
}

export async function getPublicNotices(): Promise<PublicNotice[]> {
  return prisma.notice.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function createNotice(input: NoticeInput): Promise<PublicNotice> {
  return prisma.notice.create({
    data: {
      title: input.title,
      content: input.content,
    },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateNotice(noticeId: number, input: NoticeInput): Promise<PublicNotice> {
  const existing = await prisma.notice.findUnique({
    where: { id: noticeId },
    select: { id: true },
  });

  if (!existing) {
    throw new ApiError(404, "공지사항을 찾을 수 없습니다.");
  }

  return prisma.notice.update({
    where: { id: noticeId },
    data: {
      title: input.title,
      content: input.content,
    },
    select: {
      id: true,
      title: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function deleteNotice(noticeId: number): Promise<void> {
  const existing = await prisma.notice.findUnique({
    where: { id: noticeId },
    select: { id: true },
  });

  if (!existing) {
    throw new ApiError(404, "공지사항을 찾을 수 없습니다.");
  }

  await prisma.notice.delete({ where: { id: noticeId } });
}