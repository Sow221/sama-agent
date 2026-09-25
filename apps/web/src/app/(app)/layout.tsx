/**
 * Layout du groupe protégé `(app)` — le groupe ne change pas les URLs.
 * Chaque écran du parcours exige la connexion quand Supabase est configuré
 * (production) ; l'AuthGate laisse passer en harnais (auth non configurée).
 */
import { AuthGate } from "@/lib/auth/guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}