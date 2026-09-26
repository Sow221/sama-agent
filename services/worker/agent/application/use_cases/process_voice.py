"""Use case : un tour de la boucle vocale (agent voix).

Intent (LLM/règles) → Journey (déterministe) → réponse formulée (dialogue).
La décision administrative vient du moteur ; le formulaire ne fait que dire l'état réel.
"""
from __future__ import annotations

import os

from agent import mode as app_mode
from agent.schemas import IntentRequest
from dataclasses import dataclass

from agent.application.dialogue import formulate, formulate_wolof
from agent.application.use_cases.process_intent import infer_intent
from agent.application.use_cases.persist_journey import resume_journey


def _voice_llm():
    """LLM de l'intention VOCALE : modèle rapide si configuré (NVIDIA_VOICE_MODEL,
    ex. z-ai/glm-5.3-flash). En voix, 35–49 s d'attente (GLM complet) cassent
    l'échange ; en texte, le modèle complet reste la règle. Réel dans les deux cas."""
    model = os.getenv("NVIDIA_VOICE_MODEL", "").strip()
    if not model or not app_mode.is_live():
        return None
    from agent.infrastructure.llm.glm import GlmLlm

    return GlmLlm(model=model)


@dataclass(frozen=True)
class VoiceReply:
    """Réponse d'un tour vocal : affichée en français, dite en wolof.

    « Parlez en wolof, lisez en français » : l'écran montre `display` ; la voix
    prononce `spoken` quand un TTS wolof est disponible, sinon `display` (voix
    française). `spoken` vaut None quand il n'existe pas de version wolof
    (question de précision venue du LLM, en français).
    """

    display: str
    spoken: str | None = None


def process_voice_turn(text: str, journey_id: str) -> VoiceReply:
    """Le dossier est relu en base (procédure + documents persistés) : un dossier
    par-usager (`driving_license_new-<id>`) n'est pas un identifiant de procédure.
    KeyError si le dossier n'existe pas — le worker le remonte en agent_error."""
    intent = infer_intent(IntentRequest(transcript=text, language=None), llm=_voice_llm())
    if intent.needsClarification:
        return VoiceReply(intent.clarificationQuestion or "Pouvez-vous préciser votre demande ?")
    journey = resume_journey(journey_id)
    return VoiceReply(display=formulate(journey), spoken=formulate_wolof(journey))