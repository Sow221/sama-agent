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
  9. un jeton vocal LiveKit est délivré.

    cd ~/sama-agent/services/worker && source .venv/bin/activate
    set -a; source ~/sama.env; set +a
    python ../../scripts/prod-check.py
    python ../../scripts/prod-check.py --signup vous@exemple.com   # + test d'inscription

Aucun secret n'est affiché. Le mot de passe est saisi masqué.
"""
from __future__ import annotations

import argparse
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
    email = input("E-mail d'un compte de démo (confirmé) : ").strip()
    password = getpass.getpass("Mot de passe (masqué) : ")
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

    return summary()


def summary() -> int:
    ok = sum(1 for _, passed, _ in results if passed)
    print(f"\nBilan : {ok}/{len(results)} vérifications réussies.")
    return 0 if ok == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
