import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ToastProvider } from "@/components/ui/overlays";
import { Suspense } from "react";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const DESCRIPTION =
  "Comprendre et suivre les démarches administratives au Sénégal, à la voix, en wolof. Application en français.";

// Pas de `title` ici : le titre d'onglet est rendu par écran (RouteTitle, providers.tsx).
export const metadata: Metadata = {
  description: DESCRIPTION,
  applicationName: "Sama Agent",
  openGraph: {
    title: "Sama Agent — Assistant administratif vocal",
    description: DESCRIPTION,
    type: "website",
    locale: "fr_SN",
    siteName: "Sama Agent",
  },
  twitter: { card: "summary", title: "Sama Agent", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#11110f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={inter.variable}>
      <body className="min-h-dvh bg-bg text-text1 antialiased">
        <div className="aurora" aria-hidden />
        <AuthProvider>
          <Providers>
            <ToastProvider>
              <Suspense fallback={null}>{children}</Suspense>
            </ToastProvider>
          </Providers>
        </AuthProvider>
      </body>
    </html>
  );
}