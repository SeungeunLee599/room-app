import { NextResponse } from "next/server";
import { getBookingWindow } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const response = NextResponse.json(getBookingWindow());
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
