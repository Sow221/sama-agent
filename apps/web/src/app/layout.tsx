import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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
  // Le thème est posé sur <html> par le script ci-dessous : `color-scheme`
  // laisse le navigateur choisir la couleur de ses propres contrôles, et
  // l'entrée media est mise à jour avec la classe. Les deux entrées couvrent
  // le premier chargement, avant tout choix de l'utilisateur.
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#11110f" },
  ],
};

/**
 * Pose la classe `dark` / `light` sur <html> avant le premier rendu, sinon la
 * page s'affiche brièvement en clair avant que React ne prenne la main.
 *
 * Volontairement dupliqué de `resolveTheme` (src/lib/theme.ts) : un script
 * en ligne ne peut pas importer le module. La table de décision est donc
 * rigoureusement la même — choix explicite en localStorage, sinon
 * `prefers-color-scheme`, sinon le thème sombre de la charte.
 */
const THEME_BOOTSTRAP = `(function(){try{var s=null;try{s=localStorage.getItem("sama:theme")}catch(e){}var t=s;if(t!=="dark"&&t!=="light"){t=window.matchMedia?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):"dark"}var r=document.documentElement;r.classList.toggle("dark",t==="dark");r.classList.toggle("light",t==="light");r.style.colorScheme=t}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `suppressHydrationWarning` : la classe du thème est posée par le script
    // ci-dessus, donc le <html> rendu par le serveur ne peut pas la connaître.
    <html lang="fr" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-text1 antialiased">
        {/* `beforeInteractive` : Next l'injecte dans le <head> du document, donc
            il s'exécute avant le premier rendu et pas de flash au chargement. */}
        <Script id="sama-theme" strategy="beforeInteractive">
          {THEME_BOOTSTRAP}
        </Script>
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