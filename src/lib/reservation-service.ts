import { compare, hash } from "bcryptjs";
import { Prisma, type Reservation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getLocalDateString, isValidDateString } from "@/lib/date";
import { ROOM_NAMES, isValidRoomName, type RoomName } from "@/lib/rooms";
import { isAllowedStudentName } from "@/lib/student-registry";

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
  | "phoneNumber"
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

export type AdminDateBlockedSlot = {
  id: number;
  roomName: RoomName;
  date: string;
  startHour: number;
  endHour: number;
  reason: string;
  createdAt: Date;
};

type CreateReservationInput = {
  studentId: string;
  name: string;
  phoneNumber: string;
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

type CreateDateBlockedSlotInput = {
  roomName: RoomName;
  date: string;
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

function isSchemaMismatchError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function migrationRequiredMessage(feature: string): string {
  return `${feature} 기능을 사용하려면 데이터베이스 마이그레이션이 필요합니다. 최신 버전으로 다시 배포하거나 prisma migrate deploy를 적용하세요.`;
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
    throw new ApiError(400, "예약 날짜는 오늘부터 14일 이내에서만 선택할 수 있습니다.");
  }
}

function assertReservationStartDate(value: string): void {
  const serviceStartDate = "2026-04-01";

  if (value < serviceStartDate) {
    throw new ApiError(
      400,
      "일반 사용자 예약은 2026-04-01부터 가능합니다. 관리자 기능은 계속 사용할 수 있습니다.",
    );
  }
}

function assertDateFormatOnly(value: string): void {
  if (!isValidDateString(value)) {
    throw new ApiError(400, "날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)");
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
    throw new ApiError(400, "요일 값이 올바르지 않습니다. (0: 일요일 ~ 6: 토요일)");
  }
}

function assertTimeRange(startHour: number, endHour: number): void {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    throw new ApiError(400, "시작 시간과 종료 시간은 정각 단위의 정수여야 합니다.");
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
    throw new ApiError(400, "학번을 입력해주세요.");
  }
  if (!name) {
    throw new ApiError(400, "이름을 입력해주세요.");
  }
}

function assertPhoneNumber(phoneNumber: string): void {
  if (!phoneNumber) {
    throw new ApiError(400, "전화번호를 입력해주세요.");
  }

  const normalized = phoneNumber.replace(/[\s-]/g, "");
  if (!/^\d{8,13}$/.test(normalized)) {
    throw new ApiError(400, "전화번호 형식이 올바르지 않습니다.");
  }
}

async function assertRegisteredStudent(studentId: string, name: string): Promise<void> {
  if (!(await isAllowedStudentName(studentId, name))) {
    throw new ApiError(400, "등록된 학번-이름 정보와 일치하지 않습니다.");
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

function mapAdminDateBlockedSlot(slot: {
  id: number;
  roomName: string;
  date: string;
  startHour: number;
  endHour: number;
  reason: string;
  createdAt: Date;
}): AdminDateBlockedSlot | null {
  if (!isValidRoomName(slot.roomName)) {
    return null;
  }

  return {
    id: slot.id,
    roomName: slot.roomName,
    date: slot.date,
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

async function findBlockedOverlapForReservation(
  tx: Prisma.TransactionClient,
  input: CreateReservationInput,
): Promise<{ reason: string } | null> {
  try {
    const blocked = await tx.blockedSlot.findFirst({
      where: {
        roomName: input.roomName,
        weekday: getWeekdayFromDate(input.date),
        startHour: { lt: input.endHour },
        endHour: { gt: input.startHour },
      },
      select: { reason: true },
    });

    if (blocked) {
      return blocked;
    }

    return await tx.dateBlockedSlot.findFirst({
      where: {
        roomName: input.roomName,
        date: input.date,
        startHour: { lt: input.endHour },
        endHour: { gt: input.startHour },
      },
      select: { reason: true },
    });
  } catch (error) {
    if (isSchemaMismatchError(error)) {
      return null;
    }
    throw error;
  }
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

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${roomLockKey})`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${studentLockKey})`;

      const blocked = await findBlockedOverlapForReservation(tx, input);
      if (blocked) {
        throw new ApiError(409, `예약 불가 시간입니다. 사유: ${blocked.reason}`);
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
          "같은 학번은 같은 날짜에 최대 3시간까지만 예약할 수 있습니다.",
        );
      }

      const created = await tx.reservation.create({
        data: {
          studentId: input.studentId,
          name: input.name,
          phoneNumber: input.phoneNumber,
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
        throw new ApiError(500, "예약 저장 후 방 이름을 확인하지 못했습니다.");
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
  const phoneNumber = parseTrimmedString(body.phoneNumber);
  const password = parseTrimmedString(body.password);
  const roomName = parseTrimmedString(body.roomName);
  const date = parseTrimmedString(body.date);
  const startHour = parseInteger(body.startHour);
  const endHour = parseInteger(body.endHour);

  assertNameAndStudent(studentId, name);
  assertPhoneNumber(phoneNumber);
  assertPin(password);
  assertRoomName(roomName);
  assertDate(date);
  assertReservationStartDate(date);
  assertTimeRange(startHour, endHour);

  return {
    studentId,
    name,
    phoneNumber,
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
    throw new ApiError(400, "예약 불가 사유를 입력해주세요.");
  }

  return {
    roomName,
    weekday,
    startHour,
    endHour,
    reason,
  };
}

export function parseCreateDateBlockedSlotInput(payload: unknown): CreateDateBlockedSlotInput {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const roomName = parseTrimmedString(body.roomName);
  const date = parseTrimmedString(body.date);
  const startHour = parseInteger(body.startHour);
  const endHour = parseInteger(body.endHour);
  const reason = parseTrimmedString(body.reason);

  assertRoomName(roomName);
  assertDateFormatOnly(date);
  assertTimeRange(startHour, endHour);

  if (!reason) {
    throw new ApiError(400, "예약 불가 사유를 입력해주세요.");
  }

  return {
    roomName,
    date,
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
    throw new ApiError(400, "반복 차단 시간 ID가 올바르지 않습니다.");
  }

  return blockedSlotId;
}

export function parseDateBlockedSlotId(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "요청 형식이 올바르지 않습니다.");
  }

  const body = payload as Record<string, unknown>;
  const dateBlockedSlotId = parseInteger(body.dateBlockedSlotId);
  if (!Number.isInteger(dateBlockedSlotId) || dateBlockedSlotId <= 0) {
    throw new ApiError(400, "일회성 차단 시간 ID가 올바르지 않습니다.");
  }

  return dateBlockedSlotId;
}

export async function getPublicReservationsByDate(
  date: string,
): Promise<PublicReservation[]> {
  assertDateFormatOnly(date);
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

  let blockedSlots: Array<{
    id: number;
    roomName: string;
    weekday: number;
    startHour: number;
    endHour: number;
    reason: string;
    createdAt: Date;
  }> = [];

  let dateBlockedSlots: Array<{
    id: number;
    roomName: string;
    date: string;
    startHour: number;
    endHour: number;
    reason: string;
    createdAt: Date;
  }> = [];

  try {
    blockedSlots = await prisma.blockedSlot.findMany({
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
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }
  }

  try {
    dateBlockedSlots = await prisma.dateBlockedSlot.findMany({
      where: { date },
      orderBy: [{ roomName: "asc" }, { startHour: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        roomName: true,
        date: true,
        startHour: true,
        endHour: true,
        reason: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }
  }

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

  const mappedDateBlocked: PublicReservation[] = dateBlockedSlots
    .filter((slot): slot is typeof slot & { roomName: RoomName } =>
      isPublicRoomName(slot.roomName),
    )
    .map((slot) => ({
      id: slot.id,
      roomName: slot.roomName,
      date: slot.date,
      startHour: slot.startHour,
      endHour: slot.endHour,
      durationHours: slot.endHour - slot.startHour,
      name: slot.reason,
      createdAt: slot.createdAt,
      isBlocked: true,
      blockedReason: slot.reason,
    }));

  return [...mappedReservations, ...mappedBlocked, ...mappedDateBlocked].sort((a, b) => {
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
    assertDateFormatOnly(date);
  }

  const todayDate = getLocalDateString();
  const where = date
    ? { date }
    : {
        date: { gte: todayDate },
      };

  try {
    const reservations = await prisma.reservation.findMany({
      where,
      orderBy: [{ date: "asc" }, { roomName: "asc" }, { startHour: "asc" }],
      select: {
        id: true,
        studentId: true,
        name: true,
        phoneNumber: true,
        roomName: true,
        date: true,
        startHour: true,
        endHour: true,
        durationHours: true,
        createdAt: true,
      },
    });

    return reservations.map(mapAdminReservation);
  } catch (error) {
    if (!isSchemaMismatchError(error)) {
      throw error;
    }

    const fallbackReservations = await prisma.reservation.findMany({
      where,
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

    return fallbackReservations.map((reservation) =>
      mapAdminReservation({ ...reservation, phoneNumber: "" }),
    );
  }
}

export async function getAdminBlockedSlots(
  weekday?: number,
): Promise<AdminBlockedSlot[]> {
  if (typeof weekday === "number") {
    assertWeekday(weekday);
  }

  try {
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
  } catch (error) {
    if (isSchemaMismatchError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getAdminDateBlockedSlots(
  date?: string,
): Promise<AdminDateBlockedSlot[]> {
  if (date) {
    assertDateFormatOnly(date);
  }

  try {
    const dateBlockedSlots = await prisma.dateBlockedSlot.findMany({
      where: date ? { date } : undefined,
      orderBy: [{ date: "asc" }, { roomName: "asc" }, { startHour: "asc" }],
      select: {
        id: true,
        roomName: true,
        date: true,
        startHour: true,
        endHour: true,
        reason: true,
        createdAt: true,
      },
    });

    return dateBlockedSlots
      .map(mapAdminDateBlockedSlot)
      .filter((slot): slot is AdminDateBlockedSlot => slot !== null);
  } catch (error) {
    if (isSchemaMismatchError(error)) {
      return [];
    }
    throw error;
  }
}

export async function createBlockedSlot(
  input: CreateBlockedSlotInput,
): Promise<AdminBlockedSlot> {
  try {
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
      throw new ApiError(409, "같은 요일과 방의 겹치는 차단 시간이 이미 등록되어 있습니다.");
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
      throw new ApiError(500, "차단 시간 저장 후 방 이름을 확인하지 못했습니다.");
    }

    return mapped;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (isSchemaMismatchError(error)) {
      throw new ApiError(503, migrationRequiredMessage("반복 예약 불가 시간 등록"));
    }
    throw error;
  }
}

export async function deleteBlockedSlot(blockedSlotId: number): Promise<void> {
  try {
    const blockedSlot = await prisma.blockedSlot.findUnique({
      where: { id: blockedSlotId },
      select: { id: true },
    });

    if (!blockedSlot) {
      throw new ApiError(404, "삭제할 반복 차단 시간을 찾을 수 없습니다.");
    }

    await prisma.blockedSlot.delete({
      where: { id: blockedSlotId },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (isSchemaMismatchError(error)) {
      throw new ApiError(503, migrationRequiredMessage("반복 예약 불가 시간 삭제"));
    }
    throw error;
  }
}

export async function createDateBlockedSlot(
  input: CreateDateBlockedSlotInput,
): Promise<AdminDateBlockedSlot> {
  try {
    const overlappedWeekly = await prisma.blockedSlot.findFirst({
      where: {
        roomName: input.roomName,
        weekday: getWeekdayFromDate(input.date),
        startHour: { lt: input.endHour },
        endHour: { gt: input.startHour },
      },
      select: { id: true },
    });

    if (overlappedWeekly) {
      throw new ApiError(409, "같은 시간대의 반복 차단 시간이 이미 등록되어 있습니다.");
    }

    const overlappedDate = await prisma.dateBlockedSlot.findFirst({
      where: {
        roomName: input.roomName,
        date: input.date,
        startHour: { lt: input.endHour },
        endHour: { gt: input.startHour },
      },
      select: { id: true },
    });

    if (overlappedDate) {
      throw new ApiError(409, "같은 날짜와 방의 겹치는 일회성 차단 시간이 이미 등록되어 있습니다.");
    }

    const created = await prisma.dateBlockedSlot.create({
      data: {
        roomName: input.roomName,
        date: input.date,
        startHour: input.startHour,
        endHour: input.endHour,
        reason: input.reason,
      },
      select: {
        id: true,
        roomName: true,
        date: true,
        startHour: true,
        endHour: true,
        reason: true,
        createdAt: true,
      },
    });

    const mapped = mapAdminDateBlockedSlot(created);
    if (!mapped) {
      throw new ApiError(500, "일회성 차단 시간 저장 후 방 이름을 확인하지 못했습니다.");
    }

    return mapped;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (isSchemaMismatchError(error)) {
      throw new ApiError(503, migrationRequiredMessage("일회성 예약 불가 시간 등록"));
    }
    throw error;
  }
}

export async function deleteDateBlockedSlot(dateBlockedSlotId: number): Promise<void> {
  try {
    const slot = await prisma.dateBlockedSlot.findUnique({
      where: { id: dateBlockedSlotId },
      select: { id: true },
    });

    if (!slot) {
      throw new ApiError(404, "삭제할 일회성 차단 시간을 찾을 수 없습니다.");
    }

    await prisma.dateBlockedSlot.delete({
      where: { id: dateBlockedSlotId },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (isSchemaMismatchError(error)) {
      throw new ApiError(503, migrationRequiredMessage("일회성 예약 불가 시간 삭제"));
    }
    throw error;
  }
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<PublicReservation> {
  await assertRegisteredStudent(input.studentId, input.name);

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
      if (isSchemaMismatchError(error)) {
        throw new ApiError(503, migrationRequiredMessage("예약"));
      }
      throw error;
    }
  }

  throw new ApiError(500, "예약 처리 중 일시적인 충돌이 발생했습니다. 다시 시도해주세요.");
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
