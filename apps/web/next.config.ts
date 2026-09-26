import type { NextConfig } from "next";

const securityHeaders = [
  // Durcissement des en-têtes (OWASP) — CSP complet à valider au navigateur (voir rapport).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self)" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@sama/shared"],
  // Ne pas exposer la stack (`X-Powered-By: Next.js`) : réponse 404 vérifiée.
  poweredByHeader: false,
  // Compression gzip/brotli des réponses (vérifiée par curl après redémarrage).
  compress: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;