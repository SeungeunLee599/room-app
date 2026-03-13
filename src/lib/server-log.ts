import { ApiError } from "@/lib/reservation-service";

type LogContext = Record<string, string | number | boolean | null | undefined>;

export function logApiError(route: string, error: unknown, context?: LogContext): void {
  const prefix = `[api-error] ${route}`;

  if (error instanceof ApiError) {
    console.error(prefix, {
      status: error.status,
      message: error.message,
      context,
    });
    return;
  }

  if (error instanceof Error) {
    console.error(prefix, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
    });
    return;
  }

  console.error(prefix, {
    error,
    context,
  });
}
