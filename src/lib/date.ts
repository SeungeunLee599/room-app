const SEOUL_TIME_ZONE = "Asia/Seoul";
const BOOKING_OPEN_HOUR = 22;
const BASE_BOOKING_DAYS_AHEAD = 14;

type SeoulDateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
  second: number;
};

function formatDateTimePartsInSeoul(date: Date): SeoulDateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  const second = Number(parts.find((part) => part.type === "second")?.value);

  if (
    !year ||
    !month ||
    !day ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  ) {
    throw new Error("한국시간 날짜와 시간을 계산하지 못했습니다.");
  }

  return { year, month, day, hour, minute, second };
}

export function getLocalDateString(date: Date = new Date()): string {
  const { year, month, day } = formatDateTimePartsInSeoul(date);
  return `${year}-${month}-${day}`;
}

export function getMaxBookingDateString(date: Date = new Date()): string {
  const { year, month, day, hour } = formatDateTimePartsInSeoul(date);
  const today = `${year}-${month}-${day}`;
  const daysAhead = BASE_BOOKING_DAYS_AHEAD + (hour >= BOOKING_OPEN_HOUR ? 1 : 0);
  return addDaysToDateString(today, daysAhead);
}

export function getBookingWindow(date: Date = new Date()): {
  todayDate: string;
  maxBookingDate: string;
  refreshAfterMs: number;
} {
  return {
    todayDate: getLocalDateString(date),
    maxBookingDate: getMaxBookingDateString(date),
    refreshAfterMs: getMillisecondsUntilBookingWindowChange(date),
  };
}

export function getBookingOpenDateString(reservationDate: string): string {
  return addDaysToDateString(reservationDate, -(BASE_BOOKING_DAYS_AHEAD + 1));
}

export function formatKoreanDateString(dateString: string): string {
  if (!isValidDateString(dateString)) {
    return dateString;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

export function getMillisecondsUntilBookingWindowChange(date: Date = new Date()): number {
  const { hour, minute, second } = formatDateTimePartsInSeoul(date);
  const currentSeconds = hour * 60 * 60 + minute * 60 + second;
  const nextBoundarySeconds = hour < BOOKING_OPEN_HOUR ? BOOKING_OPEN_HOUR * 60 * 60 : 24 * 60 * 60;
  return (nextBoundarySeconds - currentSeconds) * 1000 - date.getMilliseconds() + 50;
}

export function addDaysToDateString(dateString: string, days: number): string {
  if (!isValidDateString(dateString)) {
    throw new Error(`유효하지 않은 날짜입니다: ${dateString}`);
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);

  const utcYear = utcDate.getUTCFullYear();
  const utcMonth = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const utcDay = String(utcDate.getUTCDate()).padStart(2, "0");

  return `${utcYear}-${utcMonth}-${utcDay}`;
}

export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
