"""
Conversations & Mémoire (P1) — historique réel PostgreSQL/SQLite + isolation stricte.

Contrat de sécurité testé ici :
  · Un usager ne peut JAMAIS lire/modifier/supprimer la conversation ou la mémoire
    d'un autre (User A → conversation A ; User B → tentative sur A → None/404).
  · Pagination + tri par activité réelle (lastActivityAt).
  · Suppression de conversation = suppression en cascade des messages.
  · Mémoire : CRUD + recherche + recall pour injection LLM (tour agent).
"""
from __future__ import annotations

import os

os.environ.setdefault("SAMA_MODE", "deterministic")

from fastapi.testclient import TestClient

from agent.api.fastapi import app, require_user
from agent.infrastructure.auth.supabase import AuthContext
from agent.infrastructure.db.repositories import (
    add_conversation_message,
    create_conversation,
    create_memory,
    delete_conversation,
    delete_memory,
    get_conversation,
    get_memory,
    list_conversation_messages,
    list_conversations,
    list_memory,
    recall_top_memory,
    search_memory,
    update_conversation,
)
from agent.application.use_cases.agent_turn import run_agent_turn, run_tool_loop

client = TestClient(app)

USER_A = "user-A-isolation"
USER_B = "user-B-isolation"


def test_conversation_crud_owner_scoped() -> None:
    """A crée → A liste/relit/renomme ; B ne voit RIEN (None → 404 au-dessus)."""
    conv_a = create_conversation(USER_A, title="Mon papier")
    assert conv_a["userId"] == USER_A
    assert conv_a["status"] == "active"

    conv_b = create_conversation(USER_B, title="Dossier B")
    assert conv_b["userId"] == USER_B

    # Isolation strictement par propriétaire
    assert get_conversation(conv_a["id"], USER_A) is not None
    assert get_conversation(conv_a["id"], USER_B) is None          # B ne lit pas A
    assert get_conversation(conv_b["id"], USER_A) is None          # A ne lit pas B

    owned_a = [c["id"] for c in list_conversations(USER_A)]
    assert conv_a["id"] in owned_a
    assert conv_b["id"] not in owned_a

    # Renommage propriétaire uniquement
    renamed = update_conversation(conv_a["id"], USER_A, title="Papier national")
    assert renamed["title"] == "Papier national"
    assert update_conversation(conv_a["id"], USER_B, title="vol") is None

    # Suppression : B ne peut pas supprimer A ; A peut
    assert delete_conversation(conv_a["id"], USER_B) is False
    assert delete_conversation(conv_a["id"], USER_A) is True
    assert get_conversation(conv_a["id"], USER_A) is None
    assert delete_conversation(conv_b["id"], USER_A) is False


def test_messages_append_list_pagination_and_cascade() -> None:
    conv = create_conversation(USER_A, title="Messages")
    cid = conv["id"]

    m1 = add_conversation_message(cid, USER_A, "user", "Bonjour")
    m2 = add_conversation_message(cid, USER_A, "assistant", "Bonjour, comment puis-je aider ?")
    assert m1["role"] == "user"
    assert m2["role"] == "assistant"

    # B ne peut ni lire ni écrire dans la conversation de A
    assert add_conversation_message(cid, USER_B, "user", "intrusion") is None
    assert list_conversation_messages(cid, USER_B, limit=10) is None

    rows = list_conversation_messages(cid, USER_A)
    assert [r["content"] for r in rows] == ["Bonjour", "Bonjour, comment puis-je aider ?"]

    page = list_conversation_messages(cid, USER_A, limit=1, offset=1)
    assert len(page) == 1 and page[0]["content"] == "Bonjour, comment puis-je aider ?"

    # Cascade : supprimer la conversation supprime SES messages (pas ceux d'autrui)
    other = create_conversation(USER_B, title="Ailleurs")
    assert delete_conversation(cid, USER_A) is True
    assert list_conversation_messages(cid, USER_A) is None
    assert list_conversation_messages(other["id"], USER_B) is not None


def test_conversations_http_same_user() -> None:
    """Flux HTTP complet côté propriétaire (harness deterministe = service)."""
    r = client.post("/api/conversations", json={"title": "HTTP conv"})
    assert r.status_code == 200, r.text
    cid = r.json()["id"]

    lst = client.get("/api/conversations").json()["items"]
    assert any(c["id"] == cid for c in lst)

    got = client.get(f"/api/conversations/{cid}")
    assert got.status_code == 200 and got.json()["title"] == "HTTP conv"

    msg = client.post(f"/api/conversations/{cid}/messages",
                      json={"role": "user", "content": "Coucou"})
    assert msg.status_code == 200
    assert msg.json()["role"] == "user"

    msgs = client.get(f"/api/conversations/{cid}/messages").json()["items"]
    assert any(m["content"] == "Coucou" for m in msgs)

    # Le client ne peut pas écrire en tant qu'assistant (le serveur seul le fait)
    bad = client.post(f"/api/conversations/{cid}/messages",
                      json={"role": "assistant", "content": "fake"})
    assert bad.status_code == 422

    assert client.patch(f"/api/conversations/{cid}", json={"title": "Renommée"}).status_code == 200
    assert client.delete(f"/api/conversations/{cid}").status_code == 200
    assert client.get(f"/api/conversations/{cid}").status_code == 404


def test_conversations_http_cross_user_404() -> None:
    """User B tentant d'accéder à la conversation de User A → 404 (indiscernable d'inconnu)."""
    # Deux identités réelles via l'override de la dépendance Auth (le code d'isolation
    # du repository reste 100 % réel : WHERE user_id = propriétaire).
    conv_a = create_conversation("http-user-a", title="Secret A")
    original = app.dependency_overrides.get(require_user)

    def as_user_a():
        return AuthContext(user_id="http-user-a", provider="test")

    def as_user_b():
        return AuthContext(user_id="http-user-b", provider="test")

    app.dependency_overrides[require_user] = as_user_a
    assert client.post("/api/conversations", json={"title": "x"}).status_code == 200
    app.dependency_overrides[require_user] = as_user_b
    assert client.get(f"/api/conversations/{conv_a['id']}").status_code == 404
    assert client.delete(f"/api/conversations/{conv_a['id']}").status_code == 404
    app.dependency_overrides[require_user] = as_user_a  # le propriétaire, lui, y accède
    assert client.get(f"/api/conversations/{conv_a['id']}").status_code == 200

    if original is not None:
        app.dependency_overrides[require_user] = original
    else:
        app.dependency_overrides.pop(require_user, None)


def test_memory_crud_search_recall_isolation() -> None:
    """Mémoire : écrite par A, jamais visible par B, récupérable, supprimable."""
    m = create_memory(USER_A, "PREFERENCE", "Je préfère le wolof au français", source="chat")
    assert m["kind"] == "PREFERENCE"

    # Isolation
    assert get_memory(m["id"], USER_B) is None
    assert delete_memory(m["id"], USER_B) is False

    # Recherche par mots (récupération contrôlée)
    hits = search_memory(USER_A, "préfère wolof")
    assert any(h["id"] == m["id"] for h in hits)
    assert search_memory(USER_A, "pâtisserie sans lien") == []

    # Recall pour injection LLM (kinds stables uniquement)
    recalled = recall_top_memory(USER_A)
    assert any(x["id"] == m["id"] for x in recalled)

    # Suppression propriétaire → plus récupérable ni recherchable
    assert [x["id"] for x in recall_top_memory(USER_A)] and True  # on garde la trace
    assert delete_memory(m["id"], USER_A) is True
    assert get_memory(m["id"], USER_A) is None
    assert search_memory(USER_A, "préfère wolof") == []


def test_memory_http_flow() -> None:
    r = client.post("/api/memory", json={"kind": "FACT", "content": "J'habite à Karangue", "source": "test"})
    assert r.status_code == 200, r.text
    mid = r.json()["id"]

    assert client.get("/api/memory").json()["items"]
    assert client.get("/api/memory/search", params={"q": "Karangue"}).json()["items"]
    assert client.post("/api/memory", json={"kind": "INCONNU", "content": "x"}).status_code == 422
    assert client.delete(f"/api/memory/{mid}").status_code == 200
    assert client.delete(f"/api/memory/{mid}").status_code == 404


def test_run_agent_turn_persists_conversation_and_uses_memory() -> None:
    """Tour agent réel (mode deterministe) : persiste user+assistant et injecte la mémoire."""
    create_memory(USER_A, "FACT", "Le demandeur a 35 ans", source="chat")

    conv = create_conversation(USER_A, title="Tour")
    result = run_agent_turn("Je veux faire une demande de permis de conduire",
                            user_id=USER_A,
                            conversation_id=conv["id"])
    assert result["answer"] or result["needsClarification"]
    assert result["conversation"], "les messages doivent être persistés"
    roles = [m["role"] for m in result["conversation"]]
    assert roles == ["user", "assistant"]

    # La mémoire est injectée dans le contexte (real path recall_top_memory)
    assert any("35 ans" in m["content"] for m in result["memoryUsed"])


def test_run_tool_loop_deterministic_is_honest() -> None:
    """Mode harnais : pas d'appel externe, réponse explicite — jamais simulée."""
    result = run_tool_loop("Quels documents me manquent ?", user_id=USER_A)
    assert "harnais" in result["answer"]
    assert result["toolCalls"] == []

class _ChatLlm:
    """LLM factice : enregistre ce que le chat lui envoie réellement."""

    model = "fake"

    def __init__(self) -> None:
        self.text_calls: list[list[dict]] = []

    def chat_json(self, prompt: str, system: str | None = None) -> dict:
        if "memories" in prompt:
            return {"memories": [{"kind": "FACT", "content": "habite à Thiès"}]}
        return {"intent": "passeport_inconnu"}  # intention hors catalogue → clarification

    def chat_text(self, messages: list[dict], max_tokens: int = 700) -> str:
        self.text_calls.append(messages)
        return "<think>brouillon</think>Allez au commissariat. Sources : https://exemple.sn"


def test_live_chat_is_free_with_history_and_web(monkeypatch) -> None:
    """Chat live : réponse libre (pas de JSON), historique relu, web injecté et cité,
    et une demande hors catalogue (passeport) reçoit quand même une réponse."""
    from agent import mode as app_mode
    import agent.infrastructure.web.search as search

    monkeypatch.setattr(app_mode, "is_live", lambda: True)
    monkeypatch.setattr(search, "web_search", lambda q, k=5, t=8.0: [
        {"title": "Passeport Sénégal", "url": "https://exemple.sn", "snippet": "pièces requises"}])
    conv = create_conversation("user-chat-live", title="Passeport")
    add_conversation_message(conv["id"], "user-chat-live", "user", "bonjour, je suis à Thiès")
    add_conversation_message(conv["id"], "user-chat-live", "assistant", "Bonjour !")
    llm = _ChatLlm()

    out = run_agent_turn("comment refaire mon passeport perdu ?", "user-chat-live",
                         conversation_id=conv["id"], llm=llm)

    assert out["answer"] == "Allez au commissariat. Sources : https://exemple.sn"
    assert out["sources"] == [{"title": "Passeport Sénégal", "url": "https://exemple.sn"}]
    sent = llm.text_calls[0]
    assert "https://exemple.sn" in sent[0]["content"]                    # web dans le contexte
    assert [m["content"] for m in sent[1:]] == [
        "bonjour, je suis à Thiès", "Bonjour !", "comment refaire mon passeport perdu ?"]
    assert out["newMemories"][0]["content"] == "habite à Thiès"
    assert len(list_conversation_messages(conv["id"], "user-chat-live")) == 4


def test_parse_duckduckgo_results() -> None:
    from agent.infrastructure.web.search import parse_duckduckgo

    page = ('<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg='
            'https%3A%2F%2Fwww.servicepublic.gouv.sn%2Fpasseport&amp;rut=x">Passeport '
            '<b>ordinaire</b></a><a class="result__snippet" href="#">Pièces à <b>fournir</b></a>')
    assert parse_duckduckgo(page, 5) == [{
        "title": "Passeport ordinaire",
        "url": "https://www.servicepublic.gouv.sn/passeport",
        "snippet": "Pièces à fournir",
    }]


def test_live_chat_with_an_open_journey_does_not_crash(monkeypatch) -> None:
    """Régression prod : le résumé du dossier lisait `journey.progress` (inexistant)
    → 503 dès qu'un dossier était ouvert. Le dossier réel doit être dans le contexte."""
    import uuid

    from agent import mode as app_mode
    from agent.application.use_cases.persist_journey import apply_journey
    from agent.schemas import JourneyRequest
    import agent.infrastructure.web.search as search

    monkeypatch.setattr(app_mode, "is_live", lambda: True)
    monkeypatch.setattr(search, "web_search", lambda *a, **k: [])
    from agent.infrastructure.db.repositories import upsert_user

    upsert_user("user-chat-j")
    jid = f"driving_license_new-{uuid.uuid4().hex[:8]}"
    apply_journey(JourneyRequest(journeyId=jid, procedureId="driving_license_new"), user_id="user-chat-j")
    llm = _ChatLlm()

    out = run_agent_turn("quelles pièces me manquent ?", "user-chat-j", journey_id=jid, llm=llm)

    assert out["answer"]
    assert "0/3 pièces" in llm.text_calls[0][0]["content"]


def test_search_query_keeps_the_question_of_a_paragraph() -> None:
    from agent.infrastructure.web.search import search_query

    para = ("Bonjour, j'ai perdu mon portefeuille au marché Sandaga hier. Il y avait "
            "ma carte d'identité et mon permis.\nComment refaire ma carte d'identité ?")
    assert search_query(para) == "Comment refaire ma carte d'identité ?"
    assert len(search_query("mot " * 60).split()) == 18
