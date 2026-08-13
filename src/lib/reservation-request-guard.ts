import { createHash } from "node:crypto";
import { checkBotId } from "botid/server";
import { checkRateLimit } from "@vercel/firewall";

const RESERVATION_RATE_LIMIT_ID = "reservation-create";

type BotIdResult = { isBot: boolean };
type BotIdChecker = () => Promise<BotIdResult>;
type RateLimitResult = {
  rateLimited: boolean;
  error?: "not-found" | "blocked";
};
type RateLimitChecker = (
  rateLimitId: string,
  options: { request: Request; rateLimitKey: string },
) => Promise<RateLimitResult>;

function logGuardFailure(check: string, error: unknown): void {
  console.error(`[reservation-guard] ${check} failed; request allowed`, error);
}

export function createReservationRateLimitKey(
  request: Request,
  studentId: string,
): string {
  const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = clientIp || "unknown";

  return createHash("sha256")
    .update(`v1\0${studentId.trim()}\0${source}`)
    .digest("hex");
}

export async function isAutomatedReservationRequest(
  checker: BotIdChecker = () =>
    checkBotId({ advancedOptions: { checkLevel: "basic" } }),
): Promise<boolean> {
  try {
    return (await checker()).isBot;
  } catch (error) {
    logGuardFailure("BotID", error);
    return false;
  }
}

export async function isReservationRateLimited(
  request: Request,
  studentId: string,
  checker: RateLimitChecker = checkRateLimit,
): Promise<boolean> {
  try {
    const result = await checker(RESERVATION_RATE_LIMIT_ID, {
      request,
      rateLimitKey: createReservationRateLimitKey(request, studentId),
    });

    if (result.error) {
      logGuardFailure("rate limit", result.error);
      return false;
    }

    return result.rateLimited;
  } catch (error) {
    logGuardFailure("rate limit", error);
    return false;
  }
}
