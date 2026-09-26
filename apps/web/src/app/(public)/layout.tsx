/**
 * Layout public — header vitrine + colonne mobile-first.
 * Routes : / (welcome), /login, /signup, /forgot-password, /verify-email,
 * /reset-password, /auth (alias compat), /limits.
 * Tout ce qui est connecté vit sous /app (groupe protégé, AppShell).
 */
import { Header } from "@/components/layout/Header";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <Header />
      <div className="container-page">{children}</div>
    </div>
  );
}