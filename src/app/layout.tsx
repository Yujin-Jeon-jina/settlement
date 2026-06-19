import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "출판사 정산 어드민",
  description: "출판사 MG 정산 자동화",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
