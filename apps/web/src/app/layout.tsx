import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ToastProvider } from "@/components/ui/overlays";
import { Suspense } from "react";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Sama Agent — Assistant administratif vocal",
  description:
    "Comprendre et suivre les démarches administratives au Sénégal, à la voix, en wolof. Application en français.",
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