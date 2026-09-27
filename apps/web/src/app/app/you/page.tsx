"use client";

/**
 * Moi — `/app/you` (UI/UX Master Spec §20 Profil / §67-68).
 * Identité réelle (session Supabase), préférences et actions de confidentialité.
 * Déconnexion réelle (signOut) → retour à l'écran de connexion.
 */
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, Card, ListItem } from "@/components/ui";
import { ChevronRightIcon, LogOutIcon } from "@/components/icons";
import { useAuth } from "@/lib/auth/auth-context";

const SECTIONS = [
  { href: "/app/you/account", label: "Compte", description: "E-mail, nom, session" },
  { href: "/app/you/agent", label: "Agent", description: "Style de réponse, affichage" },
  { href: "/app/you/voice", label: "Voix", description: "Réponses orales, sons" },
  { href: "/app/you/preferences", label: "Préférences", description: "Langue et priorités" },
  { href: "/app/memory", label: "Mémoire", description: "Ce que l'agent retient" },
  { href: "/app/you/privacy", label: "Confidentialité", description: "Vos données, vos droits" },
  { href: "/app/you/help", label: "Aide", description: "Bien démarrer, engagements, questions" },
] as const;

/**
 * Sur mobile, Fichiers et Actions n'ont pas d'onglet (BottomNav limitée à 4
 * destinations, §3.1) : sans ce bloc, ils n'étaient joignables que depuis la
 * barre latérale, donc jamais sous 768 px.
 */
const WORKSPACE = [
  { href: "/app/files", label: "Fichiers", description: "Vos pièces et documents" },
  { href: "/app/actions", label: "Actions", description: "Ce qui reste à faire" },
] as const;

export default function YouPage() {
  const router = useRouter();
  const { user, configured, signOut } = useAuth();

  async function logout() {
    await signOut();
    router.replace(configured ? "/login" : "/");
  }

  const name = (user?.user_metadata?.name as string | undefined) ?? null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Moi</h1>
        <p className="mt-1 text-sm text-text2">Votre identité, vos préférences, votre confidentialité.</p>
      </div>

      <Card className="flex items-center gap-4">
        <Avatar name={name ?? user?.email} size="xl" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">
            {name ?? (configured ? "Compte connecté" : "Session locale (démonstration)")}
          </p>
          <p className="truncate text-sm text-text2">
            {user?.email ?? (configured ? "Aucune session" : "Harnais de démonstration — identité de service")}
          </p>
        </div>
      </Card>

      <Card className="p-2 md:hidden">
        <div className="flex flex-col">
          {WORKSPACE.map((s, i) => (
            <div key={s.href}>
              {i > 0 ? <span className="mx-4 block h-px bg-border" /> : null}
              <ListItem
                title={s.label}
                description={s.description}
                href={s.href}
                trailing={<ChevronRightIcon className="h-4 w-4" />}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-2">
        <div className="flex flex-col">
          {SECTIONS.map((s, i) => (
            <div key={s.href}>
              {i > 0 ? <span className="mx-4 block h-px bg-border" /> : null}
              <ListItem
                title={s.label}
                description={s.description}
                href={s.href}
                trailing={<ChevronRightIcon className="h-4 w-4" />}
              />
            </div>
          ))}
        </div>
      </Card>

      <button
        type="button"
        onClick={logout}
        className="focus-visible flex items-center justify-center gap-2 rounded-full border border-error/30 bg-error/10 px-6 py-4 text-lg font-semibold text-error transition-all duration-micro hover:bg-error/15 active:scale-[0.98]"
      >
        <LogOutIcon className="h-5 w-5" />
        Se déconnecter
      </button>
    </div>
  );
}