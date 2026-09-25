/**
 * Layout du segment protégé `/app` — chaque écran du parcours exige la connexion
 * quand Supabase est configuré (production) ; l'AuthGate laisse passer en harnais
 * (auth non configurée). La BottomNav (mobile) ne vit QUE dans l'espace connecté :
 * le landing public et l'écran /auth ont leurs propres CTA.
 */
import { AuthGate } from "@/lib/auth/guard";
import { BottomNav } from "@/components/layout/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {children}
      <BottomNav />
    </AuthGate>
  );
}