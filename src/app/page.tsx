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

function formatDateLabel(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) {
    return date;
  }

  return value.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
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
  const maxBookingDate = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return getLocalDateString(date);
  }, []);

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

  const todayCount = todayReservations.length;
  const availableRoomsCount = ROOM_NAMES.filter(
    (room) => todayReservations.every((reservation) => reservation.roomName !== room),
  ).length;

  const onSubmitReservation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);

    if (form.date < todayDate || form.date > maxBookingDate) {
      setNotice({ kind: "error", text: "예약 날짜는 오늘부터 14일 이내만 선택할 수 있습니다." });
      return;
    }

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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-[#d6e0f0] bg-[linear-gradient(135deg,#f7fbff_0%,#e7f0ff_38%,#dde8ff_65%,#f2f7ff_100%)] p-6 shadow-[0_28px_60px_rgba(42,79,138,0.18)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(56,115,255,0.34)_0%,_rgba(56,115,255,0)_68%)]" />
        <div className="pointer-events-none absolute -left-20 top-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,_rgba(80,180,255,0.18)_0%,_rgba(80,180,255,0)_70%)]" />
        <div className="pointer-events-none absolute right-24 top-10 h-40 w-64 rotate-[-12deg] rounded-3xl border border-white/60 bg-white/35 shadow-[0_20px_30px_rgba(66,112,192,0.18)] backdrop-blur-sm" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-4">
            <p className="inline-flex w-fit items-center rounded-full border border-[#aec6f2] bg-white/80 px-4 py-1.5 text-sm font-extrabold tracking-wide text-[#204585] shadow-sm">
              원광대학교 의과대학
            </p>
            <h1 className="text-3xl font-black leading-tight tracking-tight text-[#0f2242] sm:text-4xl">
              CPX/OXCE Room 예약 시스템
            </h1>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:min-w-[360px]">
            <article className="flex min-h-[108px] flex-col justify-center rounded-2xl border border-white/70 bg-white/80 px-5 py-4 shadow-[0_12px_26px_rgba(52,95,168,0.14)] backdrop-blur-sm">
              <p className="text-sm font-semibold text-[#4b628b]">오늘 예약</p>
              <p className="mt-2 text-3xl font-black text-[#0f2242]">{todayCount}</p>
            </article>
            <article className="flex min-h-[108px] flex-col justify-center rounded-2xl border border-white/70 bg-white/80 px-5 py-4 shadow-[0_12px_26px_rgba(52,95,168,0.14)] backdrop-blur-sm">
              <p className="text-sm font-semibold text-[#4b628b]">즉시 가능 ROOM</p>
              <p className="mt-2 text-3xl font-black text-[#0f2242]">{availableRoomsCount}</p>
            </article>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1 text-[#51688e] shadow-sm">
            Today {formatDateLabel(todayDate)}
          </span>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_30px_rgba(54,86,125,0.08)] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">예약 목록</h2>
          <span className="text-sm text-[var(--muted)]">{formatDateLabel(todayDate)}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ROOM_NAMES.map((roomName) => {
            const reservations = todayReservations.filter(
              (reservation) => reservation.roomName === roomName,
            );

            return (
              <article
                key={roomName}
                className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">{roomName}</h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      reservations.length === 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {reservations.length === 0 ? "AVAILABLE" : `${reservations.length}건`}
                  </span>
                </div>

                {reservations.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">예약 없음</p>
                ) : (
                  <ul className="space-y-2 text-sm text-slate-700">
                    {reservations.map((reservation) => (
                      <li key={reservation.id} className="rounded-lg bg-white px-3 py-2">
                        <p className="font-semibold">
                          {rangeLabel(reservation.startHour, reservation.endHour)}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{reservation.name}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_1fr]">
        <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_30px_rgba(54,86,125,0.08)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">예약 신청</h2>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              NEW BOOKING
            </span>
          </div>

          <form className="grid gap-3" onSubmit={onSubmitReservation}>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                value={form.studentId}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, studentId: event.target.value }))
                }
                placeholder="학번"
                className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
              />
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, name: event.target.value }))
                }
                placeholder="이름"
                className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
              />
            </div>

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
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
            />

            <div className="grid gap-3 sm:grid-cols-2">
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
                className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
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
                min={todayDate}
                max={maxBookingDate}
                value={form.date}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    date: event.target.value,
                    startHour: "",
                    endHour: "",
                  }))
                }
                className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
              />
            </div>

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
                className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
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
                className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
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
              className="mt-1 h-11 rounded-xl bg-[var(--accent)] font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {loadingCreate ? "저장 중..." : "예약하기"}
            </button>
          </form>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_30px_rgba(54,86,125,0.08)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">시간 현황</h2>
            <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted)]">
              {form.roomName}
            </span>
          </div>

          <p className="mb-4 text-sm text-[var(--muted)]">{formatDateLabel(form.date)}</p>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {START_HOURS.map((hour) => {
              const reserved = blockedHours.has(hour);
              return (
                <span
                  key={hour}
                  className={`rounded-lg border px-2 py-2 text-center text-xs font-semibold ${
                    reserved
                      ? "border-rose-200 bg-rose-50 text-rose-600"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {hourLabel(hour)}
                </span>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            예약 가능 {24 - blockedHours.size}시간
          </div>
        </article>
      </section>

      {notice ? (
        <section
          className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
            notice.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.text}
        </section>
      ) : null}

      <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_30px_rgba(54,86,125,0.08)] sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">예약 목록 조회</h2>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={viewDate}
              onChange={(event) => setViewDate(event.target.value)}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
            />
            <button
              type="button"
              onClick={() => setRefreshKey((previous) => previous + 1)}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-slate-700"
            >
              새로고침
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-[var(--card-soft)] text-slate-700">
              <tr className="border-b border-[var(--border)] text-left">
                <th className="px-4 py-3 font-semibold">방</th>
                <th className="px-4 py-3 font-semibold">날짜</th>
                <th className="px-4 py-3 font-semibold">시간</th>
                <th className="px-4 py-3 font-semibold">이름</th>
                <th className="px-4 py-3 font-semibold">작업</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {loadingSchedule ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted)]">
                    불러오는 중...
                  </td>
                </tr>
              ) : viewReservations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--muted)]">
                    예약 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                viewReservations.map((reservation) => (
                  <tr key={reservation.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                        {reservation.roomName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{reservation.date}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {rangeLabel(reservation.startHour, reservation.endHour)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{reservation.name}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedForCancel(reservation)}
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
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

      <footer className="flex justify-end pt-1">
        <Link
          href="/admin"
          className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
        >
          관리자 페이지
        </Link>
      </footer>
    </main>
  );
}