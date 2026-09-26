"""Use case : tour d'agent conversationnel RÉEL (P1 — mémoire, historique, outils).

Pipeline d'un tour (zéro contenu fabriqué, chaque apport vient d'une source réelle) :

  1. RAPPEL MÉMOIRE    recall_top_memory(user_id) → faits persistés de l'usager
  2. INTENT            infer_intent (GLM réel / règles déterministes)
  3. ÉTAT DU DOSSIER   resume_journey (moteur déterministe) quand un dossier existe
  4. FORMULATION+EXT   UN seul appel GLM : réponse + extraction de faits mémorisables
  5. PERSISTANCE       messages user/assistant dans la conversation (si fournie)

Le tout est tracé (request_id / modèle / durées) par la couche API. En cas de panne
fournisseur, LlmUnavailableError remonte → 503 honnête — jamais de réponse inventée.
"""
from __future__ import annotations

import json

from agent import mode as app_mode
from agent.infrastructure.db.repositories import (
    add_conversation_message,
    create_memory,
    recall_top_memory,
)
from agent.infrastructure.llm.glm import GlmLlm, LlmUnavailableError
from agent.infrastructure.prompts import load_prompt
from agent.application.use_cases.process_intent import infer_intent
from agent.schemas import IntentRequest
from agent.tools.definitions import GLM_TOOLS
from agent.tools.dispatcher import execute_tool
import enums


def _journey_summary(journey) -> str:
    """Résumé HONNÊTE de l'état calculé par le moteur (jamais laissé au LLM de décider)."""
    if journey is None:
        return "aucun dossier actif"
    missing = [
        f"{d.requirementId}:{d.status}" for d in journey.documents
        if d.status != enums.DocumentStatus.ANALYZED
    ]
    return (
        f"journeyId={journey.journeyId} statut={journey.status} "
        f"nextAction={journey.nextAction} progression={journey.progress or 'n/a'} "
        f"documents_non_analyses={missing or 'aucun'}"
    )


def _memory_summary(items: list[dict]) -> str:
    if not items:
        return "aucune mémoire enregistrée"
    return " ; ".join(f"{m['kind']}:{m['content']}" for m in items)


def _format_with_context(
    text: str, intent, journey, memory_items, llm: GlmLlm
) -> tuple[str, list[dict]]:
    """Un appel GLM réel : réponse formulée + faits mémorisables extraits.

    Le système est le seul à connaître l'état du dossier (résumé injecté) ; le
    modèle ne fait que formuler et signaler des faits OBSERVABLES du message.
    """
    system = load_prompt("system", "v1")
    prompt = (
        f"Demande de l'usager : {text}\n"
        f"Intention calculée : {intent.intent} (confiance {intent.confidence})"
        f"{(' — clarification demandée : ' + (intent.clarificationQuestion or '')) if intent.needsClarification else ''}\n"
        f"État du dossier (calculé par le moteur, ne jamais le contredire) : {_journey_summary(journey)}\n"
        f"Mémoire de l'usager : {_memory_summary(memory_items)}\n\n"
        "Réponds en JSON STRICT, sans texte hors JSON :\n"
        '{"answer": "<réponse en français, courte, factuelle, utile>", '
        '"memories": [{"kind": "FACT|PREFERENCE|SELF", "content": "<fait observé dans la demande, '
        'utile à retenir>}], où "memories" ne contient que des infos NOUVELLES explicitement '
        "données par l'usager dans SA demande (vide si rien de stable)."
    )
    raw = llm.chat_json(prompt, system=system)
    answer = str(raw.get("answer", "")).strip()
    memories = raw.get("memories") or []
    cleaned = []
    for m in memories if isinstance(memories, list) else []:
        kind = str(m.get("kind", "FACT")).upper() if isinstance(m, dict) else "FACT"
        content = str(m.get("content", "")) if isinstance(m, dict) else ""
        if kind in {"FACT", "PREFERENCE", "SELF"} and content.strip():
            cleaned.append({"kind": kind, "content": content.strip()[:1000]})
    return answer, cleaned


def run_agent_turn(
    text: str,
    user_id: str,
    journey_id: str | None = None,
    conversation_id: str | None = None,
    llm: GlmLlm | None = None,
) -> dict:
    """Tour complet côté serveur — tout réel, rien de simulé."""
    # 1. Mémoire persistée de l'usager (source de vérité PostgreSQL)
    memory_items = recall_top_memory(user_id)

    # 2. Compréhension (GLM réel en live, règles en deterministic)
    intent = infer_intent(IntentRequest(transcript=text), llm=llm)

    # 3. État du dossier via le moteur déterministe (jamais deviné)
    journey = None
    if journey_id:
        try:
            from agent.application.use_cases.persist_journey import resume_journey

            journey = resume_journey(journey_id, user_id=user_id)
        except KeyError:
            journey = None  # dossier inconnu → on répond sans inventer d'état

    # 4–5. Formulation + extraction mémoire (un seul appel réel en live)
    answer: str = ""
    new_memories: list[dict] = []
    if app_mode.is_live():
        if llm is None:
            llm = GlmLlm()
        answer, new_memories = _format_with_context(text, intent, journey, memory_items, llm)
    if not answer:  # panne fournisseur / mode deterministe : brique déterministe honnête
        from agent.application.dialogue import formulate

        if intent.needsClarification:
            answer = intent.clarificationQuestion or "Pouvez-vous préciser votre demande ?"
        elif journey is not None:
            answer = formulate(journey)
        else:
            answer = "Je vous accompagne. Commencez par préciser votre demande en une phrase."

    # 5bis. Sauvegarde des faits extraits (réelle, liée à l'usager)
    saved_memories = []
    for m in new_memories:
        try:
            item = create_memory(user_id, m["kind"], m["content"], source="chat")
            saved_memories.append(item)
        except ValueError:
            continue

    # 6. Persistance conversation (historique réel si une conversation existe)
    messages = []
    if conversation_id:
        user_msg = add_conversation_message(
            conversation_id, user_id, "user", text,
            language=intent.language.value if intent.language else None,
            journey_id=journey.journeyId if journey else (journey_id or None),
        )
        assistant_msg = add_conversation_message(
            conversation_id, user_id, "assistant", answer,
            language=intent.language.value if intent.language else None,
            journey_id=journey.journeyId if journey else (journey_id or None),
        )
        if user_msg:
            messages.append(user_msg)
        if assistant_msg:
            messages.append(assistant_msg)

    return {
        "answer": answer,
        "intent": intent.intent.value if hasattr(intent.intent, "value") else str(intent.intent),
        "language": intent.language.value if hasattr(intent.language, "value") else str(intent.language),
        "confidence": intent.confidence,
        "needsClarification": intent.needsClarification,
        "journeyStatus": getattr(journey, "status", None),
        "nextAction": getattr(getattr(journey, "nextAction", None), "value", None),
        "memoryUsed": [{"kind": m["kind"], "content": m["content"]} for m in memory_items],
        "newMemories": saved_memories,
        "conversation": messages,
    }


def run_tool_loop(
    text: str,
    user_id: str,
    journey_id: str | None = None,
    llm: GlmLlm | None = None,
    max_rounds: int = 2,
) -> dict:
    """Orchestrateur tool calling RÉEL : LLM demande → dispatcher exécute → LLM interprète.

    Démonstration multi-étapes observable : un tour peut enchaîner plusieurs appels
    d'outils réels (get_journey_state → get_missing_requirements → …) avant la réponse.
    Chaque appel est tracé en DB (table tool_calls) avec latence et statut.
    """
    if app_mode.is_live():
        if llm is None:
            llm = GlmLlm()
        system = (
            load_prompt("system", "v1")
            + "\nTu es dans un mode outils : quand une information du dossier est nécessaire, "
            "demande-là via un outil (jamais inventée). Interprète ensuite les résultats réels."
        )
    else:
        system = "Mode harnais : réponds sans appel extérieur, de manière honnête."

    steps: list[dict] = []
    tool_calls: list[dict] = []
    user_text = text
    current = None
    n = 0
    while n < max_rounds:
        n += 1
        if app_mode.is_live():
            raw = llm.chat_with_tools(user_text, GLM_TOOLS, system=system)
            content, calls = raw[0], raw[1]
        else:
            content, calls = None, []
        if not calls:
            if content:
                current = content
            break
        round_tools: list[dict] = []
        for tc in calls:
            name = tc.get("function", {}).get("name", "")
            args_raw = tc.get("function", {}).get("arguments", "{}")
            try:
                args = json.loads(args_raw) if isinstance(args_raw, str) else dict(args_raw)
            except json.JSONDecodeError:
                args = {"_parse_error": args_raw[:200]}
            try:
                result = execute_tool(name, args, session_id=None)
            except Exception as exc:  # outil inconnu → statut d'échec propre, jamais 500
                result = {"tool": name, "status": "failed", "error": str(exc)}
            round_tools.append(result)
            tool_calls.append({"tool": name, "arguments": args, "result": result})
            steps.append(
                {"step": n, "tool": name, "arguments": args, "result": result,
                 "status": result.get("status", "success")}
            )
        user_text = (
            f"{user_text}\n\nRésultats d'outils réels à interpréter :\n"
            f"{json.dumps(round_tools, ensure_ascii=False)}"
        )

    answer = current or (
        "Je n'ai pas pu obtenir une réponse fiable — réessayez dans un instant."
        if app_mode.is_live()
        else "Réponse en mode harnais (aucun appel externe)."
    )

    # Persistance en mémoire du tour pour les conversations futures (traçable)
    try:
        create_memory(
            user_id, "TEMPORARY",
            f"tour outils : {text[:200]} → {answer[:300]}", source="tools",
            journey_id=journey_id,
        )
    except Exception:
        pass  # la mémoire est un confort, jamais un blocage

    return {
        "answer": answer,
        "steps": steps,
        "toolCalls": tool_calls,
    }