"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getLocalDateString } from "@/lib/date";
import { ROOM_NAMES, type RoomName } from "@/lib/rooms";

type AdminReservation = {
  id: number;
  studentId: string;
  name: string;
  roomName: RoomName;
  date: string;
  startHour: number;
  endHour: number;
  durationHours: number;
  createdAt: string;
};

type Notice = {
  kind: "success" | "error";
  text: string;
};

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

function sortReservations(items: AdminReservation[]): AdminReservation[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    const roomDiff = (ROOM_ORDER.get(a.roomName) ?? 999) - (ROOM_ORDER.get(b.roomName) ?? 999);
    if (roomDiff !== 0) {
      return roomDiff;
    }
    return a.startHour - b.startHour;
  });
}

async function fetchAdminReservations(args: {
  password: string;
  dateFilter?: string;
}): Promise<{ ok: boolean; message?: string; reservations: AdminReservation[] }> {
  const query = args.dateFilter ? `?date=${args.dateFilter}` : "";
  const response = await fetch(`/api/admin/reservations${query}`, {
    cache: "no-store",
    headers: {
      "x-admin-password": args.password,
    },
  });

  const data = (await response.json()) as {
    message?: string;
    reservations?: AdminReservation[];
  };

  if (!response.ok) {
    return {
      ok: false,
      message: data.message ?? "관리자 예약 목록을 불러오지 못했습니다.",
      reservations: [],
    };
  }

  return {
    ok: true,
    reservations: data.reservations ?? [],
  };
}

export default function AdminPage() {
  const todayDate = useMemo(() => getLocalDateString(), []);

  const [adminPassword, setAdminPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [useDateFilter, setUseDateFilter] = useState(false);
  const [dateFilter, setDateFilter] = useState(todayDate);
  const [refreshKey, setRefreshKey] = useState(0);

  const [reservations, setReservations] = useState<AdminReservation[]>([]);

  const loadReservations = async () => {
    if (!authenticated) {
      return;
    }

    setLoading(true);
    setNotice(null);

    const result = await fetchAdminReservations({
      password: adminPassword,
      dateFilter: useDateFilter ? dateFilter : undefined,
    });

    if (!result.ok) {
      setNotice({ kind: "error", text: result.message ?? "예약 목록을 불러오지 못했습니다." });
      setReservations([]);
      setLoading(false);
      return;
    }

    setReservations(sortReservations(result.reservations));
    setLoading(false);
  };

  useEffect(() => {
    void loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated, useDateFilter, dateFilter, refreshKey]);

  const onSubmitAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!adminPassword.trim()) {
      setNotice({ kind: "error", text: "관리자 비밀번호를 입력하세요." });
      return;
    }

    setLoading(true);
    setNotice(null);

    const result = await fetchAdminReservations({
      password: adminPassword,
      dateFilter: useDateFilter ? dateFilter : undefined,
    });

    if (!result.ok) {
      setNotice({ kind: "error", text: result.message ?? "관리자 인증에 실패했습니다." });
      setAuthenticated(false);
      setReservations([]);
      setLoading(false);
      return;
    }

    setAuthenticated(true);
    setReservations(sortReservations(result.reservations));
    setNotice({ kind: "success", text: "관리자 인증이 완료되었습니다." });
    setLoading(false);
  };

  const onCancelAsAdmin = async (reservationId: number) => {
    if (!authenticated) {
      return;
    }

    setLoading(true);
    setNotice(null);

    const response = await fetch("/api/admin/reservations", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reservationId, adminPassword }),
    });

    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setNotice({ kind: "error", text: data.message ?? "예약 취소에 실패했습니다." });
      setLoading(false);
      return;
    }

    setNotice({ kind: "success", text: data.message ?? "예약이 취소되었습니다." });
    setRefreshKey((previous) => previous + 1);
    setLoading(false);
  };

  const todayReservationsCount = reservations.filter((item) => item.date === todayDate).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--border-strong)] bg-[var(--card)] p-6 shadow-[0_20px_50px_rgba(42,79,138,0.12)] sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,_#d7e7ff_0%,_rgba(215,231,255,0)_70%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex w-fit items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--accent)]">
              ADMIN DASHBOARD
            </p>
            <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">
              원광대학교 의과대학 CPX/OXCE Room 관리자
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
              학번 포함 전체 예약 조회 및 관리자 취소를 수행합니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:w-fit">
            <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] px-4 py-3">
              <p className="text-xs text-[var(--muted)]">오늘 날짜</p>
              <p className="mt-1 text-base font-bold text-slate-900">{formatDateLabel(todayDate)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-soft)] px-4 py-3">
              <p className="text-xs text-[var(--muted)]">오늘 예약 수</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{todayReservationsCount}</p>
            </article>
          </div>
        </div>

        <div className="relative mt-5">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            메인으로 이동
          </Link>
        </div>
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

      <section className="grid gap-6 lg:grid-cols-[1fr_1.25fr]">
        <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_30px_rgba(54,86,125,0.08)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">관리자 인증</h2>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              SECURE
            </span>
          </div>

          <form className="grid gap-3" onSubmit={onSubmitAuth}>
            <input
              type="password"
              required
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="관리자 비밀번호"
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
            />
            <button
              type="submit"
              disabled={loading}
              className="h-11 rounded-xl bg-[var(--accent)] font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {loading ? "확인 중..." : authenticated ? "재인증" : "로그인"}
            </button>
          </form>

          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--card-soft)] px-3 py-2 text-xs text-[var(--muted)]">
            인증 후 전체 예약 목록과 취소 기능이 활성화됩니다.
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_30px_rgba(54,86,125,0.08)] sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">조회 필터</h2>
            <button
              type="button"
              onClick={() => setRefreshKey((previous) => previous + 1)}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-slate-700"
            >
              새로고침
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={useDateFilter}
                onChange={(event) => setUseDateFilter(event.target.checked)}
              />
              날짜 필터 사용
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              disabled={!useDateFilter}
              className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm disabled:opacity-60"
            />
          </div>
        </article>
      </section>

      {authenticated ? (
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_8px_30px_rgba(54,86,125,0.08)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">전체 예약 목록</h2>
            <span className="text-sm text-[var(--muted)]">총 {reservations.length}건</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[var(--card-soft)] text-slate-700">
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-3 py-3 font-semibold">ID</th>
                  <th className="px-3 py-3 font-semibold">학번</th>
                  <th className="px-3 py-3 font-semibold">이름</th>
                  <th className="px-3 py-3 font-semibold">방</th>
                  <th className="px-3 py-3 font-semibold">날짜</th>
                  <th className="px-3 py-3 font-semibold">시간</th>
                  <th className="px-3 py-3 font-semibold">예약 시간</th>
                  <th className="px-3 py-3 font-semibold">생성 시각</th>
                  <th className="px-3 py-3 font-semibold">작업</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-[var(--muted)]">
                      불러오는 중...
                    </td>
                  </tr>
                ) : reservations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-[var(--muted)]">
                      예약 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  reservations.map((reservation) => (
                    <tr key={reservation.id} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="px-3 py-3 text-slate-700">{reservation.id}</td>
                      <td className="px-3 py-3 text-slate-700">{reservation.studentId}</td>
                      <td className="px-3 py-3 text-slate-700">{reservation.name}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
                          {reservation.roomName}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{reservation.date}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {rangeLabel(reservation.startHour, reservation.endHour)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{reservation.durationHours}시간</td>
                      <td className="px-3 py-3 text-slate-700">
                        {new Date(reservation.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onCancelAsAdmin(reservation.id)}
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
      ) : (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-6 text-center text-sm text-[var(--muted)]">
          관리자 인증 후 예약 목록이 표시됩니다.
        </section>
      )}
    </main>
  );
}