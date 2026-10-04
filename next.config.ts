import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O servidor de testes usa outro diretório e não disputa o build do dev.
  distDir: process.env.PORTFOLIO_TEST_DIST_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
