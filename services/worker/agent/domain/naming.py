"""Convention de nommage partagée entre l'API HTTP et le worker vocal (pure).

Pourquoi ce module existe
------------------------
Le nom de la room LiveKit est le SEUL canal qui relie le client, l'API et
l'agent vocal. Avant, l'agent faisait :

    journey_id = os.getenv("LIVEKIT_ROOM", "sama-demo")   # -> "sama-demo"
    load_procedure("sama-demo")                            # -> KeyError

Une room **n'est pas** un dossier : l'API et l'agent doivent donc s'entendre sur
un encodage réversible et total. `room_name(journeyId)` / `journey_id_of(room)`
sont la seule implémentation de cette convention, importée par les deux côtés :
si l'un change, l'autre casse immédiatement (et les tests le voient).

Encodage
--------
LiveKit n'accepte dans un nom de room que `[A-Za-z0-9_-=]`. Tout octet hors de
cet alphabet est échappé en `=` + 2 chiffres hexadécimaux — **octet par octet**,
et non caractère par caractère : un accent UTF-8 fait 2 octets (`c3 a9`), et
échapper seulement le premier produirait une séquence UTF-8 invalide au retour.
Le marqueur `=` fait lui-même partie de l'alphabet autorisé, il est donc échappé
lui aussi (`=3d`) : l'encodage reste injectif, donc deux dossiers distincts ne
peuvent jamais partager une room (pas de fuite entre users).

Pure : aucun I/O, aucun modèle, aucun import framework.
"""
from __future__ import annotations

import re

#: Préfixe qui marque « cette room nous appartient ».
PREFIX = "sama-"
#: Marqueur d'échappement — choisi dans l'alphabet LiveKit pour rester réversible.
ESC = "="
#: Limite LiveKit sur la longueur d'un nom de room (octets).
MAX_ROOM_BYTES = 128

_HEX2 = re.compile(r"^[0-9a-fA-F]{2}$")


def _is_plain(byte: int) -> bool:
    return 48 <= byte <= 57 or 65 <= byte <= 90 or 97 <= byte <= 122 or byte in (95, 45)


def room_name(journey_id: str) -> str:
    """Nom de room déterministe et réversible pour un dossier.

    Lève ValueError si le dossier est vide ou si la room encodée dépasse la
    limite LiveKit : mieux vaut une erreur explicite qu'une room tronquée
    (donc plus réversible, donc muette).
    """
    journey_id = (journey_id or "").strip()
    if not journey_id:
        raise ValueError("journeyId vide : impossible de dériver une room")
    out = [PREFIX]
    for byte in journey_id.encode("utf-8"):
        if _is_plain(byte):
            out.append(chr(byte))
        else:
            out.append(ESC)
            out.append(f"{byte:02x}")
    room = "".join(out)
    if len(room.encode("utf-8")) > MAX_ROOM_BYTES:
        raise ValueError(
            f"journeyId trop long pour un nom de room LiveKit "
            f"({len(room.encode('utf-8'))} > {MAX_ROOM_BYTES} octets)"
        )
    return room


def journey_id_of(room: str) -> str | None:
    """Dossier porté par une room, ou None si la room n'est pas à nous.

    Ne lève jamais : une room tierce (ou un nom corrompu) doit produire un
    « dossier inconnu » propre côté agent, pas une exception dans la boucle vocale.
    """
    room = (room or "").strip()
    if not room.startswith(PREFIX):
        return None
    raw: list[int] = []
    body = room[len(PREFIX):]
    i = 0
    while i < len(body):
        ch = body[i]
        if ch != ESC:
            raw.extend(ch.encode("utf-8"))
            i += 1
            continue
        hexpart = body[i + 1:i + 3]
        if not _HEX2.match(hexpart):
            return None  # échappement tronqué → room corrompue
        raw.append(int(hexpart, 16))
        i += 3
    try:
        decoded = bytes(raw).decode("utf-8").strip()
    except UnicodeDecodeError:
        return None
    return decoded or None
