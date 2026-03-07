import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "방 예약 시스템",
  description: "실습실 예약 웹앱",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
