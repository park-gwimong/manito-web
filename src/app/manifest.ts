import type { MetadataRoute } from "next";

/** 홈 화면에 추가했을 때의 이름, 색, 아이콘. iOS는 홈 화면에 추가해야 알림을 받을 수 있다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "마니또",
    short_name: "마니또",
    description: "우리끼리 몰래 챙겨 주는 마니또. 기록하고, 맞혀 보고, 마지막 날 함께 공개해요.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf6f4",
    theme_color: "#96297a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
