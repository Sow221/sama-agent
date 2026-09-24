"""Application — orchestration des cas d'utilisation (aucune règle administrative ici).

  use_cases/        process_intent · get_journey · analyze_document · get_evidence · process_voice
  dialogue.py       formulation à partir de la NextAction (moteur décide, template formule)
  orchestration/    agent_orchestrator (boucle vocale), session_orchestrator (sessions)

Règle de la référence : APPLICATION → AI PROVIDERS et APPLICATION → DOMAIN ;
le domaine n'appelle jamais un provider.
"""