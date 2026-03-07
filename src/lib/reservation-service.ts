import { compare, hash } from "bcryptjs";
import { Prisma, type Reservation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLocalDateString, isValidDateString } from "@/lib/date";
import { ROOM_NAMES, isValidRoomName, type RoomName } from "@/lib/rooms";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ROOM_ORDER = new Map(ROOM_NAMES.map((name, index) => [name, index]));

export type PublicReservation = {
  id: number;
  roomName: RoomName;
  date: string;
  startHour: number;
  endHour: number;
  durationHours: number;
  name: string;
  createdAt: Date;
  isBlocked: boolean;
  blockedReason: string | null;
};

export type AdminReservation = Pick<
  Reservation,
  | "id"
  | "studentId"
  | "name"
  | "roomName"
  | "date"
  | "startHour"
  | "endHour"
  | "durationHours"
  | "createdAt"
>;

export type AdminBlockedSlot = {
  id: number;
  roomName: RoomName;
  weekday: number;
  startHour: number;
  endHour: number;
  reason: string;
  createdAt: Date;
};

type CreateReservationInput = {
  studentId: string;
  name: string;
  password: string;
  roomName: string;
  date: string;
  startHour: number;
  endHour: number;
};

type CreateBlockedSlotInput = {
  roomName: RoomName;
  weekday: number;
  startHour: number;
  endHour: number;
  reason: string;
};

type CancelByUserInput = {
  reservationId: number;
  studentId: string;
  name: string;
  password: string;
};

function parseTrimmedString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function parseInteger(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return Number(value);
  }
  return Number.NaN;
}

function getWeekdayFromDate(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function assertDate(value: string): void {
  if (!isValidDateString(value)) {
    throw new ApiError(400, "예약 날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
  }

  const [year, month, day] = value.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const todayString = getLocalDateString();
  const [todayYear, todayMonth, todayDay] = todayString.split("-").map(Number);
  const today = new Date(todayYear, todayMonth - 1, todayDay);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 14);

  if (selectedDate < today || selectedDate > maxDate) {
    throw new ApiError(400, "예약 날짜는 오늘부터 14일 이내만 선택할 수 있습니다.");
  }
}

function assertRoomName(value: string): asserts value is RoomName {
  if (!isValidRoomName(value)) {
    throw new ApiError(400, "유효하지 않은 방 이름입니다.");
  }
}

function assertPin(password: string): void {
  if (!/^\d{4}$/.test(password)) {
    throw new ApiError(400, "비밀번호는 4자리 숫자여야 합니다.");
  }
}

function assertWeekday(weekday: number): void {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new ApiError(400, "요일 값이 올바르지 않습니다. (0:일요일 ~ 6:토요일)");
  }
}

function assertTimeRange(startHour: number, endHour: number): void {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    throw new ApiError(400, "시작/종료 시간은 정각 단위(정수)여야 합니다.");
  }
  if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24) {
    throw new ApiError(400, "시간 범위는 00:00부터 24:00 사이여야 합니다.");
  }
  if (endHour <= startHour) {
    throw new ApiError(400, "종료 시간은 시작 시간보다 늦어야 합니다.");
  }
}

function assertNameAndStudent(studentId: string, name: string): void {
  if (!studentId) {
    throw new ApiError(400, "학번을 입력하세요.");
  }
  if (!name) {
    throw new ApiError(400, "이름을 입력하세요.");
  }
}

function mapAdminReservation(reservation: AdminReservation): AdminReservation {
  return reservation;
}

function mapAdminBlockedSlot(slot: {
  id: number;
  roomName: string;
  weekday: number;
  startHour: number;
  endHour: number;
  reason: string;
  createdAt: Date;
}): AdminBlockedSlot | null {
  if (!isValidRoomName(slot.roomName)) {
    return null;
  }

  return {
    id: slot.id,
    roomName: slot.roomName,
    weekday: slot.weekday,
    startHour: slot.startHour,
    endHour: slot.endHour,
    reason: slot.reason,
    createdAt: slot.createdAt,
  };
}

function isPublicRoomName(value: string): value is RoomName {
  return isValidRoomName(value);
}

function toLockKey(value: string): number {
  let hashValue = 0;
  for (let index = 0; index < value.length; index += 1) {
    hashValue = (hashValue * 31 + value.charCodeAt(index)) | 0;
  }
  const positive = Math.abs(hashValue);
  return positive === 0 ? 1 : positive;
}

function isRetryableTransactionError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function createReservationInTransaction(
  input: CreateReservationInput,
  passwordHash: string,
  durationHours: number,
): Promise<PublicReservation> {
  return prisma.$transaction(
    async (tx) => {
      const roomLockKey = toLockKey(`room:${input.roomName}:${input.date}`);
      const studentLockKey = toLockKey(`student:${input.studentId}:${input.date}`);
      const weekday = getWeekdayFromDate(input.date);

      // Same room/date and same student/date requests are serialized inside one transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${roomLockKey})`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${studentLockKey})`;

      const blocked = await tx.blockedSlot.findFirst({
        where: {
          roomName: input.roomName,
          weekday,
          startHour: { lt: input.endHour },
          endHour: { gt: input.startHour },
        },
        select: { id: true, reason: true },
      });

      if (blocked) {
        throw new ApiError(409, `예약 불가 시간입니다: ${blocked.reason}`);
      }

      const overlapped = await tx.reservation.findFirst({
        where: {
          roomName: input.roomName,
          date: input.date,
          startHour: { lt: input.endHour },
          endHour: { gt: input.startHour },
        },
        select: { id: true },
      });

      if (overlapped) {
        throw new ApiError(409, "이미 예약된 시간입니다.");
      }

      const usage = await tx.reservation.aggregate({
        where: {
          studentId: input.studentId,
          date: input.date,
        },
        _sum: {
          durationHours: true,
        },
      });

      const usedHours = usage._sum.durationHours ?? 0;
      if (usedHours + durationHours > 3) {
        throw new ApiError(
          400,
          "같은 날짜에는 최대 3시간까지만 예약 가능합니다",
        );
      }

      const created = await tx.reservation.create({
        data: {
          studentId: input.studentId,
          name: input.name,
          passwordHash,
          roomName: input.roomName,
          date: input.date,
          startHour: input.startHour,
          endHour: input.endHour,
          durationHours,
        },
        select: {
          id: true,
          roomName: true,
          date: true,
          startHour: true,
          endHour: true,
          durationHours: true,
          name: true,
          createdAt: true,
        },
      });

      if (!isValidRoomName(created.roomName)) {
        throw new ApiError(500, "예약 데이터에 유효하지 않은 방 이름이 있습니다.");
      }

      return {
        ...created,
        roomName: created.roomName,
        isBlocked: false,
        blockedReason: null,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    },
  );
}

export function parseCreateReservationInput(
  payload: unknown,
): CreateReservationInput {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const studentId = parseTrimmedString(body.studentId);
  const name = parseTrimmedString(body.name);
  const password = parseTrimmedString(body.password);
  const roomName = parseTrimmedString(body.roomName);
  const date = parseTrimmedString(body.date);
  const startHour = parseInteger(body.startHour);
  const endHour = parseInteger(body.endHour);

  assertNameAndStudent(studentId, name);
  assertPin(password);
  assertRoomName(roomName);
  assertDate(date);
  assertTimeRange(startHour, endHour);

  return {
    studentId,
    name,
    password,
    roomName,
    date,
    startHour,
    endHour,
  };
}

export function parseCreateBlockedSlotInput(payload: unknown): CreateBlockedSlotInput {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const roomName = parseTrimmedString(body.roomName);
  const weekday = parseInteger(body.weekday);
  const startHour = parseInteger(body.startHour);
  const endHour = parseInteger(body.endHour);
  const reason = parseTrimmedString(body.reason);

  assertRoomName(roomName);
  assertWeekday(weekday);
  assertTimeRange(startHour, endHour);

  if (!reason) {
    throw new ApiError(400, "예약 불가 사유를 입력하세요.");
  }

  return {
    roomName,
    weekday,
    startHour,
    endHour,
    reason,
  };
}

export function parseCancelByUserInput(payload: unknown): CancelByUserInput {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const reservationId = parseInteger(body.reservationId);
  const studentId = parseTrimmedString(body.studentId);
  const name = parseTrimmedString(body.name);
  const password = parseTrimmedString(body.password);

  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    throw new ApiError(400, "예약 ID가 올바르지 않습니다.");
  }
  assertNameAndStudent(studentId, name);
  assertPin(password);

  return { reservationId, studentId, name, password };
}

export function parseReservationId(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }
  const body = payload as Record<string, unknown>;
  const reservationId = parseInteger(body.reservationId);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    throw new ApiError(400, "예약 ID가 올바르지 않습니다.");
  }
  return reservationId;
}

export function parseBlockedSlotId(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const blockedSlotId = parseInteger(body.blockedSlotId);
  if (!Number.isInteger(blockedSlotId) || blockedSlotId <= 0) {
    throw new ApiError(400, "차단 슬롯 ID가 올바르지 않습니다.");
  }

  return blockedSlotId;
}

export async function getPublicReservationsByDate(
  date: string,
): Promise<PublicReservation[]> {
  assertDate(date);
  const weekday = getWeekdayFromDate(date);

  const reservations = await prisma.reservation.findMany({
    where: { date },
    orderBy: [{ roomName: "asc" }, { startHour: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      roomName: true,
      date: true,
      startHour: true,
      endHour: true,
      durationHours: true,
      name: true,
      createdAt: true,
    },
  });

  const blockedSlots = await prisma.blockedSlot.findMany({
    where: { weekday },
    orderBy: [{ roomName: "asc" }, { startHour: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      roomName: true,
      weekday: true,
      startHour: true,
      endHour: true,
      reason: true,
      createdAt: true,
    },
  });

  const mappedReservations: PublicReservation[] = reservations
    .filter((reservation): reservation is typeof reservation & { roomName: RoomName } =>
      isPublicRoomName(reservation.roomName),
    )
    .map((reservation) => ({
      id: reservation.id,
      roomName: reservation.roomName,
      date: reservation.date,
      startHour: reservation.startHour,
      endHour: reservation.endHour,
      durationHours: reservation.durationHours,
      name: reservation.name,
      createdAt: reservation.createdAt,
      isBlocked: false,
      blockedReason: null,
    }));

  const mappedBlocked: PublicReservation[] = blockedSlots
    .filter((slot): slot is typeof slot & { roomName: RoomName } =>
      isPublicRoomName(slot.roomName),
    )
    .map((slot) => ({
      id: slot.id,
      roomName: slot.roomName,
      date,
      startHour: slot.startHour,
      endHour: slot.endHour,
      durationHours: slot.endHour - slot.startHour,
      name: slot.reason,
      createdAt: slot.createdAt,
      isBlocked: true,
      blockedReason: slot.reason,
    }));

  return [...mappedReservations, ...mappedBlocked].sort((a, b) => {
    const roomDiff = (ROOM_ORDER.get(a.roomName) ?? 999) - (ROOM_ORDER.get(b.roomName) ?? 999);
    if (roomDiff !== 0) {
      return roomDiff;
    }
    if (a.startHour !== b.startHour) {
      return a.startHour - b.startHour;
    }
    return Number(b.isBlocked) - Number(a.isBlocked);
  });
}

export async function getAdminReservations(
  date?: string,
): Promise<AdminReservation[]> {
  if (date) {
    assertDate(date);
  }

  const reservations = await prisma.reservation.findMany({
    where: date ? { date } : undefined,
    orderBy: [{ date: "asc" }, { roomName: "asc" }, { startHour: "asc" }],
    select: {
      id: true,
      studentId: true,
      name: true,
      roomName: true,
      date: true,
      startHour: true,
      endHour: true,
      durationHours: true,
      createdAt: true,
    },
  });

  return reservations.map(mapAdminReservation);
}

export async function getAdminBlockedSlots(
  weekday?: number,
): Promise<AdminBlockedSlot[]> {
  if (typeof weekday === "number") {
    assertWeekday(weekday);
  }

  const blockedSlots = await prisma.blockedSlot.findMany({
    where: typeof weekday === "number" ? { weekday } : undefined,
    orderBy: [{ weekday: "asc" }, { roomName: "asc" }, { startHour: "asc" }],
    select: {
      id: true,
      roomName: true,
      weekday: true,
      startHour: true,
      endHour: true,
      reason: true,
      createdAt: true,
    },
  });

  return blockedSlots
    .map(mapAdminBlockedSlot)
    .filter((slot): slot is AdminBlockedSlot => slot !== null);
}

export async function createBlockedSlot(
  input: CreateBlockedSlotInput,
): Promise<AdminBlockedSlot> {
  const overlapped = await prisma.blockedSlot.findFirst({
    where: {
      roomName: input.roomName,
      weekday: input.weekday,
      startHour: { lt: input.endHour },
      endHour: { gt: input.startHour },
    },
    select: { id: true },
  });

  if (overlapped) {
    throw new ApiError(409, "이미 차단된 시간과 겹칩니다.");
  }

  const created = await prisma.blockedSlot.create({
    data: {
      roomName: input.roomName,
      weekday: input.weekday,
      startHour: input.startHour,
      endHour: input.endHour,
      reason: input.reason,
    },
    select: {
      id: true,
      roomName: true,
      weekday: true,
      startHour: true,
      endHour: true,
      reason: true,
      createdAt: true,
    },
  });

  const mapped = mapAdminBlockedSlot(created);
  if (!mapped) {
    throw new ApiError(500, "차단 슬롯 생성 데이터가 올바르지 않습니다.");
  }

  return mapped;
}

export async function deleteBlockedSlot(blockedSlotId: number): Promise<void> {
  const blockedSlot = await prisma.blockedSlot.findUnique({
    where: { id: blockedSlotId },
    select: { id: true },
  });

  if (!blockedSlot) {
    throw new ApiError(404, "차단 슬롯을 찾을 수 없습니다.");
  }

  await prisma.blockedSlot.delete({
    where: { id: blockedSlotId },
  });
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<PublicReservation> {
  const durationHours = input.endHour - input.startHour;
  const passwordHash = await hash(input.password, 10);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await createReservationInTransaction(
        input,
        passwordHash,
        durationHours,
      );
    } catch (error) {
      if (isRetryableTransactionError(error) && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new ApiError(500, "예약 처리 중 일시적인 충돌이 반복되었습니다. 다시 시도하세요.");
}

export async function cancelReservationByUser(
  input: CancelByUserInput,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: input.reservationId },
    select: {
      id: true,
      studentId: true,
      name: true,
      passwordHash: true,
    },
  });

  if (!reservation) {
    throw new ApiError(404, "예약을 찾을 수 없습니다.");
  }

  if (
    reservation.studentId !== input.studentId ||
    reservation.name !== input.name
  ) {
    throw new ApiError(401, "학번 또는 이름이 일치하지 않습니다.");
  }

  const passwordMatched = await compare(input.password, reservation.passwordHash);
  if (!passwordMatched) {
    throw new ApiError(401, "비밀번호가 일치하지 않습니다.");
  }

  await prisma.reservation.delete({
    where: { id: input.reservationId },
  });
}

export async function cancelReservationAsAdmin(reservationId: number): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true },
  });

  if (!reservation) {
    throw new ApiError(404, "예약을 찾을 수 없습니다.");
  }

  await prisma.reservation.delete({
    where: { id: reservationId },
  });
}
