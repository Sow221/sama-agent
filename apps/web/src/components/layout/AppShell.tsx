/**
 * AppShell — workspace responsive (UI/UX Master Spec §101-103, §10).
 * Desktop : Sidebar 256/72 + TopBar 64 + contenu + pied. Mobile : MobileHeader + BottomNav.
 * La sidebar ne pousse jamais le contenu avec des marges arbitraires (§10).
 */
"use client";

import { Suspense } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileHeader } from "./MobileHeader";
import { BottomNav } from "./BottomNav";
import { AppFooter } from "./AppFooter";
import { SKIP_LINK } from "./skip-link";
import { AppSystemUI } from "@/components/system/AppSystemUI";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <a href="#contenu" className={SKIP_LINK}>
        Aller au contenu
      </a>
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <TopBar />
          <MobileHeader />
        </Suspense>
        <main id="contenu" tabIndex={-1} className="mx-auto outline-none w-full max-w-7xl flex-1 px-4 pb-8 pt-4 sm:px-6 md:pb-12 md:pt-8 lg:px-10">
          {children}
        </main>
        <AppFooter />
      </div>
      <BottomNav />
      <AppSystemUI />
    </div>
  );
}