"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { documentTitle } from "@/lib/routes";

/** Titre d'onglet par écran. Les pages sont des composants client (pas de
 *  `metadata`) : React 19 hisse ce <title> dans <head>, au rendu serveur comme
 *  à chaque navigation — un `document.title` en effet était écrasé par Next. */
function RouteTitle() {
  return <title>{documentTitle(usePathname())}</title>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      })
  );
  return (
    <QueryClientProvider client={client}>
      <RouteTitle />
      {children}
    </QueryClientProvider>
  );
}