import { ApiError } from "@/lib/reservation-service";

export function assertAdminPassword(password: string): void {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new ApiError(500, "ADMIN_PASSWORD 환경변수가 설정되지 않았습니다.");
  }
  if (password !== adminPassword) {
    throw new ApiError(401, "관리자 인증에 실패했습니다.");
  }
}
