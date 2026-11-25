import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 개발 서버의 내장 DB(PGlite)는 번들하지 않고 Node가 직접 불러온다.
  serverExternalPackages: ["@electric-sql/pglite", "web-push"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
