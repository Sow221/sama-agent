"""Lance le contrôle K1 sur un fichier de phrases wolof (une par ligne), sur la machine GPU.

    cd ~/sama-agent/services/worker && source .venv/bin/activate
    set -a; source ~/sama.env; set +a
    python -m agent.datafactory.run_k1 phrases.txt --source wikipedia-wo --limit 200

Chaque phrase est prononcée par Adia, réécoutée par Kiriku, notée (WER) puis
enregistrée comme exemple candidat (audio + texte) en attente de l'étalon.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from agent import bootstrap  # noqa: F401  (sys.path)
from agent.datafactory.roundtrip import K1_MAX_WER, voice_roundtrip
from agent.datafactory.store import add_item


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Contrôle K1 : aller-retour de la voix")
    parser.add_argument("fichier", type=Path, help="phrases wolof, une par ligne")
    parser.add_argument("--source", required=True, help="origine des phrases (ex. wikipedia-wo)")
    parser.add_argument("--limit", type=int, default=0, help="nombre maximal de phrases (0 = tout)")
    parser.add_argument("--max-wer", type=float, default=K1_MAX_WER)
    args = parser.parse_args(argv)

    lines = [line.strip() for line in args.fichier.read_text(encoding="utf-8").splitlines()]
    sentences = [line for line in lines if len(line.split()) >= 2]
    if args.limit:
        sentences = sentences[: args.limit]
    if not sentences:
        print("Aucune phrase exploitable (au moins 2 mots par ligne).")
        return 2

    from agent.infrastructure.stt import asr_kiriku
    from agent.infrastructure.tts import tts_wolof

    print(f"Chargement des modèles (Kiriku, Adia)… {len(sentences)} phrase(s) à traiter.")
    asr_kiriku.warm()
    tts_wolof.warm()

    passed = 0
    started = time.perf_counter()
    for i, sentence in enumerate(sentences, 1):
        result = voice_roundtrip(
            sentence,
            synthesize=lambda text: tts_wolof.synthesize(text)[0],
            transcribe=asr_kiriku.transcribe,
            max_wer=args.max_wer,
        )
        add_item("AUDIO_TEXT", sentence, args.source, checks={"K1": result.as_check()},
                 auto_pass=result.passed, wav=result.wav)
        passed += result.passed
        mark = "✅" if result.passed else "❌"
        print(f"[{i}/{len(sentences)}] {mark} WER {result.wer:.2f} · « {sentence[:60]} » → « {result.heard[:60]} »"
              + (f" · {result.error}" if result.error else ""))

    elapsed = time.perf_counter() - started
    print(f"\nTerminé : {passed}/{len(sentences)} passent K1 (WER ≤ {args.max_wer}) "
          f"en {elapsed:.0f} s. Les éléments attendent l'étalon dans l'app « Valider ».")
    return 0


if __name__ == "__main__":
    sys.exit(main())
