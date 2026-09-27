/**
 * Aide — bien démarrer, nos engagements, questions fréquentes.
 * Rendue à l'identique sur /aide (visiteurs) et /app/you/help (dans l'espace).
 */
import { COMMITMENTS, FAQ, STEPS } from "@/lib/content/help";
import { CheckIcon } from "@/components/icons";

export function FaqList({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {FAQ.map((f) => (
        <details
          key={f.q}
          // Survol : même élévation que les cartes de la page d'accueil. Le fond n'est pas
          // touché — `open:bg-surface-2` en garde la propriété. Déplacement coupé si
          // `prefers-reduced-motion` (règle §85).
          className="group rounded-card border border-border bg-surface p-5 open:bg-surface-2 transition-all duration-ui ease-[var(--ease-out)] hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <summary className="focus-visible flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-semibold">
            {f.q}
            <span aria-hidden className="text-xl text-text2 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3 text-text2">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function HelpContent() {
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="aide-demarrer">
        <h2 id="aide-demarrer" className="text-xl font-bold">
          Bien démarrer
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4 rounded-card border border-border bg-surface p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/40 text-sm font-bold text-primary">
                {s.n}
              </span>
              <div>
                <h3 className="font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-text2">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section id="engagements" aria-labelledby="aide-engagements" className="scroll-mt-24">
        <h2 id="aide-engagements" className="text-xl font-bold">
          Nos engagements
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {COMMITMENTS.map((c) => (
            <li key={c.title} className="flex gap-3 rounded-card border border-border bg-surface p-5">
              <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-bold">{c.title}</h3>
                <p className="mt-1 text-sm text-text2">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="questions" aria-labelledby="aide-faq" className="scroll-mt-24">
        <h2 id="aide-faq" className="text-xl font-bold">
          Questions fréquentes
        </h2>
        <FaqList className="mt-4" />
      </section>
    </div>
  );
}
