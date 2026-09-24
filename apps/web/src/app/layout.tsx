import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/Header";
import { BottomNav } from "@/components/layout/BottomNav";
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
        <Providers>
          <Suspense fallback={null}>
            <Header />
          </Suspense>
          <main className="container-page">{children}</main>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}