"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getLocalDateString } from "@/lib/date";
import { ROOM_NAMES, type RoomName } from "@/lib/rooms";

type PublicReservation = {
  id: number;
  roomName: RoomName;
  date: string;
  startHour: number;
  endHour: number;
  durationHours: number;
  name: string;
  createdAt: string;
};

type Notice = {
  kind: "success" | "error";
  text: string;
};

type ReservationForm = {
  studentId: string;
  name: string;
  password: string;
  roomName: RoomName;
  date: string;
  startHour: string;
  endHour: string;
};

const START_HOURS = Array.from({ length: 24 }, (_, index) => index);
const END_HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const ROOM_ORDER = new Map(ROOM_NAMES.map((name, index) => [name, index]));

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function rangeLabel(startHour: number, endHour: number): string {
  return `${hourLabel(startHour)} - ${hourLabel(endHour)}`;
}

function getBlockedHours(
  reservations: PublicReservation[],
  roomName: RoomName,
): Set<number> {
  const blocked = new Set<number>();
  for (const reservation of reservations) {
    if (reservation.roomName !== roomName) {
      continue;
    }
    for (let hour = reservation.startHour; hour < reservation.endHour; hour += 1) {
      blocked.add(hour);
    }
  }
  return blocked;
}

function intersectsBlocked(
  startHour: number,
  endHour: number,
  blockedHours: Set<number>,
): boolean {
  for (let hour = startHour; hour < endHour; hour += 1) {
    if (blockedHours.has(hour)) {
      return true;
    }
  }
  return false;
}

function sortReservations(items: PublicReservation[]): PublicReservation[] {
  return [...items].sort((a, b) => {
    const roomDiff = (ROOM_ORDER.get(a.roomName) ?? 999) - (ROOM_ORDER.get(b.roomName) ?? 999);
    if (roomDiff !== 0) {
      return roomDiff;
    }
    if (a.startHour !== b.startHour) {
      return a.startHour - b.startHour;
    }
    return a.endHour - b.endHour;
  });
}

async function fetchReservationsByDate(
  date: string,
): Promise<{ ok: boolean; message?: string; reservations: PublicReservation[] }> {
  const response = await fetch(`/api/reservations?date=${date}`, { cache: "no-store" });
  const data = (await response.json()) as {
    message?: string;
    reservations?: PublicReservation[];
  };

  if (!response.ok) {
    return {
      ok: false,
      message: data.message ?? "예약 목록을 불러오지 못했습니다.",
      reservations: [],
    };
  }

  return {
    ok: true,
    reservations: data.reservations ?? [],
  };
}

export default function HomePage() {
  const todayDate = useMemo(() => getLocalDateString(), []);

  const [todayReservations, setTodayReservations] = useState<PublicReservation[]>([]);
  const [viewDate, setViewDate] = useState(todayDate);
  const [viewReservations, setViewReservations] = useState<PublicReservation[]>([]);
  const [bookingDateReservations, setBookingDateReservations] = useState<PublicReservation[]>([]);

  const [form, setForm] = useState<ReservationForm>({
    studentId: "",
    name: "",
    password: "",
    roomName: ROOM_NAMES[0],
    date: todayDate,
    startHour: "",
    endHour: "",
  });

  const [selectedForCancel, setSelectedForCancel] = useState<PublicReservation | null>(null);
  const [cancelForm, setCancelForm] = useState({
    studentId: "",
    name: "",
    password: "",
  });

  const [notice, setNotice] = useState<Notice | null>(null);
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingCancel, setLoadingCancel] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const loadToday = async () => {
      const result = await fetchReservationsByDate(todayDate);
      if (!active || !result.ok) {
        return;
      }
      setTodayReservations(sortReservations(result.reservations));
    };

    void loadToday();

    return () => {
      active = false;
    };
  }, [todayDate, refreshKey]);

  useEffect(() => {
    let active = true;

    const loadView = async () => {
      setLoadingSchedule(true);
      const result = await fetchReservationsByDate(viewDate);
      if (!active) {
        return;
      }
      if (!result.ok) {
        setNotice({ kind: "error", text: result.message ?? "예약 현황을 불러오지 못했습니다." });
        setViewReservations([]);
      } else {
        setViewReservations(sortReservations(result.reservations));
      }
      setLoadingSchedule(false);
    };

    void loadView();

    return () => {
      active = false;
    };
  }, [viewDate, refreshKey]);

  useEffect(() => {
    let active = true;

    const loadBookingDate = async () => {
      const result = await fetchReservationsByDate(form.date);
      if (!active) {
        return;
      }
      if (result.ok) {
        setBookingDateReservations(sortReservations(result.reservations));
      }
    };

    void loadBookingDate();

    return () => {
      active = false;
    };
  }, [form.date, refreshKey]);

  const blockedHours = useMemo(
    () => getBlockedHours(bookingDateReservations, form.roomName),
    [bookingDateReservations, form.roomName],
  );

  const hasSelectedStartHour = form.startHour !== "";
  const selectedStartHour = Number(form.startHour);

  const onSubmitReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    const startHour = Number(form.startHour);
    const endHour = Number(form.endHour);

    if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
      setNotice({ kind: "error", text: "시작 시간과 종료 시간을 모두 선택하세요." });
      return;
    }

    if (intersectsBlocked(startHour, endHour, blockedHours)) {
      setNotice({ kind: "error", text: "선택한 시간에 이미 예약이 있습니다." });
      return;
    }

    setLoadingCreate(true);

    const response = await fetch("/api/reservations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentId: form.studentId,
        name: form.name,
        password: form.password,
        roomName: form.roomName,
        date: form.date,
        startHour,
        endHour,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setNotice({
        kind: "error",
        text: data.message ?? "예약 생성에 실패했습니다.",
      });
      setLoadingCreate(false);
      return;
    }

    setNotice({ kind: "success", text: data.message ?? "예약이 완료되었습니다." });
    setForm((previous) => ({
      ...previous,
      password: "",
      startHour: "",
      endHour: "",
    }));
    setRefreshKey((previous) => previous + 1);
    setLoadingCreate(false);
  };

  const onSubmitCancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedForCancel) {
      return;
    }

    setNotice(null);
    setLoadingCancel(true);

    const response = await fetch("/api/reservations/cancel", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reservationId: selectedForCancel.id,
        studentId: cancelForm.studentId,
        name: cancelForm.name,
        password: cancelForm.password,
      }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setNotice({
        kind: "error",
        text: data.message ?? "예약 취소에 실패했습니다.",
      });
      setLoadingCancel(false);
      return;
    }

    setNotice({ kind: "success", text: data.message ?? "예약이 취소되었습니다." });
    setSelectedForCancel(null);
    setCancelForm({ studentId: "", name: "", password: "" });
    setRefreshKey((previous) => previous + 1);
    setLoadingCancel(false);
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h1 className="text-2xl font-bold sm:text-3xl">방 예약 시스템</h1>
      </header>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">오늘 예약 현황 ({todayDate})</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROOM_NAMES.map((roomName) => {
            const reservations = todayReservations.filter(
              (reservation) => reservation.roomName === roomName,
            );
            return (
              <div
                key={roomName}
                className="rounded-xl border border-[var(--border)] bg-white p-3"
              >
                <p className="text-sm font-semibold">{roomName}</p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {reservations.length === 0
                    ? "예약 없음"
                    : reservations
                        .map((reservation) =>
                          `${rangeLabel(reservation.startHour, reservation.endHour)} (${reservation.name})`,
                        )
                        .join(" | ")}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {notice ? (
        <section
          className={`rounded-2xl border-2 px-5 py-4 text-base font-semibold shadow-sm ${
            notice.kind === "success"
              ? "border-emerald-400 bg-emerald-50 text-emerald-800"
              : "border-rose-400 bg-rose-50 text-rose-800"
          }`}
        >
          {notice.text}
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-lg font-semibold">예약 신청</h2>
          <form className="mt-4 grid gap-3" onSubmit={onSubmitReservation}>
            <input
              required
              value={form.studentId}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, studentId: event.target.value }))
              }
              placeholder="학번"
              className="h-11 rounded-lg border border-[var(--border)] px-3"
            />
            <input
              required
              value={form.name}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, name: event.target.value }))
              }
              placeholder="이름"
              className="h-11 rounded-lg border border-[var(--border)] px-3"
            />
            <input
              required
              maxLength={4}
              pattern="\d{4}"
              inputMode="numeric"
              value={form.password}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, password: event.target.value }))
              }
              placeholder="비밀번호 4자리"
              className="h-11 rounded-lg border border-[var(--border)] px-3"
            />
            <select
              value={form.roomName}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  roomName: event.target.value as RoomName,
                  startHour: "",
                  endHour: "",
                }))
              }
              className="h-11 rounded-lg border border-[var(--border)] px-3"
            >
              {ROOM_NAMES.map((roomName) => (
                <option key={roomName} value={roomName}>
                  {roomName}
                </option>
              ))}
            </select>
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) =>
                setForm((previous) => ({
                  ...previous,
                  date: event.target.value,
                  startHour: "",
                  endHour: "",
                }))
              }
              className="h-11 rounded-lg border border-[var(--border)] px-3"
            />

            <div className="grid grid-cols-2 gap-3">
              <select
                required
                value={form.startHour}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    startHour: event.target.value,
                    endHour: "",
                  }))
                }
                className="h-11 rounded-lg border border-[var(--border)] px-3"
              >
                <option value="">시작 시간</option>
                {START_HOURS.map((hour) => (
                  <option key={hour} value={hour} disabled={blockedHours.has(hour)}>
                    {hourLabel(hour)} {blockedHours.has(hour) ? "(예약됨)" : ""}
                  </option>
                ))}
              </select>

              <select
                required
                value={form.endHour}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, endHour: event.target.value }))
                }
                className="h-11 rounded-lg border border-[var(--border)] px-3"
              >
                <option value="">종료 시간</option>
                {END_HOURS.map((hour) => {
                  const isInvalidRange =
                    !hasSelectedStartHour ||
                    hour <= selectedStartHour ||
                    intersectsBlocked(selectedStartHour, hour, blockedHours);

                  return (
                    <option key={hour} value={hour} disabled={isInvalidRange}>
                      {hourLabel(hour)} {isInvalidRange ? "(선택 불가)" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="submit"
              disabled={loadingCreate}
              className="mt-1 h-11 rounded-lg bg-[var(--accent)] font-semibold text-white disabled:opacity-60"
            >
              {loadingCreate ? "저장 중..." : "예약하기"}
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-lg font-semibold">선택한 방/날짜 시간 현황</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {form.roomName} | {form.date}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {START_HOURS.map((hour) => {
              const reserved = blockedHours.has(hour);
              return (
                <span
                  key={hour}
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    reserved
                      ? "bg-rose-100 text-rose-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {hourLabel(hour)}
                </span>
              );
            })}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">예약 목록 조회</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={viewDate}
              onChange={(event) => setViewDate(event.target.value)}
              className="h-10 rounded-lg border border-[var(--border)] px-3"
            />
            <button
              type="button"
              onClick={() => setRefreshKey((previous) => previous + 1)}
              className="h-10 rounded-lg border border-[var(--border)] px-3 text-sm"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-3 py-2">방</th>
                <th className="px-3 py-2">날짜</th>
                <th className="px-3 py-2">시간</th>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">작업</th>
              </tr>
            </thead>
            <tbody>
              {loadingSchedule ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-[var(--muted)]">
                    불러오는 중...
                  </td>
                </tr>
              ) : viewReservations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-[var(--muted)]">
                    예약 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                viewReservations.map((reservation) => (
                  <tr key={reservation.id} className="border-b border-[var(--border)]">
                    <td className="px-3 py-2">{reservation.roomName}</td>
                    <td className="px-3 py-2">{reservation.date}</td>
                    <td className="px-3 py-2">
                      {rangeLabel(reservation.startHour, reservation.endHour)}
                    </td>
                    <td className="px-3 py-2">{reservation.name}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedForCancel(reservation)}
                        className="rounded-md border border-[var(--border)] px-3 py-1"
                      >
                        취소
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedForCancel ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <h3 className="text-base font-semibold text-rose-700">예약 취소 확인</h3>
          <p className="mt-1 text-sm text-rose-700">
            {selectedForCancel.roomName} | {selectedForCancel.date} | {rangeLabel(selectedForCancel.startHour, selectedForCancel.endHour)}
          </p>

          <form className="mt-4 grid gap-3 sm:max-w-md" onSubmit={onSubmitCancel}>
            <input
              required
              value={cancelForm.studentId}
              onChange={(event) =>
                setCancelForm((previous) => ({
                  ...previous,
                  studentId: event.target.value,
                }))
              }
              placeholder="학번"
              className="h-11 rounded-lg border border-rose-200 bg-white px-3"
            />
            <input
              required
              value={cancelForm.name}
              onChange={(event) =>
                setCancelForm((previous) => ({ ...previous, name: event.target.value }))
              }
              placeholder="이름"
              className="h-11 rounded-lg border border-rose-200 bg-white px-3"
            />
            <input
              required
              maxLength={4}
              pattern="\d{4}"
              inputMode="numeric"
              value={cancelForm.password}
              onChange={(event) =>
                setCancelForm((previous) => ({
                  ...previous,
                  password: event.target.value,
                }))
              }
              placeholder="비밀번호 4자리"
              className="h-11 rounded-lg border border-rose-200 bg-white px-3"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loadingCancel}
                className="h-11 rounded-lg bg-rose-600 px-4 font-semibold text-white disabled:opacity-60"
              >
                {loadingCancel ? "취소 처리 중..." : "취소 확정"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedForCancel(null)}
                className="h-11 rounded-lg border border-rose-200 px-4"
              >
                닫기
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <footer className="pt-2 text-center">
        <Link
          href="/admin"
          className="text-sm font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-600"
        >
          관리자 페이지
        </Link>
      </footer>
    </div>
  );
}

