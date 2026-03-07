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

function assertDate(value: string): void {
  if (!isValidDateString(value)) {
    throw new ApiError(400, "??됰튋 ?醫롮? ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄. (YYYY-MM-DD)");
  }

  const [year, month, day] = value.split("-").map(Number);
  const selectedDate = new Date(year, month - 1, day);
  const todayString = getLocalDateString();
  const [todayYear, todayMonth, todayDay] = todayString.split("-").map(Number);
  const today = new Date(todayYear, todayMonth - 1, todayDay);
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 14);

  if (selectedDate < today || selectedDate > maxDate) {
    throw new ApiError(400, "??됰튋 ?醫롮?????삳뮎?봔??14????沅∽쭕??醫뤾문??????됰뮸??덈뼄.");
  }
}

function assertDateFormatOnly(value: string): void {
  if (!isValidDateString(value)) {
    throw new ApiError(400, "?덉빟 ?좎쭨 ?뺤떇???щ컮瑜댁? ?딆뒿?덈떎. (YYYY-MM-DD)");
  }
}
function assertRoomName(value: string): asserts value is RoomName {
  if (!isValidRoomName(value)) {
    throw new ApiError(400, "?醫륁뒞??? ??? 獄???已??낅빍??");
  }
}

function assertPin(password: string): void {
  if (!/^\d{4}$/.test(password)) {
    throw new ApiError(400, "??쑬?甕곕뜇???4?癒?봺 ??ъ쁽??鍮???몃빍??");
  }
}

function assertWeekday(weekday: number): void {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new ApiError(400, "?遺우뵬 揶쏅?????而?몴?? ??녿뮸??덈뼄. (0:??깆뒄??~ 6:?醫롮뒄??");
  }
}

function assertTimeRange(startHour: number, endHour: number): void {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    throw new ApiError(400, "??뽰삂/?ル굝利???볦퍢?? ?類?퍟 ??μ맄(?類ㅻ땾)??鍮???몃빍??");
  }
  if (startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24) {
    throw new ApiError(400, "??볦퍢 甕곕뗄???00:00?봔??24:00 ?????鍮???몃빍??");
  }
  if (endHour <= startHour) {
    throw new ApiError(400, "?ル굝利???볦퍢?? ??뽰삂 ??볦퍢癰귣?????堉????몃빍??");
  }
}

function assertNameAndStudent(studentId: string, name: string): void {
  if (!studentId) {
    throw new ApiError(400, "??뉗쓰????낆젾??뤾쉭??");
  }
  if (!name) {
    throw new ApiError(400, "??已????낆젾??뤾쉭??");
  }
}

function assertPhoneNumber(phoneNumber: string): void {
  if (!phoneNumber) {
    throw new ApiError(400, "?怨뺤뵭筌ｌ꼶? ??낆젾??곻폒?紐꾩뒄.");
  }

  const normalized = phoneNumber.replace(/[\s-]/g, "");
  if (!/^\d{8,13}$/.test(normalized)) {
    throw new ApiError(400, "?怨뺤뵭筌??類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
  }
}

function assertRegisteredStudent(studentId: string, name: string): void {
  if (!isAllowedStudentName(studentId, name)) {
    throw new ApiError(400, "?源낆쨯????뉗쓰-??已??類ｋ궖?? ??깊뒄??? ??녿뮸??덈뼄.");
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
        throw new ApiError(409, `??됰튋 ?븍뜃? ??볦퍢??낅빍?? ${blocked.reason}`);
      }

      const dateBlocked = await tx.dateBlockedSlot.findFirst({
        where: {
          roomName: input.roomName,
          date: input.date,
          startHour: { lt: input.endHour },
          endHour: { gt: input.startHour },
        },
        select: { id: true, reason: true },
      });

      if (dateBlocked) {
        throw new ApiError(409, `??됰튋 ?븍뜃? ??볦퍢??낅빍?? ${dateBlocked.reason}`);
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
        throw new ApiError(409, "??? ??됰튋????볦퍢??낅빍??");
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
          "揶쏆늿? ?醫롮??癒?뮉 筌ㅼ뮆? 3??볦퍢繹먮슣?筌???됰튋 揶쎛?館鍮??덈뼄",
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
        throw new ApiError(500, "??됰튋 ?怨쀬뵠?怨쀫퓠 ?醫륁뒞??? ??? 獄???已????됰뮸??덈뼄.");
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
    throw new ApiError(400, "?遺욧퍕 ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
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
  assertRegisteredStudent(studentId, name);
  assertPhoneNumber(phoneNumber);
  assertPin(password);
  assertRoomName(roomName);
  assertDate(date);
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
    throw new ApiError(400, "?遺욧퍕 ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
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
    throw new ApiError(400, "??됰튋 ?븍뜃? ???????낆젾??뤾쉭??");
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
    throw new ApiError(400, "?遺욧퍕 ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
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
    throw new ApiError(400, "??됰튋 ?븍뜃? ???????낆젾??뤾쉭??");
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
    throw new ApiError(400, "?遺욧퍕 ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
  }

  const body = payload as Record<string, unknown>;
  const reservationId = parseInteger(body.reservationId);
  const studentId = parseTrimmedString(body.studentId);
  const name = parseTrimmedString(body.name);
  const password = parseTrimmedString(body.password);

  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    throw new ApiError(400, "??됰튋 ID揶쎛 ??而?몴?? ??녿뮸??덈뼄.");
  }
  assertNameAndStudent(studentId, name);
  assertPin(password);

  return { reservationId, studentId, name, password };
}

export function parseReservationId(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "?遺욧퍕 ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
  }
  const body = payload as Record<string, unknown>;
  const reservationId = parseInteger(body.reservationId);
  if (!Number.isInteger(reservationId) || reservationId <= 0) {
    throw new ApiError(400, "??됰튋 ID揶쎛 ??而?몴?? ??녿뮸??덈뼄.");
  }
  return reservationId;
}

export function parseBlockedSlotId(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "?遺욧퍕 ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
  }

  const body = payload as Record<string, unknown>;
  const blockedSlotId = parseInteger(body.blockedSlotId);
  if (!Number.isInteger(blockedSlotId) || blockedSlotId <= 0) {
    throw new ApiError(400, "筌△뫀??????ID揶쎛 ??而?몴?? ??녿뮸??덈뼄.");
  }

  return blockedSlotId;
}

export function parseDateBlockedSlotId(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    throw new ApiError(400, "?遺욧퍕 ?類ㅻ뻼????而?몴?? ??녿뮸??덈뼄.");
  }

  const body = payload as Record<string, unknown>;
  const dateBlockedSlotId = parseInteger(body.dateBlockedSlotId);
  if (!Number.isInteger(dateBlockedSlotId) || dateBlockedSlotId <= 0) {
    throw new ApiError(400, "筌△뫀??????ID揶쎛 ??而?몴?? ??녿뮸??덈뼄.");
  }

  return dateBlockedSlotId;
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

  const dateBlockedSlots = await prisma.dateBlockedSlot.findMany({
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
    assertDate(date);
  }

  const reservations = await prisma.reservation.findMany({
    where: date ? { date } : undefined,
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

export async function getAdminDateBlockedSlots(
  date?: string,
): Promise<AdminDateBlockedSlot[]> {
  if (date) {
    assertDateFormatOnly(date);
  }

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
    throw new ApiError(409, "??? 筌△뫀?????볦퍢??野껊?臾??덈뼄.");
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
    throw new ApiError(500, "筌△뫀????????밴쉐 ?怨쀬뵠?怨? ??而?몴?? ??녿뮸??덈뼄.");
  }

  return mapped;
}

export async function deleteBlockedSlot(blockedSlotId: number): Promise<void> {
  const blockedSlot = await prisma.blockedSlot.findUnique({
    where: { id: blockedSlotId },
    select: { id: true },
  });

  if (!blockedSlot) {
    throw new ApiError(404, "筌△뫀???????筌≪뼚??????곷뮸??덈뼄.");
  }

  await prisma.blockedSlot.delete({
    where: { id: blockedSlotId },
  });
}

export async function createDateBlockedSlot(
  input: CreateDateBlockedSlotInput,
): Promise<AdminDateBlockedSlot> {
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
    throw new ApiError(409, "??? 筌△뫀?????볦퍢??野껊?臾??덈뼄.");
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
    throw new ApiError(409, "??? 筌△뫀?????볦퍢??野껊?臾??덈뼄.");
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
    throw new ApiError(500, "嶺뚢뼰維????????諛댁뎽 ??⑥щ턄??? ????紐?? ???용????덈펲.");
  }

  return mapped;
}

export async function deleteDateBlockedSlot(dateBlockedSlotId: number): Promise<void> {
  const slot = await prisma.dateBlockedSlot.findUnique({
    where: { id: dateBlockedSlotId },
    select: { id: true },
  });

  if (!slot) {
    throw new ApiError(404, "嶺뚢뼰維???????嶺뚢돦堉??????怨룸????덈펲.");
  }

  await prisma.dateBlockedSlot.delete({
    where: { id: dateBlockedSlotId },
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

  throw new ApiError(500, "??됰튋 筌ｌ꼶??餓???깅뻻?怨몄뵥 ?겸뫖猷??獄쏆꼶???뤿???щ빍?? ??쇰뻻 ??뺣즲??뤾쉭??");
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
    throw new ApiError(404, "??됰튋??筌≪뼚??????곷뮸??덈뼄.");
  }

  if (
    reservation.studentId !== input.studentId ||
    reservation.name !== input.name
  ) {
    throw new ApiError(401, "??뉗쓰 ?癒?뮉 ??已????깊뒄??? ??녿뮸??덈뼄.");
  }

  const passwordMatched = await compare(input.password, reservation.passwordHash);
  if (!passwordMatched) {
    throw new ApiError(401, "??쑬?甕곕뜇?뉐첎? ??깊뒄??? ??녿뮸??덈뼄.");
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
    throw new ApiError(404, "??됰튋??筌≪뼚??????곷뮸??덈뼄.");
  }

  await prisma.reservation.delete({
    where: { id: reservationId },
  });
}
