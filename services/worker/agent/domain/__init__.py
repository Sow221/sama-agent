"""Domaine métier de Sama Agent — règles pures et déterministes (aucun modèle IA).
Le domaine ne dépend jamais de GLM/Kiriku/xTTS/Brev/postgres (règle de dépendance de la référence).

  procedures      connaissance administrative (exigences, étapes, sources)
  actions         résolution de la prochaine action
  journey_engine  cœur déterministe du parcours (état, progression, NextAction)
  evidence        relation exigence → source → preuve
  document        classification des observations vision (ANALYZED ≠ VALIDATED)
"""