/**
 * Layout public — header vitrine + colonne mobile-first.
 * Routes : / (welcome), /login, /signup, /forgot-password, /verify-email,
 * /reset-password, /auth (alias compat), /aide.
 * Tout ce qui est connecté vit sous /app (groupe protégé, AppShell).
 */
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SKIP_LINK } from "@/components/layout/skip-link";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenu" className={SKIP_LINK}>
        Aller au contenu
      </a>
      <Header />
      {/* Pleine largeur : chaque page choisit sa colonne (landing large, formulaires étroits). */}
      <main id="contenu" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <Footer />
    </div>
  );
}