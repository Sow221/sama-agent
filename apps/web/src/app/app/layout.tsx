/**
 * Layout du segment protégé `/app` — AppShell responsive (UI/UX Master Spec §101-103).
 * Desktop : Sidebar 260/72 + TopBar 64. Mobile : MobileHeader + BottomNav 4 onglets
 * (le Voice Core reste l'action centrale, jamais un 5ᵉ onglet).
 * L'AuthGate exige la connexion quand Supabase est configuré (production) ;
 * en harnais (auth non configurée) il laisse passer — l'identité de service du
 * worker s'applique.
 */
import { AuthGate } from "@/lib/auth/guard";
import { AppShell } from "@/components/layout/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}