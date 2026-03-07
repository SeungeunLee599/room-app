import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CPX/OXCE Room 예약 시스템",
  description: "원광대학교 의과대학 CPX/OXCE Room 예약 관리 서비스",
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
