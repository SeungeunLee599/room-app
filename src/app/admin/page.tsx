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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">관리자 예약 관리</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">학번 포함 전체 예약 내역 조회/취소</p>
        </div>
        <Link
          href="/"
          className="inline-flex w-fit items-center justify-center rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold"
        >
          메인으로
        </Link>
      </header>

      {notice ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-rose-300 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-lg font-semibold">관리자 인증</h2>
        <form className="mt-4 grid gap-3 sm:max-w-md" onSubmit={onSubmitAuth}>
          <input
            type="password"
            required
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            placeholder="관리자 비밀번호"
            className="h-11 rounded-lg border border-[var(--border)] px-3"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-lg bg-[var(--accent)] font-semibold text-white disabled:opacity-60"
          >
            {loading ? "확인 중..." : "로그인"}
          </button>
        </form>
      </section>

      {authenticated ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">전체 예약 목록</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm">
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
                className="h-10 rounded-lg border border-[var(--border)] px-3 disabled:opacity-60"
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
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">학번</th>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">방</th>
                  <th className="px-3 py-2">날짜</th>
                  <th className="px-3 py-2">시간</th>
                  <th className="px-3 py-2">예약 시간</th>
                  <th className="px-3 py-2">생성 시각</th>
                  <th className="px-3 py-2">작업</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-[var(--muted)]">
                      불러오는 중...
                    </td>
                  </tr>
                ) : reservations.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-4 text-center text-[var(--muted)]">
                      예약 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  reservations.map((reservation) => (
                    <tr key={reservation.id} className="border-b border-[var(--border)]">
                      <td className="px-3 py-2">{reservation.id}</td>
                      <td className="px-3 py-2">{reservation.studentId}</td>
                      <td className="px-3 py-2">{reservation.name}</td>
                      <td className="px-3 py-2">{reservation.roomName}</td>
                      <td className="px-3 py-2">{reservation.date}</td>
                      <td className="px-3 py-2">
                        {rangeLabel(reservation.startHour, reservation.endHour)}
                      </td>
                      <td className="px-3 py-2">{reservation.durationHours}시간</td>
                      <td className="px-3 py-2">
                        {new Date(reservation.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onCancelAsAdmin(reservation.id)}
                          className="rounded-md border border-rose-300 px-3 py-1 text-rose-600"
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
      ) : null}
    </div>
  );
}

