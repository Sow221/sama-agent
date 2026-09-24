"use client";

/** Écran 7 — Limites : transparence honnête (C §16/§66). */
import { Card } from "@/components/ui";

const LIMITS = [
  "Sama Agent est un assistant d'accompagnement, pas une administration.",
  "L'analyse d'un document n'est pas une validation administrative officielle.",
  "La vérification définitive relève du service compétent (CAPP Karangë).",
  "Pendant la voix, aucune transcription n'est affichée : l'app reste en français.",
  "Les informations affichées proviennent de sources officielles, vérifiées au moment de la démonstration.",
];

export default function LimitesPage() {
  return (
    <section className="flex flex-col gap-6 pt-4">
      <h1 className="text-2xl font-bold">Limites</h1>
      <div className="flex flex-col gap-3">
        {LIMITS.map((l, i) => (
          <Card key={i}>
            <p className="text-text1">• {l}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}