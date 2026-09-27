"""Vérification de bout en bout de la PRODUCTION, depuis le nœud Brev.

Fait le vrai parcours d'un usager, sans navigateur, et dit ce qui marche :
  1. l'adresse publique (tunnel) répond ;
  2. l'API refuse un appel sans connexion (espace protégé) ;
  3. [option --signup] une inscription réelle crée un compte Supabase ;
  4. une connexion réelle (compte de démo) renvoie un jeton Supabase ;
  5. l'API accepte ce jeton (vérification ES256/HS256) ;
  6. la compréhension NVIDIA reconnaît la demande ;
  7. un dossier est créé puis RELU (reprise) ;
  8. ce dossier existe dans la base Supabase, rattaché à l'usager ;
  9. un jeton vocal LiveKit est délivré ;
 10. la discussion ÉCRITE marche : conversation créée, réponse de l'agent, historique relu ;
 11. l'agent vocal (worker Brev) rejoint réellement la room LiveKit et se met à l'écoute ;
 12. une VRAIE phrase wolof lui est dite : détection de parole, transcription Kiriku,
     réponse du LLM et voix de l'agent reçue (latence mesurée).

    cd ~/sama-agent/services/worker && source .venv/bin/activate
    set -a; source ~/sama.env; set +a
    python ../../scripts/prod-check.py
    python ../../scripts/prod-check.py --signup vous@exemple.com   # + test d'inscription

Aucun secret n'est affiché. Le mot de passe est saisi masqué.
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import json
import os
import re
import sys
import uuid
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
OK, KO = "✅", "❌"
results: list[tuple[str, bool, str]] = []


def step(name: str, ok: bool, detail: str = "") -> bool:
    results.append((name, ok, detail))
    print(f"{OK if ok else KO} {name}" + (f" — {detail}" if detail else ""))
    return ok


def public_url() -> str:
    if os.getenv("SAMA_PUBLIC_URL"):
        return os.environ["SAMA_PUBLIC_URL"].rstrip("/")
    log = ROOT / "var" / "logs" / "run.log"
    for candidate in (log, ROOT / "var" / "logs" / "tunnel.log"):
        if candidate.exists():
            found = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", candidate.read_text(errors="ignore"))
            if found:
                return found[-1]
    return "http://127.0.0.1:8000"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--signup", metavar="EMAIL", help="tester aussi l'inscription avec cet e-mail (envoie un vrai e-mail)")
    args = parser.parse_args()

    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    if not supabase_url:
        print("SUPABASE_URL absent : lancez d'abord  set -a; source ~/sama.env; set +a")
        return 2
    anon = os.getenv("SUPABASE_ANON_KEY") or input("Clé publique Supabase (sb_publishable_… / anon) : ").strip()
    api = public_url()
    print(f"\nAPI testée : {api}\nSupabase   : {supabase_url}\n")

    client = httpx.Client(timeout=120)
    auth_headers = {"apikey": anon, "Content-Type": "application/json"}

    # 1. Adresse publique
    try:
        r = client.get(f"{api}/healthz")
        step("1. Adresse publique de l'API", r.status_code == 200 and r.json().get("mode") == "live", r.text[:80])
    except httpx.HTTPError as exc:
        step("1. Adresse publique de l'API", False, str(exc))
        return 1

    # 2. Espace protégé
    r = client.get(f"{api}/api/journey/inexistant")
    step("2. Appel sans connexion refusé", r.status_code == 401, f"HTTP {r.status_code}")

    # 3. Inscription (optionnelle : consomme le quota d'e-mails Supabase)
    if args.signup:
        pw = getpass.getpass("Mot de passe pour le compte de test (8+ caractères, masqué) : ")
        r = client.post(f"{supabase_url}/auth/v1/signup", headers=auth_headers,
                        json={"email": args.signup, "password": pw})
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        created = r.status_code in (200, 201) and (body.get("id") or (body.get("user") or {}).get("id"))
        confirm = "e-mail de confirmation envoyé" if created and not body.get("access_token") else ""
        step("3. Inscription réelle (Supabase Auth)", bool(created),
             confirm or f"HTTP {r.status_code} {body.get('msg') or body.get('error_description') or ''}")

    # 4. Connexion réelle
    # Saisie masquée impossible dans certains terminaux web (Jupyter) :
    # SAMA_CHECK_EMAIL / SAMA_CHECK_PASSWORD permettent de les passer en variables.
    email = os.getenv("SAMA_CHECK_EMAIL") or input("E-mail d'un compte de démo (confirmé) : ").strip()
    password = os.getenv("SAMA_CHECK_PASSWORD") or getpass.getpass("Mot de passe (masqué) : ")
    r = client.post(f"{supabase_url}/auth/v1/token?grant_type=password", headers=auth_headers,
                    json={"email": email, "password": password})
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    token = body.get("access_token")
    if not step("4. Connexion réelle (Supabase Auth)", bool(token),
                "jeton reçu" if token else f"HTTP {r.status_code} {body.get('error_description') or body.get('msg') or ''}"):
        return summary()
    user_id = (body.get("user") or {}).get("id", "")
    bearer = {"Authorization": f"Bearer {token}"}

    # 5 + 6. Jeton accepté par l'API + compréhension NVIDIA
    r = client.post(f"{api}/api/intent", headers=bearer,
                    json={"transcript": "je veux faire ma première demande de permis de conduire", "language": "fr"})
    step("5. Jeton accepté par l'API", r.status_code != 401, f"HTTP {r.status_code}")
    intent = r.json() if r.status_code == 200 else {}
    step("6. Compréhension de la demande (NVIDIA)", r.status_code == 200 and not intent.get("needsClarification"),
         f"intention {intent.get('intent')} · confiance {intent.get('confidence')}" if intent else r.text[:120])

    # 7. Dossier créé puis relu
    journey_id = f"prodcheck-{uuid.uuid4().hex[:8]}"
    r = client.post(f"{api}/api/journey", headers=bearer,
                    json={"journeyId": journey_id, "procedureId": "driving_license_new"})
    created = r.status_code == 200
    r2 = client.get(f"{api}/api/journey/{journey_id}", headers=bearer)
    resumed = r2.json() if r2.status_code == 200 else {}
    step("7. Dossier créé puis relu (reprise)", created and r2.status_code == 200,
         f"{resumed.get('status')} · {json.dumps(resumed.get('completion'))}" if resumed else f"HTTP {r.status_code}/{r2.status_code}")

    # 8. Présence réelle dans la base Supabase
    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(os.environ["SAMA_DATABASE_URL"])
        with engine.connect() as c:
            row = c.execute(text("select user_id, status from journeys where id = :i"), {"i": journey_id}).first()
        step("8. Dossier enregistré dans la base Supabase", bool(row) and row[0] == user_id,
             f"table journeys · statut {row[1]} · rattaché à l'usager connecté" if row else "ligne absente")
    except Exception as exc:  # noqa: BLE001 — diagnostic lisible, pas de pile
        step("8. Dossier enregistré dans la base Supabase", False, str(exc)[:160])

    # 9. Jeton vocal
    r = client.post(f"{api}/api/voice/token", headers=bearer, json={"journeyId": journey_id})
    vt = r.json() if r.status_code == 200 else {}
    step("9. Jeton vocal LiveKit délivré", r.status_code == 200 and bool(vt.get("token")),
         vt.get("url", "") if vt else r.text[:120])

    # 10. Discussion écrite (écran « Discussions ») : le même chemin que le site
    r = client.post(f"{api}/api/conversations", headers=bearer, json={"title": "prod-check", "journeyId": journey_id})
    conv_id = (r.json() if r.status_code == 200 else {}).get("id")
    if conv_id:
        t = client.post(f"{api}/api/agent/turn", headers=bearer,
                        json={"text": "pour mon permis de conduire, quelles pièces dois-je fournir ?", "journeyId": journey_id,
                              "conversationId": conv_id})
        turn = t.json() if t.status_code == 200 else {}
        reply = turn.get("answer") or ""
        # Conversation CONTINUE : un long paragraphe, puis une question en wolof, hors permis.
        import time as _t
        follow_ups = [
            ("paragraphe", "Merci. En fait j'ai aussi perdu ma carte d'identité la semaine dernière "
             "au marché, avec d'autres papiers. Je travaille la journée et je ne peux pas me "
             "déplacer souvent. Comment je fais pour la refaire rapidement et combien ça coûte ?"),
            ("wolof", "Naka laa mëna def sama paaspoor ?"),
        ]
        for label, question in follow_ups:
            t0 = _t.perf_counter()
            f = client.post(f"{api}/api/agent/turn", headers=bearer,
                            json={"text": question, "conversationId": conv_id})
            ans = (f.json() if f.status_code == 200 else {}).get("answer", "")
            step(f"10b. Chat continu ({label})", f.status_code == 200 and bool(ans),
                 f"{_t.perf_counter() - t0:.1f} s · « {ans[:110]} »" if ans else f"HTTP {f.status_code} {f.text[:120]}")
        m = client.get(f"{api}/api/conversations/{conv_id}/messages", headers=bearer)
        n = len((m.json() if m.status_code == 200 else {}).get("items", []))
        step("10. Discussion écrite (réponse de l'agent + historique)", t.status_code == 200 and n >= 6,
             f"{n} messages enregistrés · « {str(reply)[:70]} »" if t.status_code == 200 else f"HTTP {t.status_code} {t.text[:100]}")
    else:
        step("10. Discussion écrite (réponse de l'agent + historique)", False, f"conversation HTTP {r.status_code} {r.text[:100]}")

    # 13. Le chat PARLE wolof : une réponse redite en wolof et prononcée (Adia)
    import base64 as _b64
    import time as _t2
    t0 = _t2.perf_counter()
    sp = client.post(f"{api}/api/speak", headers=bearer,
                     json={"text": "Pour refaire votre passeport, allez à la police avec votre extrait de naissance."})
    body = sp.json() if sp.status_code == 200 else {}
    audio_kb = len(_b64.b64decode(body.get("audio", ""))) // 1024 if body else 0
    step("13. Réponse du chat dite en wolof", sp.status_code == 200 and audio_kb > 10,
         f"{_t2.perf_counter() - t0:.1f} s · {audio_kb} Ko d'audio · « {body.get('wolof', '')[:100]} »"
         if body else f"HTTP {sp.status_code} {sp.text[:150]}")

    # 11–12. L'agent vocal rejoint la room, puis une VRAIE phrase parlée est traitée
    if vt.get("token"):
        for name, ok, detail in asyncio.run(_voice_check(vt["url"], vt["token"])):
            step(name, ok, detail)

    return summary()


def _speech_wav() -> tuple[bytes, str]:
    """Une vraie phrase parlée : fichier fourni (SAMA_CHECK_WAV) ou voix wolof Adia."""
    path = os.getenv("SAMA_CHECK_WAV")
    if path:
        return Path(path).read_bytes(), f"fichier {path}"
    sys.path.insert(0, str(ROOT / "services" / "worker"))
    from agent.infrastructure.tts import tts_wolof

    sentence = "Asalaa maalekum. Dama bëgg def sama permis de conduire, lan laa wara indi?"
    wav, engine = tts_wolof.synthesize(sentence)
    return wav, f"phrase wolof synthétisée ({engine}) : « {sentence} »"


VOICE_JOIN = "11. Agent vocal présent dans la room (à l'écoute)"
VOICE_TURN = "12. Conversation vocale réelle (parole → réponse → voix)"


async def _voice_check(url: str, token: str, wait_join: float = 30.0, wait_turn: float = 120.0):
    """Rejoint la room comme le navigateur, attend l'agent, lui PARLE, puis vérifie
    transcription + réponse + voix. Rend [(nom, ok, détail), …]."""
    import io
    import time
    import wave

    try:
        from livekit import rtc
    except ImportError:
        return [(VOICE_JOIN, False, "paquet livekit absent (activez le .venv du worker)")]
    room = rtc.Room()
    joined: asyncio.Future = asyncio.get_running_loop().create_future()
    events: list[dict] = []
    agent_voice = asyncio.Event()
    replied = asyncio.Event()

    @room.on("data_received")
    def _data(packet) -> None:  # noqa: ANN001
        try:
            event = json.loads(bytes(packet.data).decode())
        except Exception:  # noqa: BLE001
            return
        events.append(event)
        if not joined.done() and event.get("type") in ("agent_state", "agent_error"):
            joined.set_result(event)
        if event.get("type") == "agent_error" or (
                event.get("type") == "agent_text" and event.get("role") != "user"):
            replied.set()

    @room.on("track_subscribed")
    def _track(track, *_args) -> None:  # noqa: ANN001
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            agent_voice.set()

    out: list[tuple[str, bool, str]] = []
    try:
        await room.connect(url, token)
        try:
            first = await asyncio.wait_for(joined, timeout=wait_join)
        except asyncio.TimeoutError:
            return [(VOICE_JOIN, False, f"aucun agent en {wait_join:.0f} s — le worker vocal "
                                        "tourne-t-il ? voir var/logs/voice.log")]
        if first.get("type") == "agent_error":
            return [(VOICE_JOIN, False, f"erreur du worker : {first.get('code')} {first.get('message', '')}")]
        out.append((VOICE_JOIN, True, f"état « {first.get('state')} »"))

        # 12. On PARLE à l'agent, au rythme réel : silence, phrase, silence.
        try:
            wav, origin = await asyncio.to_thread(_speech_wav)
            with wave.open(io.BytesIO(wav)) as w:
                rate, width, channels = w.getframerate(), w.getsampwidth(), w.getnchannels()
                pcm = w.readframes(w.getnframes())
            if width != 2 or channels != 1:
                raise ValueError(f"WAV non géré ({width * 8} bits, {channels} canaux)")
        except Exception as exc:  # noqa: BLE001
            out.append((VOICE_TURN, False, f"phrase test impossible à produire : {exc}"[:200]))
            return out
        source = rtc.AudioSource(rate, 1)
        mic = rtc.LocalAudioTrack.create_audio_track("prod-check-mic", source)
        await room.local_participant.publish_track(
            mic, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        await asyncio.sleep(1.0)  # le worker s'abonne au micro
        chunk = rate // 100  # trames de 10 ms
        speech = [pcm[i:i + chunk * 2].ljust(chunk * 2, b"\x00") for i in range(0, len(pcm), chunk * 2)]
        silence = b"\x00\x00" * chunk
        for frame in [silence] * 100 + speech + [silence] * 150:
            await source.capture_frame(rtc.AudioFrame(frame, rate, 1, chunk))
        spoke_at = time.perf_counter()
        try:
            await asyncio.wait_for(replied.wait(), timeout=wait_turn)
            await asyncio.wait_for(agent_voice.wait(), timeout=30)
        except asyncio.TimeoutError:
            pass
        latency = time.perf_counter() - spoke_at
        said = next((e.get("text") for e in events
                     if e.get("type") == "agent_text" and e.get("role") == "user"), None)
        reply = next((e.get("text") for e in events
                      if e.get("type") == "agent_text" and e.get("role") != "user"), None)
        error = next((e for e in events if e.get("type") == "agent_error"), None)
        detail = (f"{origin} · entendu : « {said} » · réponse : « {(reply or '')[:100]} » · "
                  f"voix de l'agent {'reçue' if agent_voice.is_set() else 'NON reçue'} · "
                  f"{latency:.1f} s après la fin de la phrase")
        if error:
            detail += f" · erreur {error.get('code')} : {str(error.get('message', ''))[:120]}"
        if said is None:
            detail += " · rien transcrit : parole non détectée ou Kiriku en échec (voir voice.log)"
        out.append((VOICE_TURN, bool(said) and bool(reply) and agent_voice.is_set() and error is None,
                    detail))
        return out
    except Exception as exc:  # noqa: BLE001
        out.append((VOICE_TURN, False, str(exc)[:160]))
        return out
    finally:
        await room.disconnect()


def summary() -> int:
    ok = sum(1 for _, passed, _ in results if passed)
    print(f"\nBilan : {ok}/{len(results)} vérifications réussies.")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
