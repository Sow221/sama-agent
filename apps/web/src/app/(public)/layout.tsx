/**
 * Layout public — header vitrine + colonne mobile-first.
 * Routes : / (welcome), /login, /signup, /forgot-password, /verify-email,
 * /reset-password, /auth (alias compat), /limits.
 * Tout ce qui est connecté vit sous /app (groupe protégé, AppShell).
 */
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      {/* Pleine largeur : chaque page choisit sa colonne (landing large, formulaires étroits). */}
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}