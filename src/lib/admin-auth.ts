import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/reservation-service";

const ADMIN_SESSION_COOKIE = "room_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

function getAdminPassword(): string {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new ApiError(500, "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  }

  return adminPassword;
}

function securelyMatches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signSessionPayload(payload: string): string {
  return createHmac("sha256", getAdminPassword())
    .update(`admin-session:${payload}`)
    .digest("base64url");
}

function createAdminSessionToken(): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
  const nonce = randomBytes(24).toString("base64url");
  const payload = `${expiresAt}.${nonce}`;

  return `${payload}.${signSessionPayload(payload)}`;
}

function hasValidAdminSession(request: NextRequest): boolean {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) {
    return false;
  }

  const [expiresAtValue, nonce, signature, extraPart] = token.split(".");
  if (!expiresAtValue || !nonce || !signature || extraPart) {
    return false;
  }

  const expiresAt = Number(expiresAtValue);
  if (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expectedSignature = signSessionPayload(`${expiresAtValue}.${nonce}`);
  return securelyMatches(signature, expectedSignature);
}

export function assertAdminPassword(password: string): void {
  if (!securelyMatches(password, getAdminPassword())) {
    throw new ApiError(401, "관리자 인증에 실패했습니다.");
  }
}

export function assertAdminRequest(request: NextRequest, legacyPassword?: string): void {
  if (hasValidAdminSession(request)) {
    return;
  }

  // Keep already-open older admin pages working until their JavaScript bundle refreshes.
  if (legacyPassword) {
    assertAdminPassword(legacyPassword);
    return;
  }

  throw new ApiError(401, "관리자 인증에 실패했습니다.");
}

export function attachAdminSession(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  });

  return response;
}

export function clearAdminSession(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/admin",
    maxAge: 0,
  });

  return response;
}

export function isAdminSessionValid(request: NextRequest): boolean {
  return hasValidAdminSession(request);
}
