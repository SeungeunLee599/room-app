const SEOUL_TIME_ZONE = "Asia/Seoul";

function formatDatePartsInSeoul(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("한국시간 날짜를 계산하지 못했습니다.");
  }

  return { year, month, day };
}

export function getLocalDateString(date: Date = new Date()): string {
  const { year, month, day } = formatDatePartsInSeoul(date);
  return `${year}-${month}-${day}`;
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
