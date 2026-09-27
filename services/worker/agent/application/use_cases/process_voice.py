"""Use case : un tour de la boucle vocale (agent voix).

Live : réponse LIBRE du LLM (historique de la session, état du dossier, infos web),
en français à l'écran et en wolof à l'oral. L'état du dossier reste celui du moteur.
"""
from __future__ import annotations

import os
import re

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


#: Consigne du tour VOCAL : court (c'est dit à voix haute), et en deux langues.
_VOICE_SYSTEM = """Tu es Sama Agent, assistant vocal des démarches administratives au Sénégal
(toutes démarches : identité, passeport, état civil, permis, foncier, entreprise…).
L'usager te PARLE (souvent en wolof, transcription automatique parfois imparfaite).
Réponds comme dans une vraie conversation orale : 1 à 3 phrases courtes, concrètes, sans liste,
sans lien, sans markdown. Appuie-toi sur le contexte fourni ; n'invente ni montant ni adresse.
Si la phrase est incompréhensible, demande gentiment de répéter.

Format EXACT, deux lignes :
FR: <ta réponse en français>
WO: <la même réponse en wolof (orthographe wolof courante)>"""

# Tolère le markdown et les variantes (« **FR :** », « Wolof - … ») : sans la
# ligne wolof, l'agent n'aurait rien à DIRE et resterait muet.
_LINE = re.compile(r"^[\W_]*(FR|WO|FRAN[ÇC]AIS|WOLOF)[\W_]*?\s*[:：\-–]\s*(.+)$", re.I | re.M)
_THINK = re.compile(r"<think>.*?</think>", re.S)


def _journey_context(journey) -> str:
    if journey is None:
        return "aucun dossier ouvert (conversation libre)"
    return (f"dossier {journey.procedureId} · statut {journey.status} · "
            f"{journey.completion.provided}/{journey.completion.required} pièces · "
            f"prochaine étape : {journey.nextActionLabel or journey.nextAction} · "
            f"résumé : {formulate(journey)}")


def _llm_voice_reply(text: str, journey, history: list[dict]) -> VoiceReply:
    from agent.infrastructure.llm.glm import GlmLlm
    from agent.infrastructure.web.search import web_search

    llm = _voice_llm() or GlmLlm()
    web = web_search(text + " Sénégal", k=3, timeout_s=3.0) if len(text.split()) >= 3 else []
    web_ctx = "\n".join(f"- {r['title']} : {r['snippet']}" for r in web) or "aucun"
    messages = [{"role": "system", "content": (
        _VOICE_SYSTEM + f"\n\nCONTEXTE : {_journey_context(journey)}\nINFOS WEB :\n{web_ctx}")}]
    for h in history[-10:]:
        role = "user" if h.get("role") == "user" else "assistant"
        messages.append({"role": role, "content": h["text"]})
    messages.append({"role": "user", "content": text})
    raw = _THINK.sub("", llm.chat_text(messages, max_tokens=300)).strip()
    parts: dict[str, str] = {}
    for key, value in _LINE.findall(raw.replace("*", "")):
        lang = "WO" if key.upper().startswith("WO") else "FR"
        parts.setdefault(lang, value.strip())
    display = parts.get("FR") or raw.replace("*", "").strip()
    return VoiceReply(display=display, spoken=parts.get("WO") or None)


def process_voice_turn(text: str, journey_id: str, history: list[dict] | None = None) -> VoiceReply:
    """Réponse LIBRE du LLM (live) : contexte du dossier s'il existe, historique de
    la session, infos web. Sans LLM joignable (ou en mode déterministe), la
    réponse vient du moteur de parcours — jamais d'une phrase inventée."""
    journey = None
    try:
        journey = resume_journey(journey_id)
    except KeyError:
        journey = None  # conversation libre (room sans dossier)

    if app_mode.is_live():
        from agent.infrastructure.llm.glm import LlmUnavailableError

        try:
            return _llm_voice_reply(text, journey, history or [])
        except LlmUnavailableError:
            # LLM injoignable : l'état réel du dossier, ou une demande de répéter.
            if journey is None:
                return VoiceReply("Je n'arrive pas à répondre pour le moment. Pouvez-vous répéter ?")
            return VoiceReply(display=formulate(journey), spoken=formulate_wolof(journey))

    intent = infer_intent(IntentRequest(transcript=text, language=None), llm=None)
    if intent.needsClarification or journey is None:
        return VoiceReply(intent.clarificationQuestion or "Pouvez-vous préciser votre demande ?")
    return VoiceReply(display=formulate(journey), spoken=formulate_wolof(journey))
