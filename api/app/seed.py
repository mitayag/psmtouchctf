import hashlib
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app import models


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def compute_content_hash(item: dict[str, Any]) -> str:
    """Stable hash of all challenge content so versioning can detect changes."""
    content = {
        "title": item.get("title", ""),
        "instruction": item.get("instruction", ""),
        "hint": item.get("hint", ""),
        "explanation": item.get("explanation", ""),
        "data": item.get("data", {}),
    }
    return hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def load_challenge_bank() -> list[dict[str, Any]]:
    path = os.path.join(os.path.dirname(__file__), "..", "data", "challenge_bank.json")
    with open(path) as f:
        return json.load(f)


def build_public_data(item: dict[str, Any]) -> dict[str, Any]:
    data = item["data"]
    kind = data["kind"]
    if kind == "phishing":
        evidence = [{k: v for k, v in e.items() if k != "correct"} for e in data["evidence"]]
        return {
            "kind": "phishing",
            "email": data["email"],
            "evidence": evidence,
        }
    if kind == "logs":
        logs = [{k: v for k, v in log.items() if k != "correct"} for log in data["logs"]]
        return {
            "kind": "logs",
            "question": data["question"],
            "logs": logs,
        }
    if kind == "decode":
        public = {
            "kind": "decode",
            "prompt": data["prompt"],
            "placeholder": data["placeholder"],
            "tokens": data["tokens"],
        }
        if "binaryLookup" in data:
            public["binaryLookup"] = data["binaryLookup"]
        if "substitutionLegend" in data:
            public["substitutionLegend"] = data["substitutionLegend"]
        return public
    raise ValueError(f"Unknown challenge kind: {kind}")


def build_private_validator(item: dict[str, Any]) -> dict[str, Any]:
    data = item["data"]
    kind = data["kind"]
    if kind in ("phishing", "logs"):
        key = "evidence" if kind == "phishing" else "logs"
        correct_ids = [x["id"] for x in data[key] if x.get("correct")]
        return {"kind": kind, "correct_ids": correct_ids}
    if kind == "decode":
        return {"kind": "decode", "answer": data["answer"]}
    raise ValueError(f"Unknown challenge kind: {kind}")


def seed_event(db: Session) -> models.Event:
    event = db.query(models.Event).first()
    if not event:
        event = models.Event(
            id=str(uuid.uuid4()),
            name="PSM TouchCTF Sample Event",
            state=models.EventState.draft,
            timezone="UTC",
        )
        db.add(event)
        db.flush()

    ruleset = db.query(models.Ruleset).filter(models.Ruleset.event_id == event.id).first()
    if not ruleset:
        ruleset = models.Ruleset(
            id=str(uuid.uuid4()),
            event_id=event.id,
            revision=1,
            duration_seconds=180,
            extended_duration_seconds=300,
            max_attempts=2,
            hint_penalty=25,
            base_points=100,
            wrong_attempt_penalty=10,
            capture_bonus=100,
            qualification_solves_required=2,
            difficulty="standard",
            mode="standard",
            published_at=utcnow(),
        )
        db.add(ruleset)
        db.flush()
        event.active_ruleset_id = ruleset.id

    db.commit()
    return event


def seed_challenges(db: Session) -> int:
    bank = load_challenge_bank()
    count = 0
    for item in bank:
        challenge = db.query(models.Challenge).filter(models.Challenge.stable_id == item["id"]).first()
        if not challenge:
            challenge = models.Challenge(
                id=str(uuid.uuid4()),
                stable_id=item["id"],
                challenge_type=models.ChallengeType(item["type"]),
                difficulty="standard",
            )
            db.add(challenge)
            db.flush()

        content_hash = compute_content_hash(item)
        existing_published = (
            db.query(models.ChallengeRevision)
            .filter(
                models.ChallengeRevision.challenge_id == challenge.id,
                models.ChallengeRevision.published == True,
            )
            .first()
        )

        # If the current published revision already matches this content, skip.
        if existing_published and existing_published.content_hash == content_hash:
            continue

        # Unpublish any existing published revision so the new one becomes active.
        if existing_published:
            existing_published.published = False
            db.flush()

        next_revision = 1
        latest = (
            db.query(models.ChallengeRevision)
            .filter(models.ChallengeRevision.challenge_id == challenge.id)
            .order_by(models.ChallengeRevision.revision.desc())
            .first()
        )
        if latest:
            next_revision = latest.revision + 1

        revision = models.ChallengeRevision(
            id=str(uuid.uuid4()),
            challenge_id=challenge.id,
            revision=next_revision,
            title=item["title"],
            instruction=item["instruction"],
            hint=item["hint"],
            explanation=item["explanation"],
            public_data=build_public_data(item),
            private_validator=build_private_validator(item),
            content_hash=content_hash,
            published=True,
        )
        db.add(revision)
        count += 1

    db.commit()
    return count


def seed(db: Session) -> dict[str, Any]:
    event = seed_event(db)
    challenge_count = seed_challenges(db)
    return {
        "event_id": event.id,
        "challenges_seeded": challenge_count,
        "already_existed": challenge_count == 0,
    }


def seed_command():
    """Seed application data.

    The database schema is owned exclusively by Alembic migrations
    (the ``migrate`` compose service runs ``alembic upgrade head``);
    this command never creates tables.
    """
    from app import engine as game_engine
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        result = seed(db)
        event = game_engine.open_event(db)
        prizes = game_engine.seed_prizes(db, event.id)
        result["event_open"] = event.state.value
        result["prizes_seeded"] = prizes
        print(json.dumps(result, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    seed_command()
