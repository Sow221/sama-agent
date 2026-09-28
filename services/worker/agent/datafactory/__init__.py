"""Usine à données wolof (doc 11) : l'IA produit, l'IA se contrôle, un wolophone calibre.

  wer.py        normalisation du wolof écrit + taux d'erreur de mots (pur)
  roundtrip.py  contrôle K1 : texte → voix (Adia) → transcription (Kiriku) → WER
  store.py      exemples candidats, verdicts de l'étalon, taux d'accord
  run_k1.py     traitement d'un fichier de phrases (sur la machine GPU)
"""
