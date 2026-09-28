"""Exemples candidats, verdicts de l'étalon et calibrage des filtres (doc 11 §5).

Règle de confiance : les filtres automatiques ne sont crus en volume que s'ils
sont d'accord avec l'étalon wolophone au moins 9 fois sur 10 (AGREEMENT_TARGET).
"""
from __future__ import annotations

import os
import random
import uuid
from pathlib import Path

from sqlalchemy import func, select

from agent.infrastructure.db.engine import db_session
from agent.infrastructure.db.models import DataItem, DataVerdict

KINDS = ("AUDIO_TEXT", "FR_WO")
VERDICTS = ("ok", "ko", "edit")
AGREEMENT_TARGET = 0.9
#: Part des éléments à revoir tirés parmi ceux que les filtres ont ACCEPTÉS :
#: le reste (rejetés) sert à vérifier que les filtres ne jettent pas du bon wolof.
REVIEW_PASSED_SHARE = 0.7


def audio_dir() -> Path:
    root = Path(os.getenv("SAMA_DATAFACTORY_DIR", "var/datafactory")) / "audio"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _item_dict(item: DataItem) -> dict:
    return {
        "id": item.id, "kind": item.kind, "textWo": item.text_wo, "textFr": item.text_fr,
        "hasAudio": bool(item.audio_path), "source": item.source, "checks": item.checks or {},
        "autoPass": item.auto_pass, "status": item.status,
    }


def add_item(kind: str, text_wo: str, source: str, checks: dict | None = None,
             auto_pass: bool | None = None, text_fr: str | None = None,
             wav: bytes | None = None) -> dict:
    if kind not in KINDS:
        raise ValueError(f"type inconnu : {kind}")
    item_id = uuid.uuid4().hex
    audio_path = None
    if wav:
        path = audio_dir() / f"{item_id}.wav"
        path.write_bytes(wav)
        audio_path = str(path)
    with db_session() as s:
        item = DataItem(id=item_id, kind=kind, text_wo=text_wo.strip(), text_fr=text_fr,
                        audio_path=audio_path, source=source[:128], checks=checks or {},
                        auto_pass=auto_pass, status="pending")
        s.add(item)
        s.flush()
        return _item_dict(item)


def audio_path_of(item_id: str) -> Path | None:
    with db_session() as s:
        item = s.get(DataItem, item_id)
        return Path(item.audio_path) if item and item.audio_path else None


def next_for_review(user_id: str, n: int = 10, rng: random.Random | None = None) -> list[dict]:
    """Éléments jamais jugés par cet étalon, mélange acceptés / rejetés par les filtres."""
    rng = rng or random.Random()
    n = max(1, min(n, 50))
    with db_session() as s:
        judged = select(DataVerdict.item_id).where(DataVerdict.user_id == user_id)
        base = select(DataItem).where(DataItem.status == "pending", DataItem.id.not_in(judged))
        want_passed = round(n * REVIEW_PASSED_SHARE)
        passed = s.execute(base.where(DataItem.auto_pass.is_(True))
                           .order_by(func.random()).limit(want_passed)).scalars().all()
        others = s.execute(base.where(DataItem.auto_pass.is_not(True))
                           .order_by(func.random()).limit(n - len(passed))).scalars().all()
        if len(passed) + len(others) < n:  # un seul type disponible : on complète
            seen = {i.id for i in [*passed, *others]}
            more = s.execute(base.where(DataItem.id.not_in(seen)).order_by(func.random())
                             .limit(n - len(passed) - len(others))).scalars().all()
            others = [*others, *more]
        items = [*passed, *others]
        rng.shuffle(items)
        return [_item_dict(i) for i in items]


def record_verdict(item_id: str, user_id: str, verdict: str,
                   correction: str | None = None) -> dict | None:
    """ok → accepté · ko → rejeté · edit → accepté AVEC le texte corrigé (le plus précieux)."""
    if verdict not in VERDICTS:
        raise ValueError(f"verdict inconnu : {verdict}")
    if verdict == "edit" and not (correction or "").strip():
        raise ValueError("une correction est requise pour le verdict « edit »")
    with db_session() as s:
        item = s.get(DataItem, item_id)
        if item is None:
            return None
        s.add(DataVerdict(id=uuid.uuid4().hex, item_id=item_id, user_id=user_id,
                          verdict=verdict, correction=(correction or "").strip() or None))
        item.status = "rejected" if verdict == "ko" else "accepted"
        if verdict == "edit":
            item.checks = {**(item.checks or {}), "original_text_wo": item.text_wo}
            item.text_wo = correction.strip()
        s.flush()
        return _item_dict(item)


def stats(user_id: str | None = None) -> dict:
    """Taux d'accord filtres / étalon et précision des filtres (doc 11 §5, §9).

    - agreement : part des jugements où le filtre et l'étalon disent la même chose
      (filtre accepte ⇔ étalon dit « ok » sans retouche) ;
    - precision : parmi ce que les filtres ACCEPTENT, part que l'étalon valide sans
      retouche. C'est l'indicateur qui décide si l'on peut produire en volume.
    """
    with db_session() as s:
        q = select(DataVerdict.verdict, DataItem.auto_pass).join(
            DataItem, DataItem.id == DataVerdict.item_id).where(DataItem.auto_pass.is_not(None))
        if user_id:
            q = q.where(DataVerdict.user_id == user_id)
        rows = s.execute(q).all()
        pending = s.scalar(select(func.count()).select_from(DataItem)
                           .where(DataItem.status == "pending")) or 0
        by_status = dict(s.execute(select(DataItem.status, func.count())
                                   .group_by(DataItem.status)).all())
    judged = len(rows)
    agree = sum(1 for v, auto in rows if (v == "ok") == bool(auto))
    auto_ok = [v for v, auto in rows if auto]
    precision = (sum(1 for v in auto_ok if v == "ok") / len(auto_ok)) if auto_ok else None
    agreement = agree / judged if judged else None
    return {
        "judged": judged,
        "agreement": round(agreement, 3) if agreement is not None else None,
        "precision": round(precision, 3) if precision is not None else None,
        "target": AGREEMENT_TARGET,
        "trusted": bool(precision is not None and judged >= 50 and precision >= AGREEMENT_TARGET),
        "pending": pending,
        "accepted": by_status.get("accepted", 0),
        "rejected": by_status.get("rejected", 0),
    }
