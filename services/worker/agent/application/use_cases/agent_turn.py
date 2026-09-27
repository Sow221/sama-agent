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
import re
from concurrent.futures import ThreadPoolExecutor

from agent import mode as app_mode
from agent.infrastructure.db.repositories import (
    add_conversation_message,
    create_memory,
    list_conversation_messages,
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
        f"nextAction={journey.nextAction} "
        f"progression={journey.completion.provided}/{journey.completion.required} pièces "
        f"documents_non_analyses={missing or 'aucun'}"
    )


def _memory_summary(items: list[dict]) -> str:
    if not items:
        return "aucune mémoire enregistrée"
    return " ; ".join(f"{m['kind']}:{m['content']}" for m in items)


#: Messages précédents relus pour le contexte (la conversation reste cohérente).
_HISTORY_TURNS = 12
_THINK = re.compile(r"<think>.*?</think>", re.S)

_CHAT_SYSTEM = """Tu es Sama Agent, assistant des démarches administratives au Sénégal
(état civil, identité, passeport, permis, foncier, entreprise, fiscalité, santé, éducation…).
Réponds TOUJOURS dans la langue de l'usager : en wolof s'il écrit en wolof, sinon en français.

Règles :
- Réponds à la question posée, de façon concrète : étapes, pièces, lieux, coûts, délais.
- Appuie-toi sur les RÉSULTATS WEB fournis quand ils sont pertinents et cite-les :
  termine alors par une ligne « Sources : » avec les liens utilisés (uniquement ceux fournis).
- Si une information n'est ni dans les résultats ni certaine, dis-le et indique où la vérifier
  (service compétent, site officiel) ; n'invente jamais un montant, une adresse ou un lien.
- L'état du dossier de l'usager est calculé par le système : ne le contredis jamais.
- Tiens compte de l'historique : ne redemande pas ce que l'usager a déjà dit.
- Style : clair, chaleureux, direct. 150 mots maximum, listes courtes quand il y a des
  étapes. Pas de JSON."""


def _web_context(results: list[dict]) -> str:
    if not results:
        return "aucun résultat web disponible pour ce tour"
    return "\n".join(
        f"[{i}] {r['title']} — {r['url']}\n    {r['snippet']}" for i, r in enumerate(results, 1)
    )


def _converse(text, intent, journey, memory_items, history, web, llm: GlmLlm) -> str:
    """Réponse LIBRE du modèle (texte), avec historique, dossier, mémoire et web."""
    context = (
        f"Intention détectée : {intent.intent} (confiance {intent.confidence})\n"
        f"État du dossier (calculé par le moteur) : {_journey_summary(journey)}\n"
        f"Mémoire de l'usager : {_memory_summary(memory_items)}\n"
        f"RÉSULTATS WEB pour la question :\n{_web_context(web)}"
    )
    messages: list[dict] = [{"role": "system", "content": _CHAT_SYSTEM + "\n\nCONTEXTE :\n" + context}]
    for m in history[-_HISTORY_TURNS:]:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": text})
    answer = llm.chat_text(messages)
    return _THINK.sub("", answer).strip()


def _extract_memories(text: str, llm: GlmLlm) -> list[dict]:
    """Faits stables donnés par l'usager (best effort : un échec n'annule pas le tour)."""
    try:
        raw = llm.chat_json(
            "Message de l'usager : " + text + "\n\nRéponds en JSON STRICT : "
            '{"memories": [{"kind": "FACT|PREFERENCE|SELF", "content": "<fait>"}]} — '
            "uniquement des informations NOUVELLES et stables données explicitement "
            "par l'usager sur lui-même (ville, situation, préférence de langue…). Liste vide sinon."
        )
    except Exception:  # noqa: BLE001
        return []
    cleaned = []
    memories = raw.get("memories") if isinstance(raw, dict) else None
    for m in memories if isinstance(memories, list) else []:
        if not isinstance(m, dict):
            continue
        kind = str(m.get("kind", "FACT")).upper()
        content = str(m.get("content", "")).strip()
        if kind in {"FACT", "PREFERENCE", "SELF"} and content:
            cleaned.append({"kind": kind, "content": content[:1000]})
    return cleaned[:3]


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

    # 2. En PARALLÈLE (vitesse) : compréhension, recherche web, faits à mémoriser.
    # Le chat reste ouvert à TOUTE démarche : une intention non reconnue (ou un
    # classement raté) ne bloque pas la réponse, elle ne crée simplement pas de dossier.
    live = app_mode.is_live()
    if live and llm is None:
        llm = GlmLlm()
    pool = ThreadPoolExecutor(max_workers=3)
    fut_intent = pool.submit(infer_intent, IntentRequest(transcript=text), llm)
    fut_web = fut_mem = None
    if live:
        from agent.infrastructure.web.search import search_query, web_search

        if len(text.split()) >= 3:
            fut_web = pool.submit(web_search, search_query(text) + " Sénégal", 5, 4.0)
        fut_mem = pool.submit(_extract_memories, text, llm)
    try:
        intent = fut_intent.result()
    except LlmUnavailableError:
        from agent.application.use_cases.process_intent import _clarify

        intent = _clarify(IntentRequest(transcript=text), "")

    # 3. État du dossier via le moteur déterministe (jamais deviné)
    journey = None
    if journey_id:
        try:
            from agent.application.use_cases.persist_journey import resume_journey

            journey = resume_journey(journey_id, user_id=user_id)
        except KeyError:
            journey = None  # dossier inconnu → on répond sans inventer d'état

    # 4–5. Réponse LIBRE (historique + web + dossier + mémoire), puis extraction mémoire
    answer: str = ""
    new_memories: list[dict] = []
    sources: list[dict] = []
    if live:
        history = (list_conversation_messages(conversation_id, user_id, limit=200) or []) if conversation_id else []
        sources = fut_web.result() if fut_web else []
        try:
            answer = _converse(text, intent, journey, memory_items, history, sources, llm)
        finally:
            new_memories = fut_mem.result() if fut_mem else []
    pool.shutdown(wait=False)
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
        "sources": [{"title": r["title"], "url": r["url"]} for r in sources],
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