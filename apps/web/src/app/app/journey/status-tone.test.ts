/**
 * Le statut du parcours tel que l'usager le voit.
 *
 * Ces tests existent parce que l'ancien code était *silencieusement* faux :
 * `STATUS_TONE` était cléée `not_started / in_progress / needs_action /
 * completed` alors que le moteur envoie `NOT_STARTED / IN_PROGRESS /
 * NEEDS_DOCUMENT / READY_FOR_NEXT_STEP`. Toute recherche échouait, donc le
 * `?? "neutral"` de repli s'appliquait en permanence et **toute** pastille
 * était grise — y compris sur un dossier complet. Aucun crash, aucune erreur
 * de type : le défaut ne pouvait se voir qu'en ouvrant l'écran.
 *
 * Et l'écran affichait `status.replaceAll("_", " ")` → « NEEDS DOCUMENT ».
 */
import { describe, expect, it } from "vitest";
import {
  JOURNEY_STATUS,
  JOURNEY_STATUS_LABEL,
  type JOURNEY_STATUS as JourneyStatus,
} from "@sama/shared/gen/enums";
import { STATUS_TONE } from "@/app/app/journey/[id]/page";

describe("pastille de statut du parcours", () => {
  it("couvre TOUS les statuts que le moteur peut produire", () => {
    // Le type `Record<JOURNEY_STATUS, …>` le garantit à la compilation ; ce test
    // le garantit à l'exécution (défense contre un cast ou un import JS).
    for (const status of JOURNEY_STATUS) {
      expect(STATUS_TONE[status], `statut non couvert : ${status}`).toBeDefined();
    }
    expect(Object.keys(STATUS_TONE).sort()).toEqual([...JOURNEY_STATUS].sort());
  });

  it("ne laisse aucun statut retomber sur le repli neutre par défaut", () => {
    // Le défaut historique venait d'un `?? "neutral"` qui masquait la faute.
    // On vérifie donc l'inverse : les statuts qui doivent se voir portent
    // bien une couleur explicite, et `neutral` est réservé aux deux états
    // réellement neutres (pas commencé, hors périmètre).
    const neutralOk: JourneyStatus[] = ["NOT_STARTED", "OUT_OF_SCOPE"];
    for (const status of JOURNEY_STATUS) {
      const tone = STATUS_TONE[status];
      if (neutralOk.includes(status)) {
        expect(tone, `${status} doit rester neutre`).toBe("neutral");
      } else {
        expect(tone, `${status} ne doit pas être neutre`).not.toBe("neutral");
      }
    }
  });

  it("signale les blocages et les réussites par des tons distincts", () => {
    // C'est l'information que l'usager doit voir sans lire : ce qui bloque vs
    // ce qui est prêt. READY_FOR_NEXT_STEP est le seul « ok ».
    expect(STATUS_TONE.READY_FOR_NEXT_STEP).toBe("ok");
    expect(STATUS_TONE.NEEDS_REVIEW).toBe("danger");
    expect(STATUS_TONE.NEEDS_INFORMATION).toBe("danger");
  });
});

describe("libellé de statut du parcours", () => {
  it("existe pour tous les statuts", () => {
    for (const status of JOURNEY_STATUS) {
      expect(JOURNEY_STATUS_LABEL[status], `libellé manquant : ${status}`).toBeTruthy();
    }
  });

  it("est en français, jamais un identifiant de moteur", () => {
    for (const status of JOURNEY_STATUS) {
      const label = JOURNEY_STATUS_LABEL[status];
      // Le symptôme observé : « NEEDS DOCUMENT », « READY FOR NEXT STEP ».
      expect(label, `${status} encore en majuscules-mots-clés`).not.toBe(
        status.replaceAll("_", " ")
      );
      expect(label, `${status} contient encore un _`).not.toContain("_");
      expect(label.trim().length, `${status} vide`).toBeGreaterThan(0);
    }
  });

  it("reste court (une pastille, pas un paragraphe)", () => {
    for (const status of JOURNEY_STATUS) {
      expect(JOURNEY_STATUS_LABEL[status].length, `${status} trop long`).toBeLessThanOrEqual(40);
    }
  });
});
