import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "마니또", template: "%s · 마니또" },
  description: "우리끼리 몰래 챙겨 주는 마니또. 기록하고, 맞혀 보고, 마지막 날 함께 공개해요.",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "마니또", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // 화면 가장자리까지 쓰고, 홈 막대 같은 안전 영역은 env(safe-area-inset-*)로 직접 비운다.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f4" },
    { media: "(prefers-color-scheme: dark)", color: "#14111a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
