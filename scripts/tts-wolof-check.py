"""Écouter et comparer les voix WOLOF sur le nœud Brev (GPU), avant la démo.

    cd services/worker && source .venv/bin/activate
    SAMA_MODE=live python ../../scripts/tts-wolof-check.py

Pour chaque moteur (adia, mms) : les VRAIES phrases de l'agent (dialogue.WOLOF)
sont synthétisées phrase par phrase (comme l'agent), enregistrées dans
var/tts-check/<moteur>-<n>-<phrase>.wav, avec la latence mesurée (« 1re voix » =
attente avant que l'agent parle). Pour essayer une autre voix Adia :
    ADIA_DESCRIPTION="A warm, calm female voice, speaking slowly and clearly" python … Écoutez les fichiers, puis fixez l'ordre dans
~/sama.env : SAMA_TTS_WOLOF=adia,mms (ou mms,adia, ou un seul).
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "worker"))
os.environ.setdefault("SAMA_MODE", "live")

from agent import bootstrap  # noqa: E402,F401
from agent.application.dialogue import WOLOF  # noqa: E402
from agent.infrastructure.tts import tts_wolof  # noqa: E402

PHRASES = [
    WOLOF["manque"].format(pieces="kàrtu identite bi, sertifika medikal bi ak nataal yi",
                           premier="kàrtu identite bi"),
    WOLOF["a_verifier"].format(piece="kàrtu identite bi"),
    WOLOF["pret"].format(done="ñett", total="ñett"),
]

out = ROOT / "var" / "tts-check"
out.mkdir(parents=True, exist_ok=True)
for name, engine in tts_wolof.ENGINES.items():
    print(f"\n── {name} ──")
    try:
        t0 = time.perf_counter()
        engine.load()
        print(f"chargement : {time.perf_counter() - t0:.1f} s")
    except Exception as exc:
        print(f"INDISPONIBLE : {exc}")
        continue
    for i, text in enumerate(PHRASES, 1):
        # Comme l'agent : phrase par phrase. « 1re voix » = attente avant d'entendre l'agent.
        sentences = tts_wolof.split_sentences(text)
        t0 = time.perf_counter()
        first = None
        for j, sentence in enumerate(sentences, 1):
            wav = engine.synthesize(sentence)
            first = first or time.perf_counter() - t0
            path = out / f"{name}-{i}-{j}.wav"
            path.write_bytes(wav)
        print(f"1re voix {first:5.2f} s · total {time.perf_counter() - t0:5.2f} s · "
              f"{len(sentences)} phrase(s)  var/tts-check/{name}-{i}-*.wav  « {text[:50]}… »")
print("\nÉcoutez les fichiers de var/tts-check/ puis réglez SAMA_TTS_WOLOF dans ~/sama.env.")
