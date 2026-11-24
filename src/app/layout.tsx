import type { Metadata, Viewport } from "next";
import { Jua } from "next/font/google";
import "./globals.css";

// 제목용 둥근 손글씨체. 한글 글리프는 unicode-range 조각으로 필요할 때 내려받는다.
const jua = Jua({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-jua",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "마니또", template: "%s · 마니또" },
  description: "우리끼리 몰래 챙겨 주는 마니또. 기록하고, 맞혀 보고, 마지막 날 함께 공개해요.",
};

export const viewport: Viewport = {
  themeColor: "#fff5f1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${jua.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
