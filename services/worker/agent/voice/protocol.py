"""Contrat du canal de données (DataChannel) entre le client web et le worker vocal — PUR.

Pourquoi ce module existe
-------------------------
Le protocole vocal était implicite et **à sens unique** : le client envoyait
`user_segment` / `barge_in` / `cancel`, le worker ne répondait jamais. Le front
était donc obligé d'inventer l'état (« Je vous écoute… » en dur) et ne pouvait
ni afficher la transcription ni savoir quand l'agent se tait. Il n'existait
aussi aucun test du format.

Ce module est la SOURCE UNIQUE des noms d'événements et de leur forme, dans le
même esprit que `packages/shared/contracts/*.json` pour les contrats HTTP :
`apps/web/src/lib/voice/protocol.ts` en est le miroir, et un test de parité
compare les deux. Si un côté change, le test casse.

Événements CLIENT → WORKER
-------------------------
    {"type": "user_segment"}              le VAD a clos un segment, audio publié
    {"type": "barge_in"}                 l'usager a reparlé → stop immédiat
    {"type": "cancel", "turnId": "t3"}   annulation ciblée (optionnel)

Événements WORKER → CLIENT
--------------------------
    {"type": "agent_state", "state": "listening"|"thinking"|"speaking", "turnId": "t3"}
    {"type": "agent_text",  "text": "…",  "turnId": "t3", "final": true}
    {"type": "agent_error", "code": "asr_unavailable", "message": "…", "turnId": "t3"}

Invariant de conception : un `turnId` est monotone et non unique. Le client
ignore tout `turnId` inférieur à celui qu'il a déjà traité — c'est ce qui rend
le barge-in correct (une réponse déjà partie ne « revient » pas en retard).
"""
from __future__ import annotations

import itertools
import json

# ── Client → worker ────────────────────────────────────────────────────────
EV_USER_SEGMENT = "user_segment"
EV_BARGE_IN = "barge_in"
EV_CANCEL = "cancel"
CLIENT_EVENTS = frozenset({EV_USER_SEGMENT, EV_BARGE_IN, EV_CANCEL})

# ── Worker → client ────────────────────────────────────────────────────────
EV_AGENT_STATE = "agent_state"
EV_AGENT_TEXT = "agent_text"
EV_AGENT_ERROR = "agent_error"
AGENT_EVENTS = frozenset({EV_AGENT_STATE, EV_AGENT_TEXT, EV_AGENT_ERROR})

#: États que le client sait représenter (source de vérité de l'UI vocale).
ST_LISTENING = "listening"
ST_THINKING = "thinking"
ST_SPEAKING = "speaking"
AGENT_STATES = (ST_LISTENING, ST_THINKING, ST_SPEAKING)

#: Codes d'erreur stables — le client affiche un message, il n'invente pas.
ERR_ASR_UNAVAILABLE = "asr_unavailable"
ERR_TTS_UNAVAILABLE = "tts_unavailable"
ERR_NO_JOURNEY = "no_journey"
ERR_UNKNOWN_ROOM = "unknown_room"
ERR_TURN_FAILED = "turn_failed"
AGENT_ERROR_CODES = frozenset({
    ERR_ASR_UNAVAILABLE, ERR_TTS_UNAVAILABLE, ERR_NO_JOURNEY,
    ERR_UNKNOWN_ROOM, ERR_TURN_FAILED,
})

_counter = itertools.count(1)


def new_turn_id() -> str:
    """Identifiant de tour, unique et croissant — base de l'anti-rejeu barge-in."""
    return f"t{next(_counter)}"


def encode(event: dict) -> bytes:
    """Sérialise un événement pour le DataChannel LiveKit (JSON UTF-8)."""
    return json.dumps(event, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def decode(raw: bytes) -> dict | None:
    """Décode un événement client. Jamais d'exception : un octet illisible est ignoré."""
    try:
        event = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    return event if isinstance(event, dict) else None


def agent_state(state: str, turn_id: str | None = None) -> dict:
    if state not in AGENT_STATES:
        raise ValueError(f"état vocal inconnu : {state!r} (attendu {AGENT_STATES})")
    return {"type": EV_AGENT_STATE, "state": state, "turnId": turn_id}


#: Rôles que le client sait afficher. `user` = transcription ASR réelle, `agent`
#: = réponse formulée. Un rôle inconnu est refusé : le front ne devine pas.
ROLE_USER = "user"
ROLE_AGENT = "agent"
ROLES = (ROLE_USER, ROLE_AGENT)


def agent_text(
    text: str,
    turn_id: str | None = None,
    final: bool = True,
    role: str = ROLE_AGENT,
) -> dict:
    """Texte RÉEL d'un côté de la conversation — jamais une formulation d'attente.

    `role="user"` porte la transcription issue de l'ASR (c'est elle qui permet
    à l'usager de vérifier ce qui a été compris) ; `role="agent"` porte la
    réponse du moteur. Le nom `agent_text` désigne le canal, pas l'interlocuteur.
    """
    if role not in ROLES:
        raise ValueError(f"rôle inconnu : {role!r} (attendu {ROLES})")
    return {
        "type": EV_AGENT_TEXT, "text": text, "turnId": turn_id,
        "final": final, "role": role,
    }


def agent_error(code: str, message: str, turn_id: str | None = None) -> dict:
    if code not in AGENT_ERROR_CODES:
        raise ValueError(f"code d'erreur inconnu : {code!r} (attendu {sorted(AGENT_ERROR_CODES)})")
    return {"type": EV_AGENT_ERROR, "code": code, "message": message, "turnId": turn_id}
