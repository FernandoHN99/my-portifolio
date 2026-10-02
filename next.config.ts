import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Endereços das páginas removidas pela spec 022. Temporários (307) para o
  // navegador não guardar o desvio caso o endereço volte a ser usado.
  redirects() {
    return [
      { source: "/atualizacao/:path*", destination: "/posicoes/cotacoes", permanent: false },
      { source: "/importacao/:path*", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
