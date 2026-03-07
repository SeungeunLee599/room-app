"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getLocalDateString } from "@/lib/date";
import { ROOM_NAMES, type RoomName } from "@/lib/rooms";

type AdminReservation = {
  id: number;
  studentId: string;
  name: string;
  phoneNumber: string;
  roomName: RoomName;
  date: string;
  startHour: number;
  endHour: number;
  durationHours: number;
  createdAt: string;
};

type AdminBlockedSlot = {
  id: number;
  roomName: RoomName;
  weekday: number;
  startHour: number;
  endHour: number;
  reason: string;
  createdAt: string;
};

type BoardNotice = {
  id: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

type Notice = {
  kind: "success" | "error";
  text: string;
};

type BlockedSlotForm = {
  roomName: RoomName;
  weekday: string;
  startHour: string;
  endHour: string;
  reason: string;
};

type NoticeForm = {
  title: string;
  content: string;
};

const ROOM_ORDER = new Map(ROOM_NAMES.map((name, index) => [name, index]));
const START_HOURS = Array.from({ length: 24 }, (_, index) => index);
const END_HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const WEEKDAY_OPTIONS = [
  { value: 0, label: "일요일" },
  { value: 1, label: "월요일" },
  { value: 2, label: "화요일" },
  { value: 3, label: "수요일" },
  { value: 4, label: "목요일" },
  { value: 5, label: "금요일" },
  { value: 6, label: "토요일" },
];

function weekdayLabel(weekday: number): string {
  return WEEKDAY_OPTIONS.find((item) => item.value === weekday)?.label ?? String(weekday);
}

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

function sortBlockedSlots(items: AdminBlockedSlot[]): AdminBlockedSlot[] {
  return [...items].sort((a, b) => {
    if (a.weekday !== b.weekday) {
      return a.weekday - b.weekday;
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

async function fetchAdminBlockedSlots(password: string): Promise<{
  ok: boolean;
  message?: string;
  blockedSlots: AdminBlockedSlot[];
}> {
  const response = await fetch("/api/admin/blocked-slots", {
    cache: "no-store",
    headers: {
      "x-admin-password": password,
    },
  });

  const data = (await response.json()) as {
    message?: string;
    blockedSlots?: AdminBlockedSlot[];
  };

  if (!response.ok) {
    return {
      ok: false,
      message: data.message ?? "차단 시간 목록을 불러오지 못했습니다.",
      blockedSlots: [],
    };
  }

  return {
    ok: true,
    blockedSlots: data.blockedSlots ?? [],
  };
}

async function fetchAdminNotices(password: string): Promise<{
  ok: boolean;
  message?: string;
  notices: BoardNotice[];
}> {
  const response = await fetch("/api/admin/notices", {
    cache: "no-store",
    headers: {
      "x-admin-password": password,
    },
  });

  const data = (await response.json()) as {
    message?: string;
    notices?: BoardNotice[];
  };

  if (!response.ok) {
    return {
      ok: false,
      message: data.message ?? "공지사항 목록을 불러오지 못했습니다.",
      notices: [],
    };
  }

  return {
    ok: true,
    notices: data.notices ?? [],
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
  const [blockedSlots, setBlockedSlots] = useState<AdminBlockedSlot[]>([]);
  const [boardNotices, setBoardNotices] = useState<BoardNotice[]>([]);

  const [blockedForm, setBlockedForm] = useState<BlockedSlotForm>({
    roomName: ROOM_NAMES[0],
    weekday: "1",
    startHour: "",
    endHour: "",
    reason: "",
  });

  const [noticeForm, setNoticeForm] = useState<NoticeForm>({
    title: "",
    content: "",
  });
  const [editingNoticeId, setEditingNoticeId] = useState<number | null>(null);

  const loadAdminData = async () => {
    if (!authenticated) {
      return;
    }

    setLoading(true);
    setNotice(null);

    const [reservationResult, blockedResult, noticesResult] = await Promise.all([
      fetchAdminReservations({
        password: adminPassword,
        dateFilter: useDateFilter ? dateFilter : undefined,
      }),
      fetchAdminBlockedSlots(adminPassword),
      fetchAdminNotices(adminPassword),
    ]);

    if (!reservationResult.ok || !blockedResult.ok || !noticesResult.ok) {
      setNotice({
        kind: "error",
        text:
          reservationResult.message ??
          blockedResult.message ??
          noticesResult.message ??
          "관리자 데이터를 불러오지 못했습니다.",
      });
      setLoading(false);
      return;
    }

    setReservations(sortReservations(reservationResult.reservations));
    setBlockedSlots(sortBlockedSlots(blockedResult.blockedSlots));
    setBoardNotices(noticesResult.notices);
    setLoading(false);
  };

  useEffect(() => {
    void loadAdminData();
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

    const [reservationResult, blockedResult, noticesResult] = await Promise.all([
      fetchAdminReservations({
        password: adminPassword,
        dateFilter: useDateFilter ? dateFilter : undefined,
      }),
      fetchAdminBlockedSlots(adminPassword),
      fetchAdminNotices(adminPassword),
    ]);

    if (!reservationResult.ok || !blockedResult.ok || !noticesResult.ok) {
      setNotice({ kind: "error", text: "관리자 인증에 실패했습니다." });
      setAuthenticated(false);
      setLoading(false);
      return;
    }

    setAuthenticated(true);
    setReservations(sortReservations(reservationResult.reservations));
    setBlockedSlots(sortBlockedSlots(blockedResult.blockedSlots));
    setBoardNotices(noticesResult.notices);
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

  const onSubmitBlockedSlot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authenticated) {
      return;
    }

    const startHour = Number(blockedForm.startHour);
    const endHour = Number(blockedForm.endHour);
    const weekday = Number(blockedForm.weekday);
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
      setNotice({ kind: "error", text: "차단 시작/종료 시간을 선택하세요." });
      return;
    }

    setLoading(true);
    setNotice(null);

    const response = await fetch("/api/admin/blocked-slots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        adminPassword,
        roomName: blockedForm.roomName,
        weekday,
        startHour,
        endHour,
        reason: blockedForm.reason,
      }),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setNotice({ kind: "error", text: data.message ?? "차단 시간 등록에 실패했습니다." });
      setLoading(false);
      return;
    }

    setNotice({ kind: "success", text: data.message ?? "차단 시간이 등록되었습니다." });
    setBlockedForm((previous) => ({
      ...previous,
      startHour: "",
      endHour: "",
      reason: "",
    }));
    setRefreshKey((previous) => previous + 1);
    setLoading(false);
  };

  const onDeleteBlockedSlot = async (blockedSlotId: number) => {
    if (!authenticated) {
      return;
    }

    setLoading(true);
    setNotice(null);

    const response = await fetch("/api/admin/blocked-slots", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blockedSlotId, adminPassword }),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setNotice({ kind: "error", text: data.message ?? "차단 시간 삭제에 실패했습니다." });
      setLoading(false);
      return;
    }

    setNotice({ kind: "success", text: data.message ?? "차단 시간이 삭제되었습니다." });
    setRefreshKey((previous) => previous + 1);
    setLoading(false);
  };

  const onSubmitBoardNotice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authenticated) {
      return;
    }

    setLoading(true);
    setNotice(null);

    const method = editingNoticeId ? "PATCH" : "POST";
    const payload = editingNoticeId
      ? { adminPassword, noticeId: editingNoticeId, ...noticeForm }
      : { adminPassword, ...noticeForm };

    const response = await fetch("/api/admin/notices", {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setNotice({ kind: "error", text: data.message ?? "공지사항 저장에 실패했습니다." });
      setLoading(false);
      return;
    }

    setNotice({ kind: "success", text: data.message ?? "공지사항이 저장되었습니다." });
    setEditingNoticeId(null);
    setNoticeForm({ title: "", content: "" });
    setRefreshKey((previous) => previous + 1);
    setLoading(false);
  };

  const onEditBoardNotice = (item: BoardNotice) => {
    setEditingNoticeId(item.id);
    setNoticeForm({ title: item.title, content: item.content });
  };

  const onDeleteBoardNotice = async (noticeId: number) => {
    if (!authenticated) {
      return;
    }

    setLoading(true);
    setNotice(null);

    const response = await fetch("/api/admin/notices", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ noticeId, adminPassword }),
    });

    const data = (await response.json()) as { message?: string };
    if (!response.ok) {
      setNotice({ kind: "error", text: data.message ?? "공지사항 삭제에 실패했습니다." });
      setLoading(false);
      return;
    }

    setNotice({ kind: "success", text: data.message ?? "공지사항이 삭제되었습니다." });
    if (editingNoticeId === noticeId) {
      setEditingNoticeId(null);
      setNoticeForm({ title: "", content: "" });
    }
    setRefreshKey((previous) => previous + 1);
    setLoading(false);
  };

  const todayReservationsCount = reservations.filter((item) => item.date === todayDate).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="rounded-3xl border border-[var(--border-strong)] bg-[var(--card)] p-6 shadow-[0_20px_50px_rgba(42,79,138,0.12)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex w-fit items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold tracking-wide text-[var(--accent)]">
              ADMIN DASHBOARD
            </p>
            <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">
              원광대학교 의과대학 CPX/OSCE Room 관리자
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)] sm:text-base">
              예약 조회/취소, 예약 불가 시간, 공지사항 관리
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
        <div className="mt-5">
          <Link href="/" className="text-sm font-semibold text-slate-700 underline">
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
        <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">관리자 인증</h2>
          <form className="mt-4 grid gap-3" onSubmit={onSubmitAuth}>
            <input
              type="password"
              required
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder="관리자 비밀번호"
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3"
            />
            <button type="submit" disabled={loading} className="h-11 rounded-xl bg-[var(--accent)] font-semibold text-white">
              {loading ? "확인 중..." : authenticated ? "재인증" : "로그인"}
            </button>
          </form>
        </article>

        <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">조회 필터</h2>
          <div className="mt-4 flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={useDateFilter} onChange={(event) => setUseDateFilter(event.target.checked)} />
              날짜 필터
            </label>
            <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} disabled={!useDateFilter} className="h-10 rounded-xl border border-[var(--border)] bg-white px-3 text-sm" />
            <button type="button" onClick={() => setRefreshKey((previous) => previous + 1)} className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm">
              새로고침
            </button>
          </div>
        </article>
      </section>

      {authenticated ? (
        <>
          <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">예약 불가 시간 등록</h2>
              <form className="mt-4 grid gap-3" onSubmit={onSubmitBlockedSlot}>
                <select value={blockedForm.roomName} onChange={(event) => setBlockedForm((previous) => ({ ...previous, roomName: event.target.value as RoomName }))} className="h-11 rounded-xl border border-[var(--border)] bg-white px-3">
                  {ROOM_NAMES.map((roomName) => (
                    <option key={roomName} value={roomName}>{roomName}</option>
                  ))}
                </select>
                <div className="grid grid-cols-3 gap-2">
                  <select value={blockedForm.weekday} onChange={(event) => setBlockedForm((previous) => ({ ...previous, weekday: event.target.value }))} className="h-11 rounded-xl border border-[var(--border)] bg-white px-3">
                    {WEEKDAY_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                  <select value={blockedForm.startHour} onChange={(event) => setBlockedForm((previous) => ({ ...previous, startHour: event.target.value, endHour: "" }))} className="h-11 rounded-xl border border-[var(--border)] bg-white px-3" required>
                    <option value="">시작</option>
                    {START_HOURS.map((hour) => (
                      <option key={hour} value={hour}>{hourLabel(hour)}</option>
                    ))}
                  </select>
                  <select value={blockedForm.endHour} onChange={(event) => setBlockedForm((previous) => ({ ...previous, endHour: event.target.value }))} className="h-11 rounded-xl border border-[var(--border)] bg-white px-3" required>
                    <option value="">종료</option>
                    {END_HOURS.map((hour) => {
                      const startHour = Number(blockedForm.startHour);
                      const invalid = !Number.isInteger(startHour) || hour <= startHour;
                      return <option key={hour} value={hour} disabled={invalid}>{hourLabel(hour)}</option>;
                    })}
                  </select>
                </div>
                <input required value={blockedForm.reason} onChange={(event) => setBlockedForm((previous) => ({ ...previous, reason: event.target.value }))} placeholder="예약 불가 사유" className="h-11 rounded-xl border border-[var(--border)] bg-white px-3" />
                <button type="submit" disabled={loading} className="h-11 rounded-xl bg-amber-500 font-semibold text-white">차단 시간 등록</button>
              </form>
            </article>

            <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">차단 시간 목록</h2>
              <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-[var(--card-soft)] text-slate-700">
                    <tr className="border-b border-[var(--border)] text-left">
                      <th className="px-3 py-3 font-semibold">요일</th>
                      <th className="px-3 py-3 font-semibold">방</th>
                      <th className="px-3 py-3 font-semibold">시간</th>
                      <th className="px-3 py-3 font-semibold">사유</th>
                      <th className="px-3 py-3 font-semibold">작업</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {blockedSlots.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-[var(--muted)]">등록된 차단 시간이 없습니다.</td></tr>
                    ) : (
                      blockedSlots.map((slot) => (
                        <tr key={slot.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="px-3 py-3">{weekdayLabel(slot.weekday)}</td>
                          <td className="px-3 py-3">{slot.roomName}</td>
                          <td className="px-3 py-3">{rangeLabel(slot.startHour, slot.endHour)}</td>
                          <td className="px-3 py-3">{slot.reason}</td>
                          <td className="px-3 py-3"><button type="button" onClick={() => onDeleteBlockedSlot(slot.id)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700">삭제</button></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
            <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">공지사항 작성</h2>
              <form className="mt-4 grid gap-3" onSubmit={onSubmitBoardNotice}>
                <input required value={noticeForm.title} onChange={(event) => setNoticeForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="공지사항 제목" className="h-11 rounded-xl border border-[var(--border)] bg-white px-3" />
                <textarea required rows={5} value={noticeForm.content} onChange={(event) => setNoticeForm((previous) => ({ ...previous, content: event.target.value }))} placeholder="공지사항 내용" className="rounded-xl border border-[var(--border)] bg-white px-3 py-2" />
                <div className="flex gap-2">
                  <button type="submit" disabled={loading} className="h-11 rounded-xl bg-[var(--accent)] px-4 font-semibold text-white">
                    {editingNoticeId ? "공지 수정" : "공지 등록"}
                  </button>
                  {editingNoticeId ? (
                    <button type="button" onClick={() => { setEditingNoticeId(null); setNoticeForm({ title: "", content: "" }); }} className="h-11 rounded-xl border border-[var(--border)] px-4 text-sm">취소</button>
                  ) : null}
                </div>
              </form>
            </article>

            <article className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">공지사항 목록</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {boardNotices.length === 0 ? (
                  <p className="col-span-full rounded-xl border border-dashed border-[var(--border)] bg-[var(--card-soft)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                    등록된 공지사항이 없습니다.
                  </p>
                ) : (
                  boardNotices.map((item, index) => (
                    <article key={item.id} className={`rounded-xl border border-amber-200 bg-[#fff4b8] p-3 shadow-[0_8px_16px_rgba(214,171,70,0.2)] ${index % 2 === 0 ? "rotate-[-0.8deg]" : "rotate-[0.8deg]"}`}>
                      <h3 className="text-sm font-bold text-amber-900">{item.title}</h3>
                      <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-amber-900/90">{item.content}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <button type="button" onClick={() => onEditBoardNotice(item)} className="rounded-md border border-sky-200 px-2 py-1 text-xs text-sky-700">수정</button>
                        <button type="button" onClick={() => onDeleteBoardNotice(item.id)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700">삭제</button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">전체 예약 목록</h2>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--border)]">
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
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-[var(--muted)]">불러오는 중...</td></tr>
                  ) : reservations.length === 0 ? (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-[var(--muted)]">예약 내역이 없습니다.</td></tr>
                  ) : (
                    reservations.map((reservation) => (
                      <tr key={reservation.id} className="border-b border-[var(--border)] last:border-b-0">
                        <td className="px-3 py-3">{reservation.id}</td>
                        <td className="px-3 py-3">{reservation.studentId}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-900">{reservation.name}</div>
                          <div className="text-xs text-slate-600">{reservation.phoneNumber}</div>
                        </td>
                        <td className="px-3 py-3">{reservation.roomName}</td>
                        <td className="px-3 py-3">{reservation.date}</td>
                        <td className="px-3 py-3">{rangeLabel(reservation.startHour, reservation.endHour)}</td>
                        <td className="px-3 py-3">{reservation.durationHours}시간</td>
                        <td className="px-3 py-3">{new Date(reservation.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-3"><button type="button" onClick={() => onCancelAsAdmin(reservation.id)} className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700">취소</button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-5 py-6 text-center text-sm text-[var(--muted)]">
          관리자 인증 후 관리 기능이 표시됩니다.
        </section>
      )}
    </main>
  );
}
