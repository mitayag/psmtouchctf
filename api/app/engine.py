import csv
import hashlib
import io
import json
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.config import get_settings

STANDARD_DURATION = 180


def utcnow() -> datetime:
    """Return a naive UTC datetime for database compatibility.

    All datetimes in the database are stored as naive UTC. API responses
    serialize them with an explicit 'Z' suffix so clients interpret them
    as UTC.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def utcnow_aware() -> datetime:
    """Return a timezone-aware UTC datetime for API serialization."""
    return datetime.now(timezone.utc)


def generate_alias() -> str:
    adjectives = ["Cyber", "Byte", "Net", "Pixel", "Logic", "Quantum", "Neon", "Shadow"]
    nouns = ["Pilot", "Runner", "Ghost", "Hunter", "Ninja", "Raider", "Fox", "Bandit"]
    return f"{secrets.choice(adjectives)}{secrets.choice(nouns)}{secrets.randbelow(900)+100}"


def hash_credential(credential: str) -> str:
    return hashlib.sha256(credential.encode()).hexdigest()


def ensure_event(db: Session) -> models.Event:
    event = db.query(models.Event).filter(models.Event.state == models.EventState.open).first()
    if event:
        return event
    event = db.query(models.Event).first()
    if event:
        return event
    ruleset = models.Ruleset(
        event_id="",  # will be set after event creation
        revision=1,
        duration_seconds=STANDARD_DURATION,
        extended_duration_seconds=300,
        max_attempts=2,
        hint_penalty=25,
        base_points=100,
        wrong_attempt_penalty=10,
        capture_bonus=100,
        qualification_solves_required=2,
    )
    event = models.Event(
        id=str(uuid.uuid4()),
        name="PSM TouchCTF Sample Event",
        state=models.EventState.draft,
        active_ruleset_id=ruleset.id,
    )
    ruleset.event_id = event.id
    db.add(event)
    db.add(ruleset)
    db.commit()
    db.refresh(event)
    return event


def ensure_kiosk(db: Session, event_id: str, credential: str, label: str = "Kiosk 1") -> models.Kiosk:
    hashed = hash_credential(credential)
    kiosk = db.query(models.Kiosk).filter(
        models.Kiosk.event_id == event_id,
        models.Kiosk.credential_hash == hashed,
    ).first()
    if not kiosk:
        kiosk = models.Kiosk(
            id=str(uuid.uuid4()),
            event_id=event_id,
            label=label,
            credential_hash=hashed,
        )
        db.add(kiosk)
        db.commit()
        db.refresh(kiosk)
    return kiosk


def open_event(db: Session) -> models.Event:
    event = ensure_event(db)
    if event.state != models.EventState.open:
        event.state = models.EventState.open
        db.commit()
        db.refresh(event)
    return event


def get_published_ruleset(db: Session, event_id: str) -> models.Ruleset:
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event or not event.active_ruleset_id:
        raise ValueError("Event has no active ruleset")
    ruleset = db.query(models.Ruleset).filter(models.Ruleset.id == event.active_ruleset_id).first()
    if not ruleset:
        raise ValueError("Active ruleset not found")
    return ruleset


def normalize_answer(kind: str, answer: Any, validator: dict[str, Any]) -> tuple[bool, Any]:
    """Returns (is_valid_shape, normalized_answer)."""
    if kind == "decode":
        if not isinstance(answer, str):
            return False, None
        return True, answer.strip()
    if kind in ("phishing", "logs"):
        if not isinstance(answer, list):
            return False, None
        normalized = []
        for item in answer:
            if not isinstance(item, str):
                return False, None
            normalized.append(item.strip().lower())
        return True, sorted(normalized)
    return False, None


def check_answer(kind: str, normalized: Any, validator: dict[str, Any]) -> bool:
    if kind == "decode":
        correct = str(validator.get("answer", "")).strip().lower()
        return normalized and normalized.lower() == correct
    if kind in ("phishing", "logs"):
        correct = sorted([str(x).strip().lower() for x in validator.get("correct_ids", [])])
        return normalized == correct
    return False


def get_or_create_pool(
    db: Session,
    event_id: str,
    ruleset_id: str,
    challenge_type: models.ChallengeType,
    published_revision_ids: list[str],
) -> models.ChallengePool:
    pool = (
        db.query(models.ChallengePool)
        .filter(
            models.ChallengePool.event_id == event_id,
            models.ChallengePool.ruleset_id == ruleset_id,
            models.ChallengePool.challenge_type == challenge_type,
        )
        .with_for_update()
        .first()
    )
    if not pool:
        # Create shuffled pool
        ids = published_revision_ids[:]
        secrets.SystemRandom().shuffle(ids)
        pool = models.ChallengePool(
            id=str(uuid.uuid4()),
            event_id=event_id,
            ruleset_id=ruleset_id,
            challenge_type=challenge_type,
            pool=ids,
            consumed=[],
        )
        db.add(pool)
        db.flush()
    else:
        # The published set can change after the pool was created (seed
        # unpublishes old revisions and publishes new ones). Drop stale IDs
        # and backfill missing published IDs so assignment never references
        # an unpublished revision.
        valid = set(published_revision_ids)
        cleaned_pool = [rid for rid in (pool.pool or []) if rid in valid]
        cleaned_consumed = [rid for rid in (pool.consumed or []) if rid in valid]
        present = set(cleaned_pool) | set(cleaned_consumed)
        missing = [rid for rid in published_revision_ids if rid not in present]
        stale = (
            len(cleaned_pool) != len(pool.pool or [])
            or len(cleaned_consumed) != len(pool.consumed or [])
            or (pool.last_assigned_revision_id and pool.last_assigned_revision_id not in valid)
            or any(rid not in valid for rid in (pool.recently_assigned or []))
        )
        if missing or stale:
            pool.pool = cleaned_pool + missing
            pool.consumed = cleaned_consumed
            if missing or not cleaned_pool:
                secrets.SystemRandom().shuffle(pool.pool)
            if pool.last_assigned_revision_id and pool.last_assigned_revision_id not in valid:
                pool.last_assigned_revision_id = None
            if pool.recently_assigned:
                pool.recently_assigned = [rid for rid in pool.recently_assigned if rid in valid] or None
            db.flush()
    return pool


def pop_pool_assignment(pool: models.ChallengePool) -> str:
    """Pop the next revision id from the pool, reshuffling if needed and avoiding recent repeats."""
    if not pool.pool:
        # Reshuffle consumed back into pool
        ids = pool.consumed[:]
        secrets.SystemRandom().shuffle(ids)
        pool.pool = ids
        pool.consumed = []
    if not pool.pool:
        raise ValueError(f"Empty challenge pool for {pool.challenge_type}")

    chosen = pool.pool.pop(0)

    # Avoid recent repeats: if chosen was recently assigned, try the next one
    recent = pool.recently_assigned or []
    attempts = 0
    while chosen in recent and pool.pool and attempts < len(pool.pool):
        # Put it back and try the next one
        pool.pool.append(chosen)
        chosen = pool.pool.pop(0)
        attempts += 1

    # Update recently-assigned ring buffer (keep last 3)
    recently = list(recent)
    recently.append(chosen)
    pool.recently_assigned = recently[-3:]

    pool.consumed.append(chosen)
    pool.last_assigned_revision_id = chosen
    return chosen


def select_challenges(db: Session, event_id: str, ruleset_id: str) -> list[models.ChallengeRevision]:
    """Select one of each challenge type in random order."""
    selected: list[models.ChallengeRevision] = []
    for ctype in (models.ChallengeType.phishing, models.ChallengeType.logs, models.ChallengeType.decode):
        revisions = (
            db.query(models.ChallengeRevision)
            .join(models.Challenge)
            .filter(
                models.Challenge.challenge_type == ctype,
                models.ChallengeRevision.published == True,
            )
            .all()
        )
        if len(revisions) < 1:
            raise ValueError(f"No published challenges of type {ctype}")
        revision_ids = [r.id for r in revisions]
        pool = get_or_create_pool(db, event_id, ruleset_id, ctype, revision_ids)
        chosen_id = pop_pool_assignment(pool)
        chosen = next((r for r in revisions if r.id == chosen_id), None)
        if chosen is None:
            # Should be unreachable after pool reconciliation; surface as a
            # retryable client error instead of StopIteration → 500.
            raise ValueError("Challenge pool referenced an unpublished revision; please retry.")
        selected.append(chosen)
    # Randomize presentation order
    secrets.SystemRandom().shuffle(selected)
    return selected


def start_session(
    db: Session,
    event_id: str,
    ruleset_id: str,
    kiosk_id: str,
    alias: str | None,
    publish_consent: bool,
    accessibility_mode: str,
) -> models.GameSession:
    # Idempotency: one active session per kiosk (ready, prepared, or active)
    active_states = [models.GameSessionState.ready, models.GameSessionState.prepared, models.GameSessionState.active]
    existing = (
        db.query(models.GameSession)
        .filter(
            models.GameSession.kiosk_id == kiosk_id,
            models.GameSession.state.in_(active_states),
        )
        .order_by(models.GameSession.created_at.desc())
        .first()
    )
    if existing:
        return existing

    ruleset = db.query(models.Ruleset).filter(models.Ruleset.id == ruleset_id).first()
    if not ruleset:
        raise ValueError("Ruleset not found")

    selected = select_challenges(db, event_id, ruleset_id)

    session = models.GameSession(
        id=str(uuid.uuid4()),
        event_id=event_id,
        kiosk_id=kiosk_id,
        ruleset_id=ruleset_id,
        alias=(alias.strip() if alias else generate_alias()),
        publish_consent=publish_consent,
        accessibility_mode=accessibility_mode,
        state=models.GameSessionState.ready,
    )
    db.add(session)
    db.flush()

    for position, revision in enumerate(selected, start=1):
        sc = models.SessionChallenge(
            id=str(uuid.uuid4()),
            session_id=session.id,
            position=position,
            challenge_revision_id=revision.id,
        )
        db.add(sc)

    db.commit()
    db.refresh(session)
    return session


def begin_round(db: Session, session: models.GameSession) -> models.GameSession:
    """Called when countdown finishes; starts the game timer.

    Idempotent: if the session is already active, returns it without resetting
    the timer.  If the session is prepared, transitions to active with fresh
    start/expiry timestamps.  If ready, transitions through prepared → active.
    """
    if session.state == models.GameSessionState.active:
        # Already started — return as-is so retries never reset the timer.
        return session

    if session.state not in (models.GameSessionState.ready, models.GameSessionState.prepared):
        return session

    ruleset = session.ruleset
    duration = (
        ruleset.extended_duration_seconds
        if session.accessibility_mode == "extended-time"
        else ruleset.duration_seconds
    )
    now = utcnow()
    session.state = models.GameSessionState.active
    session.started_at = now
    session.expires_at = now + timedelta(seconds=duration)
    db.commit()
    db.refresh(session)
    return session


def prepare_session(db: Session, session: models.GameSession) -> models.GameSession:
    """Idempotent preparation step before countdown.

    Transitions ready → prepared.  If already prepared or active, returns
    the session unchanged.  The countdown consumes no game time.
    """
    if session.state in (models.GameSessionState.prepared, models.GameSessionState.active):
        return session
    if session.state != models.GameSessionState.ready:
        return session
    session.state = models.GameSessionState.prepared
    session.prepared_at = utcnow()
    db.commit()
    db.refresh(session)
    return session


def get_current_session_challenge(session: models.GameSession) -> models.SessionChallenge | None:
    for sc in session.challenges:
        if sc.outcome == models.Outcome.pending:
            return sc
    return None


def get_session_for_mutation(
    db: Session,
    session_id: str,
    kiosk_credential_hash: str,
) -> models.GameSession:
    session = (
        db.query(models.GameSession)
        .options(joinedload(models.GameSession.challenges).joinedload(models.SessionChallenge.revision))
        .join(models.Kiosk)
        .filter(
            models.GameSession.id == session_id,
            models.Kiosk.credential_hash == kiosk_credential_hash,
        )
        .first()
    )
    if not session:
        raise PermissionError("Session not found or unauthorized")
    return session


def check_expired(session: models.GameSession) -> bool:
    if session.expires_at and utcnow() >= session.expires_at:
        return True
    return False


def finalize_session(
    db: Session,
    session: models.GameSession,
    state: models.GameSessionState,
) -> None:
    if session.state in (models.GameSessionState.completed, models.GameSessionState.expired, models.GameSessionState.abandoned):
        return
    ruleset = session.ruleset
    duration_seconds = ruleset.duration_seconds
    elapsed_ms = int((utcnow() - session.started_at).total_seconds() * 1000) if session.started_at else 0
    elapsed_ms = max(0, min(elapsed_ms, duration_seconds * 1000))
    session.elapsed_ms = elapsed_ms
    session.state = state
    session.finalized_at = utcnow()

    # Compute final score
    total = sum(sc.awarded_points for sc in session.challenges)
    # No capture bonus/time bonus here; those are applied during capture
    session.score = total
    session.solved_count = sum(1 for sc in session.challenges if sc.outcome == models.Outcome.solved)

    # Entitlement
    existing = db.query(models.Entitlement).filter(models.Entitlement.session_id == session.id).first()
    if not existing:
        entitlement = models.Entitlement(
            id=str(uuid.uuid4()),
            session_id=session.id,
            state=models.EntitlementState.unqualified,
            reason="not_captured_or_insufficient_solves",
        )
        db.add(entitlement)
    db.commit()


def score_challenge(ruleset: models.Ruleset, wrong_attempts: int, hint_used: bool) -> int:
    return max(0, ruleset.base_points - ruleset.wrong_attempt_penalty * wrong_attempts - (ruleset.hint_penalty if hint_used else 0))


def submit_answer(
    db: Session,
    session: models.GameSession,
    answer: Any,
    idempotency_key: str,
) -> schemas.AnswerResponse:
    if session.state != models.GameSessionState.active:
        raise ValueError("Round is not active")
    if check_expired(session):
        finalize_session(db, session, models.GameSessionState.expired)
        raise ValueError("Round has expired")

    sc = get_current_session_challenge(session)
    if not sc:
        # All challenges finalized; should be on capture screen
        return schemas.AnswerResponse(correct=False, finished=True, attempts_remaining=0, score=session.score, feedback="All challenges completed.")

    # Check idempotency across all session challenges in case the challenge was already finalized
    existing_attempt = (
        db.query(models.Attempt)
        .join(models.SessionChallenge)
        .filter(
            models.SessionChallenge.session_id == session.id,
            models.Attempt.idempotency_key == idempotency_key,
        )
        .first()
    )
    if existing_attempt:
        # Return original response; reconstruct based on the finalized challenge state
        sc_existing = existing_attempt.session_challenge
        finished = sc_existing.outcome != models.Outcome.pending
        return schemas.AnswerResponse(
            correct=existing_attempt.correct,
            finished=finished,
            attempts_remaining=max(0, session.ruleset.max_attempts - sc_existing.attempts_count()),
            score=session.score,
        )

    ruleset = session.ruleset
    attempts_count = sc.attempts_count()
    if attempts_count >= ruleset.max_attempts:
        raise ValueError("No attempts remaining")

    validator = sc.revision.private_validator
    kind = sc.revision.challenge.challenge_type.value
    valid_shape, normalized = normalize_answer(kind, answer, validator)
    if not valid_shape:
        raise ValueError("Invalid answer format")

    correct = check_answer(kind, normalized, validator)

    # Record attempt
    ordinal = attempts_count + 1
    attempt = models.Attempt(
        id=str(uuid.uuid4()),
        session_challenge_id=sc.id,
        ordinal=ordinal,
        answer_summary=json.dumps(normalized)[:500],
        correct=correct,
        idempotency_key=idempotency_key,
    )
    db.add(attempt)

    feedback: str | None = None
    explanation: str | None = None

    if correct:
        wrong_attempts = ordinal - 1
        sc.outcome = models.Outcome.solved
        sc.awarded_points = score_challenge(ruleset, wrong_attempts, sc.hint_used)
        sc.finalized_at = utcnow()
        feedback = "Challenge solved"
        explanation = sc.revision.explanation
    else:
        if ordinal >= ruleset.max_attempts:
            sc.outcome = models.Outcome.failed
            sc.awarded_points = 0
            sc.finalized_at = utcnow()
            feedback = "No attempts remaining"
            explanation = sc.revision.explanation
        else:
            feedback = "Not quite — review the highlighted clue"

    # Recalculate session totals (without capture/time bonus)
    session.solved_count = sum(1 for c in session.challenges if c.outcome == models.Outcome.solved)
    session.score = sum(c.awarded_points for c in session.challenges)
    db.commit()

    remaining = max(0, ruleset.max_attempts - sc.attempts_count())
    finished = sc.outcome != models.Outcome.pending
    return schemas.AnswerResponse(
        correct=correct,
        finished=finished,
        attempts_remaining=remaining,
        score=session.score,
        feedback=feedback,
        explanation=explanation,
    )


def request_hint(
    db: Session,
    session: models.GameSession,
    idempotency_key: str,
) -> schemas.HintResponse:
    if session.state != models.GameSessionState.active:
        raise ValueError("Round is not active")
    if check_expired(session):
        finalize_session(db, session, models.GameSessionState.expired)
        raise ValueError("Round has expired")

    sc = get_current_session_challenge(session)
    if not sc:
        raise ValueError("No active challenge")
    if sc.hint_used:
        return schemas.HintResponse(hint=sc.revision.hint, score=session.score)

    existing = (
        db.query(models.IdempotencyRecord)
        .filter(
            models.IdempotencyRecord.scope == session.id,
            models.IdempotencyRecord.route == "hint",
            models.IdempotencyRecord.key == idempotency_key,
        )
        .first()
    )
    if existing:
        return schemas.HintResponse(hint=sc.revision.hint, score=session.score)

    sc.hint_used = True
    if sc.outcome == models.Outcome.solved:
        # Recalculate with hint penalty
        wrong_attempts = sum(1 for a in sc.attempts if not a.correct)
        sc.awarded_points = score_challenge(session.ruleset, wrong_attempts, True)
        session.score = sum(c.awarded_points for c in session.challenges)

    record = models.IdempotencyRecord(
        id=str(uuid.uuid4()),
        scope=session.id,
        route="hint",
        key=idempotency_key,
        request_hash="",
        response_status=200,
        response_body={},
    )
    db.add(record)
    db.commit()
    return schemas.HintResponse(hint=sc.revision.hint, score=session.score)


def skip_challenge(
    db: Session,
    session: models.GameSession,
    idempotency_key: str,
) -> schemas.SkipResponse:
    if session.state != models.GameSessionState.active:
        raise ValueError("Round is not active")
    if check_expired(session):
        finalize_session(db, session, models.GameSessionState.expired)
        raise ValueError("Round has expired")

    sc = get_current_session_challenge(session)
    if not sc:
        return schemas.SkipResponse(skipped=True, score=session.score)

    existing = (
        db.query(models.IdempotencyRecord)
        .filter(
            models.IdempotencyRecord.scope == session.id,
            models.IdempotencyRecord.route == "skip",
            models.IdempotencyRecord.key == idempotency_key,
        )
        .first()
    )
    if existing:
        return schemas.SkipResponse(skipped=True, score=session.score)

    sc.outcome = models.Outcome.skipped
    sc.awarded_points = 0
    sc.finalized_at = utcnow()
    session.score = sum(c.awarded_points for c in session.challenges)
    db.commit()
    return schemas.SkipResponse(skipped=True, score=session.score)


def capture_flag(
    db: Session,
    session: models.GameSession,
    flag: str | None,
    idempotency_key: str,
) -> schemas.CaptureResponse:
    if session.state != models.GameSessionState.active:
        raise ValueError("Round is not active")
    if check_expired(session):
        finalize_session(db, session, models.GameSessionState.expired)
        raise ValueError("Round has expired")

    # All challenges must be finalized
    pending = [sc for sc in session.challenges if sc.outcome == models.Outcome.pending]
    if pending:
        raise ValueError("All challenges must be completed before capture")

    solved = sum(1 for sc in session.challenges if sc.outcome == models.Outcome.solved)
    ruleset = session.ruleset
    if solved < ruleset.qualification_solves_required:
        finalize_session(db, session, models.GameSessionState.completed)
        return schemas.CaptureResponse(captured=False, score=session.score, qualified=False, time_bonus=0)

    # Build expected flag deterministically from session id.
    expected_flag = f"PSM{{{session.id.split('-')[0]}}}"

    # In Phase 2 the frontend does not construct the flag; it is assembled on
    # the server. If a flag is supplied we still validate it, but the canonical
    # capture path sends no flag body.
    submitted_flag = (flag or "").strip()
    if submitted_flag and submitted_flag != expected_flag:
        raise ValueError("Incorrect flag")


    # Idempotency for capture
    existing = (
        db.query(models.IdempotencyRecord)
        .filter(
            models.IdempotencyRecord.scope == session.id,
            models.IdempotencyRecord.route == "capture",
            models.IdempotencyRecord.key == idempotency_key,
        )
        .first()
    )
    if existing:
        return schemas.CaptureResponse(
            captured=True,
            score=session.score,
            qualified=True,
            time_bonus=existing.response_body.get("time_bonus", 0),
        )

    # Calculate time bonus
    remaining_seconds = max(0, (session.expires_at - utcnow()).total_seconds())
    remaining_seconds = min(remaining_seconds, ruleset.duration_seconds)
    time_bonus = int(100 * remaining_seconds / ruleset.duration_seconds)

    session.score += ruleset.capture_bonus + time_bonus
    session.state = models.GameSessionState.completed
    session.finalized_at = utcnow()
    session.elapsed_ms = int((ruleset.duration_seconds - remaining_seconds) * 1000)
    session.solved_count = solved

    entitlement = models.Entitlement(
        id=str(uuid.uuid4()),
        session_id=session.id,
        state=models.EntitlementState.qualified,
        qualified_at=utcnow(),
        reason="qualified",
    )
    db.add(entitlement)

    record = models.IdempotencyRecord(
        id=str(uuid.uuid4()),
        scope=session.id,
        route="capture",
        key=idempotency_key,
        request_hash="",
        response_status=200,
        response_body={"time_bonus": time_bonus},
    )
    db.add(record)
    db.commit()
    return schemas.CaptureResponse(
        captured=True,
        score=session.score,
        qualified=True,
        time_bonus=time_bonus,
    )


def abandon_session(
    db: Session,
    session: models.GameSession,
    idempotency_key: str,
) -> bool:
    existing = (
        db.query(models.IdempotencyRecord)
        .filter(
            models.IdempotencyRecord.scope == session.id,
            models.IdempotencyRecord.route == "abandon",
            models.IdempotencyRecord.key == idempotency_key,
        )
        .first()
    )
    if existing:
        return True

    finalize_session(db, session, models.GameSessionState.abandoned)
    record = models.IdempotencyRecord(
        id=str(uuid.uuid4()),
        scope=session.id,
        route="abandon",
        key=idempotency_key,
        request_hash="",
        response_status=200,
        response_body={},
    )
    db.add(record)
    db.commit()
    return True


def get_results(db: Session, session: models.GameSession) -> schemas.ResultsOut:
    breakdown = {
        "challenge_points": sum(sc.awarded_points for sc in session.challenges),
        "capture_bonus": 0,
        "time_bonus": 0,
        "deductions": [],
    }
    captured = session.state == models.GameSessionState.completed and session.score > sum(sc.awarded_points for sc in session.challenges)
    if captured:
        # We don't store capture/time bonus separately; recompute if possible
        ruleset = session.ruleset
        breakdown["capture_bonus"] = ruleset.capture_bonus
        elapsed_s = session.elapsed_ms / 1000
        remaining_s = max(0, ruleset.duration_seconds - elapsed_s)
        breakdown["time_bonus"] = int(100 * remaining_s / ruleset.duration_seconds)

    entitlement = db.query(models.Entitlement).filter(models.Entitlement.session_id == session.id).first()
    return schemas.ResultsOut(
        id=session.id,
        alias=session.alias,
        state=session.state.value,
        score=session.score,
        solved_count=session.solved_count,
        captured=captured,
        qualified=entitlement.state == models.EntitlementState.qualified if entitlement else False,
        elapsed_ms=session.elapsed_ms,
        breakdown=breakdown,
        entitlement_id=entitlement.id if entitlement else None,
    )


def to_public_challenge(sc: models.SessionChallenge) -> schemas.ChallengePublic:
    rev = sc.revision
    data = dict(rev.public_data)
    # Inject any UI-specific position info without leaking answers
    return schemas.ChallengePublic(
        id=rev.id,
        position=sc.position,
        type=rev.challenge.challenge_type.value,
        title=rev.title,
        instruction=rev.instruction,
        hint=rev.hint if sc.hint_used else None,
        hint_used=sc.hint_used,
        outcome=sc.outcome.value,
        data=data,
    )


def to_session_out(session: models.GameSession) -> schemas.SessionOut:
    current = get_current_session_challenge(session)
    return schemas.SessionOut(
        id=session.id,
        alias=session.alias,
        state=session.state.value,
        score=session.score,
        solved_count=session.solved_count,
        prepared_at=session.prepared_at,
        started_at=session.started_at,
        expires_at=session.expires_at,
        server_now=utcnow_aware(),
        elapsed_ms=session.elapsed_ms,
        qualified=session.entitlement.state == models.EntitlementState.qualified if session.entitlement else False,
        current_position=current.position if current else None,
        challenges=[to_public_challenge(sc) for sc in session.challenges],
    )


def reconcile_expired_sessions(db: Session) -> int:
    now = utcnow()
    sessions = (
        db.query(models.GameSession)
        .filter(
            models.GameSession.state == models.GameSessionState.active,
            models.GameSession.expires_at <= now,
        )
        .all()
    )
    count = 0
    for session in sessions:
        finalize_session(db, session, models.GameSessionState.expired)
        count += 1
    return count


# ──────────────────────────────────────────────────────────────────
# Phase 3: Prize allocation, weighted draws, claim codes, staff
# ──────────────────────────────────────────────────────────────────

STAFF_TOKEN_KEY = "touchctf-staff-token"

# Characters for claim codes — excludes visually confusing chars
CLAIM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_claim_code() -> str:
    """Generate a 12-char claim code in XXXX-XXXX-XXXX format."""
    parts = []
    for _ in range(3):
        part = "".join(secrets.choice(CLAIM_ALPHABET) for _ in range(4))
        parts.append(part)
    return "-".join(parts)


def hash_claim_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def hash_staff_password(password: str) -> str:
    salt = "touchctf-staff-v1"
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()


def get_eligible_prizes(db: Session, event_id: str) -> list[tuple[models.Prize, int]]:
    """Return (prize, available_stock) for all eligible prizes.

    Eligible = active, weight > 0, and available stock > 0.
    """
    prizes = (
        db.query(models.Prize)
        .filter(
            models.Prize.event_id == event_id,
            models.Prize.active == True,
            models.Prize.archived == False,
            models.Prize.weight > 0,
        )
        .order_by(models.Prize.display_order)
        .all()
    )
    eligible = []
    for prize in prizes:
        inv = (
            db.query(models.PrizeInventory)
            .filter(models.PrizeInventory.prize_id == prize.id)
            .with_for_update()
            .first()
        )
        if inv and inv.available > 0:
            eligible.append((prize, inv.available))
    return eligible


def draw_prize(
    db: Session,
    event_id: str,
    session: models.GameSession,
    entitlement: models.Entitlement,
) -> schemas.SpinResponse:
    """Execute a full prize draw within a single transaction.

    Steps:
    1. Validate ownership and entitlement
    2. Check for existing award (idempotent)
    3. Serialize inventory changes
    4. Read eligible stock and weights
    5. Select a prize using weighted random
    6. Reserve one unit
    7. Persist the award and draw snapshot
    8. Mark the entitlement as awarded
    9. Commit everything together
    """
    # 1. Validate entitlement
    if entitlement.state != models.EntitlementState.qualified:
        return schemas.SpinResponse(award=None, message="Not eligible for a prize spin")
    if not entitlement.qualified_at:
        return schemas.SpinResponse(award=None, message="Entitlement not activated")

    # 2. Check for existing award (idempotent return)
    existing_award = (
        db.query(models.Award)
        .filter(
            models.Award.session_id == session.id,
            models.Award.status.in_([
                models.AwardState.awarded,
                models.AwardState.redeemed,
            ]),
        )
        .first()
    )
    if existing_award:
        prize = db.query(models.Prize).filter(models.Prize.id == existing_award.prize_id).first()
        return schemas.SpinResponse(
            award=_award_to_out(existing_award, prize),
            message="Award already issued",
        )

    # 3. Void any previous voided awards for this session
    # (shouldn't exist but be safe)
    voided = (
        db.query(models.Award)
        .filter(
            models.Award.session_id == session.id,
            models.Award.status == models.AwardState.voided,
        )
        .all()
    )
    for v in voided:
        # Release reserved stock
        inv = db.query(models.PrizeInventory).filter(
            models.PrizeInventory.prize_id == v.prize_id
        ).with_for_update().first()
        if inv and inv.stock_reserved > 0:
            inv.stock_reserved = max(0, inv.stock_reserved - 1)
        db.delete(v)

    # 4. Get eligible prizes
    eligible = get_eligible_prizes(db, event_id)
    if not eligible:
        db.commit()
        return schemas.SpinResponse(award=None, message="No prizes currently available", no_stock=True)

    # 5. Weighted random selection
    total_weight = sum(w for _, w in eligible)
    if total_weight <= 0:
        db.commit()
        return schemas.SpinResponse(award=None, message="No prizes currently available", no_stock=True)

    # Use cryptographic randomness
    roll = secrets.randbelow(total_weight)
    cumulative = 0
    selected_prize = eligible[0][0]
    for prize, weight in eligible:
        cumulative += weight
        if roll < cumulative:
            selected_prize = prize
            break

    # 6. Reserve one unit
    inv = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == selected_prize.id
    ).with_for_update().first()
    if not inv or inv.available <= 0:
        # Race condition: stock ran out between query and now
        db.commit()
        return schemas.SpinResponse(award=None, message="No prizes currently available", no_stock=True)
    inv.stock_reserved += 1

    # 7. Compute segment index from eligible prizes (for wheel animation)
    eligible_ids = [p.id for p, _ in eligible]
    segment_index = 0
    if selected_prize.id in eligible_ids:
        segment_index = eligible_ids.index(selected_prize.id)

    # 8. Generate claim code
    claim_code = generate_claim_code()
    claim_hash = hash_claim_code(claim_code)

    # 9. Build draw snapshot
    draw_snapshot = {
        "eligible_prizes": [
            {"id": p.id, "name": p.short_label, "weight": w, "available": inv.available if p.id == selected_prize.id else None}
            for p, w in eligible
        ],
        "total_weight": total_weight,
        "roll": roll,
        "selected_prize_id": selected_prize.id,
        "selected_prize_name": selected_prize.short_label,
        "timestamp": utcnow().isoformat(),
    }

    # 10. Create award
    award = models.Award(
        id=str(uuid.uuid4()),
        event_id=event_id,
        session_id=session.id,
        entitlement_id=entitlement.id,
        prize_id=selected_prize.id,
        claim_code=claim_code,
        claim_code_hash=claim_hash,
        segment_index=segment_index,
        status=models.AwardState.awarded,
        draw_snapshot=draw_snapshot,
        created_at=utcnow(),
    )
    db.add(award)

    # 11. Mark entitlement as awarded
    entitlement.state = models.EntitlementState.qualified

    # 12. Audit log
    audit = models.AuditLog(
        id=str(uuid.uuid4()),
        actor_id=session.id,
        actor_type="player",
        action="spin_award",
        entity_type="award",
        entity_id=award.id,
        details={"prize_id": selected_prize.id, "claim_code": claim_code},
    )
    db.add(audit)

    db.commit()
    db.refresh(award)

    return schemas.SpinResponse(
        award=_award_to_out(award, selected_prize),
        message=f"You won {selected_prize.name}!",
    )


def _award_to_out(award: models.Award, prize: models.Prize | None) -> schemas.AwardOut:
    return schemas.AwardOut(
        id=award.id,
        prize_id=award.prize_id,
        prize_name=prize.name if prize else "Unknown",
        prize_icon=prize.icon if prize else "🎁",
        prize_color=prize.color if prize else None,
        claim_code=award.claim_code,
        segment_index=award.segment_index,
        status=award.status.value,
        created_at=award.created_at,
    )


def get_award_by_session(db: Session, session_id: str) -> models.Award | None:
    """Retrieve the active or redeemed award for a session."""
    return (
        db.query(models.Award)
        .filter(
            models.Award.session_id == session_id,
            models.Award.status.in_([
                models.AwardState.awarded,
                models.AwardState.redeemed,
            ]),
        )
        .first()
    )


def get_wheel_prizes(db: Session, event_id: str) -> list[dict[str, Any]]:
    """Return prize data for rendering the wheel (all active prizes)."""
    prizes = (
        db.query(models.Prize)
        .filter(
            models.Prize.event_id == event_id,
            models.Prize.active == True,
            models.Prize.archived == False,
        )
        .order_by(models.Prize.display_order)
        .all()
    )
    return [
        {
            "id": p.id,
            "label": p.name,
            "shortLabel": p.short_label,
            "icon": p.icon,
            "weight": p.weight,
            "active": p.active,
            "color": p.color or "#20E3FF",
            "available": p.inventory.available if p.inventory else 0,
        }
        for p in prizes
    ]


def seed_prizes(db: Session, event_id: str) -> int:
    """Seed test prizes and inventory. Returns number of prizes created.

    Non-destructive: skips if prizes already exist for this event.
    """
    existing = db.query(models.Prize).filter(models.Prize.event_id == event_id).count()
    if existing > 0:
        return 0

    prize_configs = [
        {"name": "Sticker Pack", "short_label": "STICKER PACK", "icon": "🃏", "weight": 60, "color": "#20E3FF", "stock": 120, "order": 1},
        {"name": "Enamel Pin", "short_label": "ENAMEL PIN", "icon": "⭐", "weight": 30, "color": "#A98BFF", "stock": 40, "order": 2},
        {"name": "PSM T-Shirt", "short_label": "PSM T-SHIRT", "icon": "👕", "weight": 10, "color": "#FF4FD8", "stock": 20, "order": 3},
        {"name": "Cybersecurity E-Book", "short_label": "CYBER E-BOOK", "icon": "📖", "weight": 20, "color": "#20E3FF", "stock": 999, "order": 4},
        {"name": "Mystery Prize", "short_label": "MYSTERY PRIZE", "icon": "❓", "weight": 10, "color": "#FF4FD8", "stock": 10, "order": 5},
        {"name": "Grand Prize", "short_label": "GRAND PRIZE", "icon": "🎁", "weight": 5, "color": "#FFD700", "stock": 2, "order": 6},
    ]

    count = 0
    for cfg in prize_configs:
        prize = models.Prize(
            id=str(uuid.uuid4()),
            event_id=event_id,
            name=cfg["name"],
            short_label=cfg["short_label"],
            icon=cfg["icon"],
            description=cfg["name"],
            weight=cfg["weight"],
            active=True,
            display_order=cfg["order"],
            color=cfg["color"],
        )
        inv = models.PrizeInventory(
            id=str(uuid.uuid4()),
            prize_id=prize.id,
            stock_received=cfg["stock"],
            stock_reserved=0,
            stock_redeemed=0,
        )
        db.add(prize)
        db.add(inv)
        count += 1

    db.commit()
    return count


def staff_authenticate(db: Session, username: str, password: str) -> models.StaffUser | None:
    """Authenticate a staff user. Returns the user if valid, None otherwise."""
    user = db.query(models.StaffUser).filter(
        models.StaffUser.username == username,
        models.StaffUser.active == True,
    ).first()
    if not user:
        return None
    if user.password_hash != hash_staff_password(password):
        return None
    user.last_login_at = utcnow()
    db.commit()
    return user


def staff_lookup_claim(db: Session, claim_code: str) -> schemas.ClaimLookupResponse | None:
    """Look up a claim by code. Returns None if not found."""
    code = claim_code.strip().upper()
    award = (
        db.query(models.Award)
        .filter(models.Award.claim_code == code)
        .first()
    )
    if not award:
        return None

    prize = db.query(models.Prize).filter(models.Prize.id == award.prize_id).first()
    session = db.query(models.GameSession).filter(models.GameSession.id == award.session_id).first()

    return schemas.ClaimLookupResponse(
        award_id=award.id,
        claim_code=award.claim_code,
        prize_name=prize.name if prize else "Unknown",
        prize_icon=prize.icon if prize else "🎁",
        status=award.status.value,
        player_alias=session.alias if session else "Unknown",
        awarded_at=award.created_at,
        redeemed_at=award.redeemed_at,
    )


def staff_redeem_claim(
    db: Session,
    claim_code: str,
    staff_user_id: str,
) -> schemas.RedeemResponse:
    """Redeem a claim code. Idempotent — returns success if already redeemed."""
    code = claim_code.strip().upper()
    award = (
        db.query(models.Award)
        .filter(models.Award.claim_code == code)
        .first()
    )
    if not award:
        return schemas.RedeemResponse(
            success=False,
            message="Claim code not found",
            claim_code=code,
            prize_name="",
        )

    if award.status == models.AwardState.redeemed:
        prize = db.query(models.Prize).filter(models.Prize.id == award.prize_id).first()
        return schemas.RedeemResponse(
            success=True,
            message="Already redeemed",
            claim_code=award.claim_code,
            prize_name=prize.name if prize else "Unknown",
        )

    if award.status in (models.AwardState.expired, models.AwardState.voided):
        return schemas.RedeemResponse(
            success=False,
            message=f"Claim is {award.status.value}",
            claim_code=award.claim_code,
            prize_name="",
        )

    # Redeem: move reserved → redeemed
    inv = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == award.prize_id
    ).with_for_update().first()
    if inv:
        inv.stock_reserved = max(0, inv.stock_reserved - 1)
        inv.stock_redeemed += 1

    award.status = models.AwardState.redeemed
    award.redeemed_at = utcnow()
    award.redeemed_by = staff_user_id

    prize = db.query(models.Prize).filter(models.Prize.id == award.prize_id).first()

    # Audit
    audit = models.AuditLog(
        id=str(uuid.uuid4()),
        actor_id=staff_user_id,
        actor_type="staff",
        action="redeem_claim",
        entity_type="award",
        entity_id=award.id,
        details={"claim_code": award.claim_code, "prize_id": award.prize_id},
    )
    db.add(audit)
    db.commit()

    return schemas.RedeemResponse(
        success=True,
        message="Prize handed over successfully",
        claim_code=award.claim_code,
        prize_name=prize.name if prize else "Unknown",
    )


def staff_void_claim(
    db: Session,
    award_id: str,
    staff_user_id: str,
    reason: str,
) -> schemas.RedeemResponse:
    """Void an award. Only administrators can void."""
    award = db.query(models.Award).filter(models.Award.id == award_id).first()
    if not award:
        return schemas.RedeemResponse(
            success=False, message="Award not found",
            claim_code="", prize_name="",
        )

    if award.status == models.AwardState.voided:
        return schemas.RedeemResponse(
            success=True, message="Already voided",
            claim_code=award.claim_code, prize_name="",
        )

    if award.status == models.AwardState.redeemed:
        return schemas.RedeemResponse(
            success=False, message="Cannot void a redeemed award",
            claim_code=award.claim_code, prize_name="",
        )

    # Release reserved stock
    inv = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == award.prize_id
    ).with_for_update().first()
    if inv and inv.stock_reserved > 0:
        inv.stock_reserved = max(0, inv.stock_reserved - 1)

    award.status = models.AwardState.voided

    audit = models.AuditLog(
        id=str(uuid.uuid4()),
        actor_id=staff_user_id,
        actor_type="staff",
        action="void_claim",
        entity_type="award",
        entity_id=award.id,
        details={"reason": reason, "claim_code": award.claim_code},
    )
    db.add(audit)
    db.commit()

    return schemas.RedeemResponse(
        success=True, message="Award voided",
        claim_code=award.claim_code, prize_name="",
    )


def staff_list_outstanding_claims(db: Session) -> list[schemas.ClaimLookupResponse]:
    """List all awarded (not yet redeemed) claims."""
    awards = (
        db.query(models.Award)
        .filter(models.Award.status == models.AwardState.awarded)
        .order_by(models.Award.created_at.desc())
        .all()
    )
    results = []
    for award in awards:
        prize = db.query(models.Prize).filter(models.Prize.id == award.prize_id).first()
        session = db.query(models.GameSession).filter(models.GameSession.id == award.session_id).first()
        results.append(schemas.ClaimLookupResponse(
            award_id=award.id,
            claim_code=award.claim_code,
            prize_name=prize.name if prize else "Unknown",
            prize_icon=prize.icon if prize else "🎁",
            status=award.status.value,
            player_alias=session.alias if session else "Unknown",
            awarded_at=award.created_at,
            redeemed_at=award.redeemed_at,
        ))
    return results


def staff_list_prizes_with_inventory(db: Session, event_id: str) -> list[schemas.PrizeInventoryOut]:
    """List all prizes with their inventory status."""
    prizes = (
        db.query(models.Prize)
        .filter(models.Prize.event_id == event_id)
        .order_by(models.Prize.display_order)
        .all()
    )
    results = []
    for prize in prizes:
        inv = db.query(models.PrizeInventory).filter(
            models.PrizeInventory.prize_id == prize.id
        ).first()
        results.append(schemas.PrizeInventoryOut(
            prize_id=prize.id,
            name=prize.name,
            short_label=prize.short_label,
            icon=prize.icon,
            weight=prize.weight,
            active=prize.active,
            color=prize.color,
            stock_received=inv.stock_received if inv else 0,
            stock_reserved=inv.stock_reserved if inv else 0,
            stock_redeemed=inv.stock_redeemed if inv else 0,
            available=inv.available if inv else 0,
        ))
    return results


def get_staff_user(db: Session, user_id: str) -> models.StaffUser | None:
    return db.query(models.StaffUser).filter(
        models.StaffUser.id == user_id,
        models.StaffUser.active == True,
    ).first()


def create_staff_user(db: Session, username: str, password: str, role: str = "staff") -> models.StaffUser:
    """Create a new staff user. Called by the bootstrap command."""
    existing = db.query(models.StaffUser).filter(
        models.StaffUser.username == username
    ).first()
    if existing:
        raise ValueError(f"Staff user '{username}' already exists")

    user = models.StaffUser(
        id=str(uuid.uuid4()),
        username=username,
        password_hash=hash_staff_password(password),
        role=models.StaffRole(role),
        active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ──────────────────────────────────────────────────────────────────
# Phase 4: Administration engine functions
# ──────────────────────────────────────────────────────────────────


def _get_hidden_session_ids(db: Session) -> set[str]:
    """Return session IDs hidden via audit log moderation."""
    rows = (
        db.query(models.AuditLog.entity_id)
        .filter(
            models.AuditLog.action.in_(["hide_leaderboard"]),
            models.AuditLog.entity_type == "session",
        )
        .all()
    )
    return {r[0] for r in rows if r[0]}


def _get_shown_session_ids(db: Session) -> set[str]:
    """Return session IDs explicitly shown again via audit log."""
    rows = (
        db.query(models.AuditLog.entity_id)
        .filter(
            models.AuditLog.action == "show_leaderboard",
            models.AuditLog.entity_type == "session",
        )
        .all()
    )
    return {r[0] for r in rows if r[0]}


def _is_moderated(db: Session, session_id: str) -> bool:
    """Check if a session is hidden via leaderboard moderation."""
    hidden = _get_hidden_session_ids(db)
    shown = _get_shown_session_ids(db)
    return session_id in hidden and session_id not in shown


# ─── 1. Admin Stats ──────────────────────────────────────────────


def admin_get_stats(db: Session) -> dict:
    """Return overview statistics for the admin dashboard."""
    total_sessions = db.query(func.count(models.GameSession.id)).scalar() or 0

    active_sessions = (
        db.query(func.count(models.GameSession.id))
        .filter(models.GameSession.state == models.GameSessionState.active)
        .scalar()
        or 0
    )
    completed_sessions = (
        db.query(func.count(models.GameSession.id))
        .filter(models.GameSession.state == models.GameSessionState.completed)
        .scalar()
        or 0
    )
    expired_sessions = (
        db.query(func.count(models.GameSession.id))
        .filter(models.GameSession.state == models.GameSessionState.expired)
        .scalar()
        or 0
    )
    abandoned_sessions = (
        db.query(func.count(models.GameSession.id))
        .filter(models.GameSession.state == models.GameSessionState.abandoned)
        .scalar()
        or 0
    )

    total_players = (
        db.query(func.count(func.distinct(models.GameSession.alias)))
        .filter(models.GameSession.publish_consent == True)
        .scalar()
        or 0
    )

    prizes_awarded = (
        db.query(func.count(models.Award.id))
        .filter(models.Award.status.in_([models.AwardState.awarded, models.AwardState.redeemed]))
        .scalar()
        or 0
    )
    pending_claims = (
        db.query(func.count(models.Award.id))
        .filter(models.Award.status == models.AwardState.awarded)
        .scalar()
        or 0
    )
    outstanding = pending_claims  # same meaning

    total_solved = (
        db.query(func.count(models.SessionChallenge.id))
        .filter(models.SessionChallenge.outcome == models.Outcome.solved)
        .scalar()
        or 0
    )
    total_attempts = db.query(func.count(models.Attempt.id)).scalar() or 0
    hints_used = (
        db.query(func.count(models.SessionChallenge.id))
        .filter(models.SessionChallenge.hint_used == True)
        .scalar()
        or 0
    )

    # captures = completed sessions where score > sum of challenge_points across all revisions
    captures = (
        db.query(func.count(models.GameSession.id))
        .filter(models.GameSession.state == models.GameSessionState.completed)
        .scalar()
        or 0
    )

    return {
        "total_sessions": total_sessions,
        "active_sessions": active_sessions,
        "completed_sessions": completed_sessions,
        "expired_sessions": expired_sessions,
        "abandoned_sessions": abandoned_sessions,
        "total_players": total_players,
        "prizes_awarded": prizes_awarded,
        "pending_claims": pending_claims,
        "outstanding": outstanding,
        "total_solved": total_solved,
        "total_attempts": total_attempts,
        "hints_used": hints_used,
        "captures": captures,
    }


# ─── 2. Sessions List ────────────────────────────────────────────


def admin_list_sessions(
    db: Session,
    search: str | None = None,
    state: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """List sessions with optional search and state filter."""
    q = db.query(models.GameSession)

    if search:
        pattern = f"%{search}%"
        q = q.filter(
            models.GameSession.alias.ilike(pattern)
            | models.GameSession.id.ilike(pattern)
        )
    if state:
        q = q.filter(models.GameSession.state == state)

    q = q.order_by(models.GameSession.created_at.desc()).offset(offset).limit(limit)
    sessions = q.all()

    results = []
    for s in sessions:
        award = db.query(models.Award).filter(models.Award.session_id == s.id).first()
        results.append({
            "id": s.id,
            "alias": s.alias,
            "state": s.state.value if hasattr(s.state, "value") else s.state,
            "score": s.score,
            "solved_count": s.solved_count,
            "elapsed_ms": s.elapsed_ms,
            "publish_consent": s.publish_consent,
            "kiosk_id": s.kiosk_id,
            "created_at": s.created_at,
            "started_at": s.started_at,
            "finalized_at": s.finalized_at,
            "award_status": award.status.value if award and hasattr(award.status, "value") else (award.status if award else None),
            "award_prize_name": award.prize.name if award and award.prize else None,
            "claim_code": award.claim_code if award else None,
        })
    return results


# ─── 3. Session Detail ───────────────────────────────────────────


def admin_get_session(db: Session, session_id: str) -> dict | None:
    """Get full session detail for admin."""
    session = db.query(models.GameSession).filter(models.GameSession.id == session_id).first()
    if not session:
        return None

    challenges = []
    for sc in session.challenges:
        rev = db.query(models.ChallengeRevision).filter(
            models.ChallengeRevision.id == sc.challenge_revision_id
        ).first()
        attempts = [
            {
                "ordinal": a.ordinal,
                "correct": a.correct,
                "answer_summary": a.answer_summary,
                "created_at": a.created_at,
            }
            for a in sc.attempts
        ]
        challenges.append({
            "position": sc.position,
            "outcome": sc.outcome.value if hasattr(sc.outcome, "value") else sc.outcome,
            "hint_used": sc.hint_used,
            "awarded_points": sc.awarded_points,
            "title": rev.title if rev else None,
            "challenge_type": rev.challenge.challenge_type.value if rev and rev.challenge else None,
            "attempts": attempts,
        })

    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()
    award = db.query(models.Award).filter(models.Award.session_id == session.id).first()

    return {
        "id": session.id,
        "alias": session.alias,
        "state": session.state.value if hasattr(session.state, "value") else session.state,
        "score": session.score,
        "solved_count": session.solved_count,
        "elapsed_ms": session.elapsed_ms,
        "publish_consent": session.publish_consent,
        "kiosk_id": session.kiosk_id,
        "created_at": session.created_at,
        "started_at": session.started_at,
        "finalized_at": session.finalized_at,
        "challenges": challenges,
        "entitlement": {
            "state": entitlement.state.value if entitlement and hasattr(entitlement.state, "value") else (entitlement.state if entitlement else None),
            "qualified_at": entitlement.qualified_at if entitlement else None,
            "reason": entitlement.reason if entitlement else None,
        } if entitlement else None,
        "award": {
            "id": award.id,
            "prize_id": award.prize_id,
            "prize_name": award.prize.name if award.prize else None,
            "claim_code": award.claim_code,
            "status": award.status.value if hasattr(award.status, "value") else award.status,
            "created_at": award.created_at,
            "redeemed_at": award.redeemed_at,
        } if award else None,
    }


# ─── 4. Admin Abandon Session ────────────────────────────────────


def admin_abandon_session(db: Session, session_id: str, staff_user_id: str, reason: str) -> bool:
    """Staff-authorized session abandonment with audit."""
    session = db.query(models.GameSession).filter(models.GameSession.id == session_id).first()
    if not session:
        return False
    if session.state in (models.GameSessionState.abandoned, models.GameSessionState.completed, models.GameSessionState.expired):
        return False

    session.state = models.GameSessionState.abandoned
    session.finalized_at = utcnow()

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="abandon_session",
        entity_type="session",
        entity_id=session_id,
        details={"reason": reason},
    )
    db.add(audit)
    db.commit()
    return True


# ─── 5. Challenges List ──────────────────────────────────────────


def admin_list_challenges(db: Session) -> list[dict]:
    """List all challenges with their latest revision."""
    challenges = db.query(models.Challenge).order_by(models.Challenge.created_at).all()
    results = []
    for c in challenges:
        latest = c.revisions[0] if c.revisions else None
        results.append({
            "id": c.id,
            "stable_id": c.stable_id,
            "type": c.challenge_type.value if hasattr(c.challenge_type, "value") else c.challenge_type,
            "difficulty": c.difficulty,
            "title": latest.title if latest else None,
            "published": latest.published if latest else False,
            "revision_number": latest.revision if latest else 0,
            "created_at": c.created_at,
        })
    return results


# ─── 6. Challenge Detail ─────────────────────────────────────────


def admin_get_challenge(db: Session, challenge_id: str) -> dict | None:
    """Get challenge with all revisions."""
    challenge = db.query(models.Challenge).filter(models.Challenge.id == challenge_id).first()
    if not challenge:
        return None

    revisions = []
    for r in challenge.revisions:
        revisions.append({
            "id": r.id,
            "revision": r.revision,
            "title": r.title,
            "instruction": r.instruction,
            "hint": r.hint,
            "explanation": r.explanation,
            "public_data": r.public_data,
            "private_validator": r.private_validator,
            "published": r.published,
            "created_at": r.created_at,
        })

    return {
        "id": challenge.id,
        "stable_id": challenge.stable_id,
        "type": challenge.challenge_type.value if hasattr(challenge.challenge_type, "value") else challenge.challenge_type,
        "difficulty": challenge.difficulty,
        "created_at": challenge.created_at,
        "revisions": revisions,
    }


# ─── 7. Create / Update Challenge ────────────────────────────────


def admin_create_challenge(
    db: Session,
    challenge_type: str,
    title: str,
    instruction: str,
    hint: str,
    explanation: str,
    public_data: dict,
    private_validator: dict,
    difficulty: str = "standard",
) -> dict:
    """Create a new challenge with first revision."""
    stable_id = f"ch-{uuid.uuid4().hex[:12]}"
    challenge = models.Challenge(
        id=str(uuid.uuid4()),
        stable_id=stable_id,
        challenge_type=models.ChallengeType(challenge_type),
        difficulty=difficulty,
    )
    db.add(challenge)
    db.flush()

    revision = models.ChallengeRevision(
        id=str(uuid.uuid4()),
        challenge_id=challenge.id,
        revision=1,
        title=title,
        instruction=instruction,
        hint=hint,
        explanation=explanation,
        public_data=public_data,
        private_validator=private_validator,
        published=False,
    )
    db.add(revision)
    db.commit()
    db.refresh(challenge)

    return {
        "id": challenge.id,
        "stable_id": challenge.stable_id,
        "type": challenge.challenge_type.value,
        "difficulty": challenge.difficulty,
        "created_at": challenge.created_at,
        "revision": {
            "id": revision.id,
            "revision": revision.revision,
            "title": revision.title,
            "published": revision.published,
        },
    }


def admin_update_challenge(
    db: Session,
    challenge_id: str,
    title: str | None = None,
    instruction: str | None = None,
    hint: str | None = None,
    explanation: str | None = None,
    public_data: dict | None = None,
    private_validator: dict | None = None,
) -> dict:
    """Create a new revision for an existing challenge. Old revisions remain immutable."""
    challenge = db.query(models.Challenge).filter(models.Challenge.id == challenge_id).first()
    if not challenge:
        raise ValueError("Challenge not found")

    latest = challenge.revisions[0] if challenge.revisions else None
    next_rev = (latest.revision + 1) if latest else 1

    revision = models.ChallengeRevision(
        id=str(uuid.uuid4()),
        challenge_id=challenge.id,
        revision=next_rev,
        title=title if title is not None else (latest.title if latest else ""),
        instruction=instruction if instruction is not None else (latest.instruction if latest else ""),
        hint=hint if hint is not None else (latest.hint if latest else ""),
        explanation=explanation if explanation is not None else (latest.explanation if latest else ""),
        public_data=public_data if public_data is not None else (latest.public_data if latest else {}),
        private_validator=private_validator if private_validator is not None else (latest.private_validator if latest else {}),
        published=False,
    )
    db.add(revision)
    db.commit()
    db.refresh(revision)

    return {
        "id": revision.id,
        "challenge_id": challenge.id,
        "revision": revision.revision,
        "title": revision.title,
        "published": revision.published,
    }


# ─── 8. Publish Challenge ────────────────────────────────────────


def admin_publish_challenge_revision(db: Session, revision_id: str, staff_user_id: str) -> bool:
    """Publish a specific challenge revision. Unpublishes other revisions of the same challenge."""
    revision = db.query(models.ChallengeRevision).filter(
        models.ChallengeRevision.id == revision_id
    ).first()
    if not revision:
        return False

    # Unpublish all other revisions for this challenge
    other_revisions = (
        db.query(models.ChallengeRevision)
        .filter(
            models.ChallengeRevision.challenge_id == revision.challenge_id,
            models.ChallengeRevision.id != revision_id,
        )
        .all()
    )
    for other in other_revisions:
        other.published = False

    revision.published = True

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="publish_challenge_revision",
        entity_type="challenge_revision",
        entity_id=revision_id,
        details={"challenge_id": revision.challenge_id, "revision": revision.revision},
    )
    db.add(audit)
    db.commit()
    return True


# ─── 9. Prizes ───────────────────────────────────────────────────


def admin_list_prizes(db: Session, event_id: str) -> list[dict]:
    """List all prizes with inventory and odds."""
    prizes = (
        db.query(models.Prize)
        .filter(models.Prize.event_id == event_id)
        .order_by(models.Prize.display_order)
        .all()
    )

    total_weight = sum(p.weight for p in prizes if p.active)

    results = []
    for prize in prizes:
        inv = db.query(models.PrizeInventory).filter(
            models.PrizeInventory.prize_id == prize.id
        ).first()
        odds = (prize.weight / total_weight * 100) if total_weight > 0 and prize.active else 0.0
        results.append({
            "id": prize.id,
            "name": prize.name,
            "short_label": prize.short_label,
            "icon": prize.icon,
            "description": prize.description or "",
            "image_url": prize.image_url,
            "weight": prize.weight,
            "active": prize.active,
            "archived": prize.archived,
            "display_order": prize.display_order,
            "color": prize.color,
            "odds_percent": round(odds, 2),
            "stock_received": inv.stock_received if inv else 0,
            "stock_reserved": inv.stock_reserved if inv else 0,
            "stock_redeemed": inv.stock_redeemed if inv else 0,
            "available": inv.available if inv else 0,
        })
    return results


def admin_adjust_stock(
    db: Session,
    prize_id: str,
    adjustment: int,
    reason: str,
    staff_user_id: str,
) -> dict:
    """Adjust stock received with audit log."""
    inv = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == prize_id
    ).first()
    if not inv:
        inv = models.PrizeInventory(
            id=str(uuid.uuid4()),
            prize_id=prize_id,
            stock_received=0,
            stock_reserved=0,
            stock_redeemed=0,
        )
        db.add(inv)

    inv.stock_received = max(0, inv.stock_received + adjustment)

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="adjust_stock",
        entity_type="prize_inventory",
        entity_id=prize_id,
        details={"adjustment": adjustment, "reason": reason, "new_stock": inv.stock_received},
    )
    db.add(audit)
    db.commit()
    db.refresh(inv)

    return {
        "prize_id": prize_id,
        "stock_received": inv.stock_received,
        "stock_reserved": inv.stock_reserved,
        "stock_redeemed": inv.stock_redeemed,
        "available": inv.available,
    }


# ─── 10. Leaderboard ─────────────────────────────────────────────


def admin_get_leaderboard(
    db: Session,
    event_id: str | None = None,
    limit: int = 100,
) -> list[dict]:
    """Get leaderboard with moderation status. Include hidden entries for admin."""
    q = (
        db.query(models.GameSession)
        .filter(
            models.GameSession.state.in_([
                models.GameSessionState.completed,
                models.GameSessionState.expired,
            ])
        )
    )
    if event_id:
        q = q.filter(models.GameSession.event_id == event_id)

    sessions = q.all()

    hidden_ids = _get_hidden_session_ids(db)
    shown_ids = _get_shown_session_ids(db)

    entries = []
    for s in sessions:
        ent = db.query(models.Entitlement).filter(
            models.Entitlement.session_id == s.id
        ).first()
        award = db.query(models.Award).filter(
            models.Award.session_id == s.id
        ).first()

        is_hidden = s.id in hidden_ids and s.id not in shown_ids

        entries.append({
            "session_id": s.id,
            "alias": s.alias,
            "score": s.score,
            "solved_count": s.solved_count,
            "elapsed_ms": s.elapsed_ms,
            "captured": ent is not None and ent.state == models.EntitlementState.qualified,
            "publish_consent": s.publish_consent,
            "is_hidden": is_hidden,
            "award_status": award.status.value if award and hasattr(award.status, "value") else None,
        })

    entries.sort(key=lambda e: (-e["score"], e["elapsed_ms"]))
    for i, e in enumerate(entries[:limit]):
        e["rank"] = i + 1

    return entries[:limit]


def get_leaderboard_entries(db: Session, event_id: str, limit: int = 10) -> list[dict]:
    """Public leaderboard - only opted-in, non-hidden, non-moderated entries."""
    hidden_ids = _get_hidden_session_ids(db)
    shown_ids = _get_shown_session_ids(db)

    q = (
        db.query(models.GameSession)
        .filter(
            models.GameSession.state.in_([
                models.GameSessionState.completed,
                models.GameSessionState.expired,
            ]),
            models.GameSession.publish_consent == True,
        )
    )
    if event_id:
        q = q.filter(models.GameSession.event_id == event_id)

    sessions = q.all()

    entries = []
    for s in sessions:
        is_hidden = s.id in hidden_ids and s.id not in shown_ids
        if is_hidden:
            continue
        entries.append({
            "rank": 0,
            "nickname": s.alias,
            "score": s.score,
            "solved_count": s.solved_count,
            "elapsed_ms": s.elapsed_ms,
            "is_current_player": False,
        })

    entries.sort(key=lambda e: (-e["score"], e["elapsed_ms"]))
    for i, e in enumerate(entries[:limit]):
        e["rank"] = i + 1

    return entries[:limit]


# ─── 11. Analytics ───────────────────────────────────────────────


def admin_get_analytics(
    db: Session,
    event_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> dict:
    """Return analytics aggregates."""
    q = db.query(models.GameSession)
    if event_id:
        q = q.filter(models.GameSession.event_id == event_id)
    if start_date:
        q = q.filter(models.GameSession.created_at >= start_date)
    if end_date:
        q = q.filter(models.GameSession.created_at <= end_date)

    all_sessions = q.all()
    total = len(all_sessions)

    rounds_started = sum(
        1 for s in all_sessions
        if s.state in (models.GameSessionState.active, models.GameSessionState.completed,
                       models.GameSessionState.expired, models.GameSessionState.abandoned)
    )
    rounds_completed = sum(1 for s in all_sessions if s.state == models.GameSessionState.completed)
    rounds_expired = sum(1 for s in all_sessions if s.state == models.GameSessionState.expired)
    rounds_abandoned = sum(1 for s in all_sessions if s.state == models.GameSessionState.abandoned)

    completion_rate = (rounds_completed / rounds_started * 100) if rounds_started > 0 else 0.0

    qualified_count = 0
    for s in all_sessions:
        ent = db.query(models.Entitlement).filter(
            models.Entitlement.session_id == s.id
        ).first()
        if ent and ent.state == models.EntitlementState.qualified:
            qualified_count += 1
    qualification_rate = (qualified_count / total * 100) if total > 0 else 0.0

    scores = [s.score for s in all_sessions if s.state == models.GameSessionState.completed]
    durations = [s.elapsed_ms for s in all_sessions if s.elapsed_ms and s.elapsed_ms > 0]
    total_players = len({s.alias for s in all_sessions if s.publish_consent})
    avg_score = (sum(scores) / len(scores)) if scores else 0.0
    median_score = (sorted(scores)[len(scores) // 2]) if scores else 0
    avg_duration_ms = (sum(durations) / len(durations)) if durations else 0

    # Challenge stats per type
    challenge_stats: dict[str, dict] = {}
    sc_q = db.query(models.SessionChallenge).join(models.GameSession)
    if event_id:
        sc_q = sc_q.filter(models.GameSession.event_id == event_id)

    all_sc = sc_q.all()
    for sc in all_sc:
        rev = db.query(models.ChallengeRevision).filter(
            models.ChallengeRevision.id == sc.challenge_revision_id
        ).first()
        if not rev or not rev.challenge:
            continue
        ctype = rev.challenge.challenge_type.value if hasattr(rev.challenge.challenge_type, "value") else rev.challenge.challenge_type
        if ctype not in challenge_stats:
            challenge_stats[ctype] = {"presented": 0, "solved": 0, "hint_used": 0, "skipped": 0, "total_attempts": 0, "count": 0}
        challenge_stats[ctype]["presented"] += 1
        challenge_stats[ctype]["count"] += 1
        if sc.outcome == models.Outcome.solved:
            challenge_stats[ctype]["solved"] += 1
        if sc.hint_used:
            challenge_stats[ctype]["hint_used"] += 1
        if sc.outcome == models.Outcome.skipped:
            challenge_stats[ctype]["skipped"] += 1
        attempts_q = db.query(models.Attempt).filter(
            models.Attempt.session_challenge_id == sc.id
        ).count()
        challenge_stats[ctype]["total_attempts"] += attempts_q

    for ctype, cs in challenge_stats.items():
        cs["avg_attempts"] = round(cs["total_attempts"] / cs["count"], 2) if cs["count"] > 0 else 0
        del cs["count"]
        del cs["total_attempts"]

    # Prize distribution
    award_q = db.query(models.Award)
    if event_id:
        award_q = award_q.filter(models.Award.event_id == event_id)
    all_awards = award_q.all()

    prize_distribution: dict[str, dict] = {}
    for aw in all_awards:
        pname = aw.prize.name if aw.prize else "Unknown"
        if pname not in prize_distribution:
            prize_distribution[pname] = {"awarded": 0, "redeemed": 0, "voided": 0, "pending": 0}
        status = aw.status.value if hasattr(aw.status, "value") else aw.status
        if status == "awarded":
            prize_distribution[pname]["awarded"] += 1
            prize_distribution[pname]["pending"] += 1
        elif status == "redeemed":
            prize_distribution[pname]["redeemed"] += 1
        elif status == "voided":
            prize_distribution[pname]["voided"] += 1

    # Inventory status
    prizes = db.query(models.Prize).all()
    if event_id:
        prizes = prizes  # prizes don't have event filter but awards do
    inventory_status: dict[str, dict] = {}
    for prize in prizes:
        inv = db.query(models.PrizeInventory).filter(
            models.PrizeInventory.prize_id == prize.id
        ).first()
        inventory_status[prize.name] = {
            "received": inv.stock_received if inv else 0,
            "reserved": inv.stock_reserved if inv else 0,
            "redeemed": inv.stock_redeemed if inv else 0,
            "available": inv.available if inv else 0,
        }

    return {
        "rounds_started": rounds_started,
        "rounds_completed": rounds_completed,
        "rounds_expired": rounds_expired,
        "rounds_abandoned": rounds_abandoned,
        "completion_rate": round(completion_rate, 2),
        "qualification_rate": round(qualification_rate, 2),
        "total_players": total_players,
        "avg_score": round(avg_score, 2),
        "median_score": median_score,
        "avg_duration_ms": round(avg_duration_ms, 0),
        "challenge_stats": challenge_stats,
        "prize_distribution": prize_distribution,
        "inventory_status": inventory_status,
    }


# ─── 12. Analytics Export (CSV) ──────────────────────────────────


def admin_export_analytics_csv(
    db: Session,
    event_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
) -> str:
    """Export analytics as CSV with formula-injection protection."""
    analytics = admin_get_analytics(db, event_id, start_date, end_date)

    output = io.StringIO()

    # Formula-injection protection: prefix cells starting with =, +, -, @
    def safe(value: str) -> str:
        s = str(value)
        if s and s[0] in ("=", "+", "-", "@"):
            s = "'" + s
        return s

    writer = csv.writer(output)

    # Summary section
    writer.writerow(["Metric", "Value"])
    writer.writerow([safe("rounds_started"), analytics["rounds_started"]])
    writer.writerow([safe("rounds_completed"), analytics["rounds_completed"]])
    writer.writerow([safe("rounds_expired"), analytics["rounds_expired"]])
    writer.writerow([safe("rounds_abandoned"), analytics["rounds_abandoned"]])
    writer.writerow([safe("completion_rate"), analytics["completion_rate"]])
    writer.writerow([safe("qualification_rate"), analytics["qualification_rate"]])
    writer.writerow([safe("total_players"), analytics["total_players"]])
    writer.writerow([safe("avg_score"), analytics["avg_score"]])
    writer.writerow([safe("median_score"), analytics["median_score"]])
    writer.writerow([safe("avg_duration_ms"), analytics["avg_duration_ms"]])
    writer.writerow([])

    # Challenge stats
    writer.writerow(["Challenge Type", "Presented", "Solved", "Hint Used", "Skipped", "Avg Attempts"])
    for ctype, cs in analytics["challenge_stats"].items():
        writer.writerow([
            safe(ctype),
            cs["presented"],
            cs["solved"],
            cs["hint_used"],
            cs["skipped"],
            cs["avg_attempts"],
        ])
    writer.writerow([])

    # Prize distribution
    writer.writerow(["Prize", "Awarded", "Redeemed", "Voided", "Pending"])
    for pname, pd in analytics["prize_distribution"].items():
        writer.writerow([
            safe(pname),
            pd["awarded"],
            pd["redeemed"],
            pd["voided"],
            pd["pending"],
        ])
    writer.writerow([])

    # Inventory status
    writer.writerow(["Prize", "Received", "Reserved", "Redeemed", "Available"])
    for pname, inv in analytics["inventory_status"].items():
        writer.writerow([
            safe(pname),
            inv["received"],
            inv["reserved"],
            inv["redeemed"],
            inv["available"],
        ])

    return output.getvalue()


# ─── 13. Audit Log ───────────────────────────────────────────────


def admin_list_audit_logs(
    db: Session,
    limit: int = 100,
    offset: int = 0,
    action: str | None = None,
    entity_type: str | None = None,
) -> list[dict]:
    """List audit logs with optional filters."""
    q = db.query(models.AuditLog)

    if action:
        q = q.filter(models.AuditLog.action == action)
    if entity_type:
        q = q.filter(models.AuditLog.entity_type == entity_type)

    logs = q.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    return [
        {
            "id": log.id,
            "actor_id": log.actor_id,
            "actor_type": log.actor_type,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "details": log.details,
            "created_at": log.created_at,
        }
        for log in logs
    ]


# ─── 14. Staff Management ────────────────────────────────────────


def admin_list_staff(db: Session) -> list[dict]:
    """List all staff users."""
    users = db.query(models.StaffUser).order_by(models.StaffUser.created_at).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "display_name": u.display_name,
            "role": u.role.value if hasattr(u.role, "value") else u.role,
            "active": u.active,
            "created_at": u.created_at,
            "last_login_at": u.last_login_at,
        }
        for u in users
    ]


def admin_create_staff(
    db: Session,
    username: str,
    password: str,
    role: str,
    display_name: str | None = None,
    staff_user_id: str | None = None,
) -> dict:
    """Create a new staff user. Audit logged."""
    existing = db.query(models.StaffUser).filter(
        models.StaffUser.username == username
    ).first()
    if existing:
        raise ValueError("Username already exists")

    user = models.StaffUser(
        username=username,
        display_name=display_name,
        password_hash=hash_staff_password(password),
        role=models.StaffRole(role),
        active=True,
    )
    db.add(user)

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="create_staff",
        entity_type="staff_user",
        entity_id=user.id,
        details={"username": username, "role": role},
    )
    db.add(audit)
    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role.value,
        "active": user.active,
        "created_at": user.created_at.isoformat() + "Z" if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() + "Z" if user.last_login_at else None,
    }


def admin_update_staff(
    db: Session,
    user_id: str,
    role: str | None = None,
    active: bool | None = None,
    display_name: str | None = None,
    staff_user_id: str | None = None,
) -> dict:
    """Update staff user role, active status, or display name. Audit logged.
    Prevents demoting the last system_admin."""
    user = db.query(models.StaffUser).filter(models.StaffUser.id == user_id).first()
    if not user:
        raise ValueError("Staff user not found")

    changes = {}

    if role is not None and role != user.role.value:
        if user.role == models.StaffRole.system_admin and role != "system_admin":
            sa_count = db.query(models.StaffUser).filter(
                models.StaffUser.role == models.StaffRole.system_admin,
                models.StaffUser.active == True,
                models.StaffUser.id != user_id,
            ).count()
            if sa_count == 0:
                raise ValueError("Cannot demote the last system administrator")
        changes["role"] = user.role.value
        user.role = models.StaffRole(role)

    if active is not None and active != user.active:
        if user.active and not active:
            if user.role == models.StaffRole.system_admin:
                sa_count = db.query(models.StaffUser).filter(
                    models.StaffUser.role == models.StaffRole.system_admin,
                    models.StaffUser.active == True,
                    models.StaffUser.id != user_id,
                ).count()
                if sa_count == 0:
                    raise ValueError("Cannot deactivate the last system administrator")
            if user_id == staff_user_id:
                raise ValueError("Cannot deactivate yourself")
        changes["active"] = user.active
        user.active = active

    if display_name is not None and display_name != user.display_name:
        changes["display_name"] = user.display_name
        user.display_name = display_name

    if changes:
        audit = models.AuditLog(
            actor_id=staff_user_id,
            actor_type="staff",
            action="update_staff",
            entity_type="staff_user",
            entity_id=user_id,
            details=changes,
        )
        db.add(audit)
        db.commit()
        db.refresh(user)
    else:
        db.refresh(user)

    return {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": user.role.value,
        "active": user.active,
        "created_at": user.created_at.isoformat() + "Z" if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() + "Z" if user.last_login_at else None,
    }


# ─── 15. Event Settings ──────────────────────────────────────────


def admin_get_event(db: Session, event_id: str) -> dict:
    """Get full event details including ruleset."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise ValueError("Event not found")

    ruleset = db.query(models.Ruleset).filter(
        models.Ruleset.id == event.active_ruleset_id
    ).first() if event.active_ruleset_id else None

    return {
        "id": event.id,
        "name": event.name,
        "state": event.state.value if hasattr(event.state, "value") else event.state,
        "timezone": event.timezone,
        "opens_at": event.opens_at,
        "closes_at": event.closes_at,
        "active_ruleset_id": event.active_ruleset_id,
        "created_at": event.created_at,
        "updated_at": event.updated_at,
        "ruleset": {
            "id": ruleset.id,
            "revision": ruleset.revision,
            "duration_seconds": ruleset.duration_seconds,
            "extended_duration_seconds": ruleset.extended_duration_seconds,
            "max_attempts": ruleset.max_attempts,
            "hint_penalty": ruleset.hint_penalty,
            "base_points": ruleset.base_points,
            "wrong_attempt_penalty": ruleset.wrong_attempt_penalty,
            "capture_bonus": ruleset.capture_bonus,
            "qualification_solves_required": ruleset.qualification_solves_required,
            "difficulty": ruleset.difficulty,
            "mode": ruleset.mode,
        } if ruleset else None,
    }


def admin_update_event(
    db: Session,
    event_id: str,
    name: str | None = None,
    state: str | None = None,
    timezone: str | None = None,
) -> dict:
    """Update event settings."""
    event = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not event:
        raise ValueError("Event not found")

    if name is not None:
        event.name = name
    if state is not None:
        event.state = models.EventState(state)
    if timezone is not None:
        event.timezone = timezone

    db.commit()
    db.refresh(event)

    return {
        "id": event.id,
        "name": event.name,
        "state": event.state.value,
        "timezone": event.timezone,
    }


# ─── 16. Leaderboard Moderation ──────────────────────────────────


def admin_moderate_leaderboard(
    db: Session,
    session_id: str,
    hide: bool,
    reason: str,
    staff_user_id: str,
) -> bool:
    """Hide or show a leaderboard entry with audit. Requires reason."""
    session = db.query(models.GameSession).filter(
        models.GameSession.id == session_id
    ).first()
    if not session:
        return False

    action = "hide_leaderboard" if hide else "show_leaderboard"

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action=action,
        entity_type="session",
        entity_id=session_id,
        details={"reason": reason},
    )
    db.add(audit)
    db.commit()
    return True


# ─── 16. Prize CRUD ─────────────────────────────────────────────


def admin_create_prize(
    db: Session,
    event_id: str,
    name: str,
    short_label: str,
    icon: str,
    description: str,
    image_url: str | None,
    weight: int,
    active: bool,
    display_order: int,
    color: str | None,
    initial_stock: int,
    staff_user_id: str | None = None,
) -> dict:
    """Create a new prize with inventory. Audit logged."""
    prize = models.Prize(
        event_id=event_id,
        name=name,
        short_label=short_label,
        icon=icon,
        description=description or "",
        image_url=image_url,
        weight=weight,
        active=active,
        display_order=display_order,
        color=color or "#20E3FF",
    )
    db.add(prize)
    db.flush()

    inventory = models.PrizeInventory(
        prize_id=prize.id,
        stock_received=initial_stock,
        stock_reserved=0,
        stock_redeemed=0,
    )
    db.add(inventory)

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="create_prize",
        entity_type="prize",
        entity_id=prize.id,
        details={"name": name, "short_label": short_label, "initial_stock": initial_stock},
    )
    db.add(audit)
    db.commit()
    db.refresh(prize)
    db.refresh(inventory)
    return {
        "id": prize.id,
        "name": prize.name,
        "short_label": prize.short_label,
        "icon": prize.icon,
        "description": prize.description,
        "image_url": prize.image_url,
        "weight": prize.weight,
        "active": prize.active,
        "archived": prize.archived,
        "display_order": prize.display_order,
        "color": prize.color,
        "stock_received": inventory.stock_received,
        "stock_reserved": inventory.stock_reserved,
        "stock_redeemed": inventory.stock_redeemed,
        "available": inventory.available,
    }


def admin_update_prize(
    db: Session,
    prize_id: str,
    name: str | None = None,
    short_label: str | None = None,
    icon: str | None = None,
    description: str | None = None,
    image_url: str | None = None,
    weight: int | None = None,
    active: bool | None = None,
    display_order: int | None = None,
    color: str | None = None,
    staff_user_id: str | None = None,
) -> dict:
    """Update prize fields. Audit logged with changed fields."""
    prize = db.query(models.Prize).filter(models.Prize.id == prize_id).first()
    if not prize:
        raise ValueError("Prize not found")

    changes = {}
    if name is not None:
        changes["name"] = name
        prize.name = name
    if short_label is not None:
        changes["short_label"] = short_label
        prize.short_label = short_label
    if icon is not None:
        changes["icon"] = icon
        prize.icon = icon
    if description is not None:
        changes["description"] = description
        prize.description = description
    if image_url is not None:
        changes["image_url"] = image_url
        prize.image_url = image_url
    if weight is not None:
        changes["weight"] = weight
        prize.weight = weight
    if active is not None:
        changes["active"] = active
        prize.active = active
    if display_order is not None:
        changes["display_order"] = display_order
        prize.display_order = display_order
    if color is not None:
        changes["color"] = color
        prize.color = color

    if changes:
        audit = models.AuditLog(
            actor_id=staff_user_id,
            actor_type="staff",
            action="update_prize",
            entity_type="prize",
            entity_id=prize_id,
            details=changes,
        )
        db.add(audit)
        db.commit()
        db.refresh(prize)
    else:
        db.refresh(prize)

    inventory = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == prize_id
    ).first()
    return {
        "id": prize.id,
        "name": prize.name,
        "short_label": prize.short_label,
        "icon": prize.icon,
        "description": prize.description,
        "image_url": prize.image_url,
        "weight": prize.weight,
        "active": prize.active,
        "archived": prize.archived,
        "display_order": prize.display_order,
        "color": prize.color,
        "stock_received": inventory.stock_received if inventory else 0,
        "stock_reserved": inventory.stock_reserved if inventory else 0,
        "stock_redeemed": inventory.stock_redeemed if inventory else 0,
        "available": inventory.available if inventory else 0,
    }


def admin_archive_prize(
    db: Session,
    prize_id: str,
    reason: str,
    staff_user_id: str | None = None,
) -> dict:
    """Soft-delete a prize by setting archived=True and active=False.
    Preserves all existing awards, claims, and redemptions."""
    prize = db.query(models.Prize).filter(models.Prize.id == prize_id).first()
    if not prize:
        raise ValueError("Prize not found")

    prize.archived = True
    prize.active = False

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="archive_prize",
        entity_type="prize",
        entity_id=prize_id,
        details={"name": prize.name, "reason": reason},
    )
    db.add(audit)
    db.commit()
    db.refresh(prize)
    return {"id": prize.id, "name": prize.name, "archived": True}


# ─── 17. Staff Management ───────────────────────────────────────


def admin_reset_staff_password(
    db: Session,
    user_id: str,
    new_password: str,
    staff_user_id: str | None = None,
) -> dict:
    """Reset a staff user's password. Audit logged. Never logs the password."""
    user = db.query(models.StaffUser).filter(models.StaffUser.id == user_id).first()
    if not user:
        raise ValueError("Staff user not found")

    user.password_hash = hash_staff_password(new_password)

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="reset_password",
        entity_type="staff_user",
        entity_id=user_id,
        details={"username": user.username},
    )
    db.add(audit)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "password_reset": True}


def admin_delete_staff(
    db: Session,
    user_id: str,
    reason: str,
    staff_user_id: str | None = None,
) -> dict:
    """Soft-delete a staff user by deactivating them.
    Prevents deleting the last system_admin or yourself."""
    user = db.query(models.StaffUser).filter(models.StaffUser.id == user_id).first()
    if not user:
        raise ValueError("Staff user not found")

    if user.role == models.StaffRole.system_admin:
        sa_count = db.query(models.StaffUser).filter(
            models.StaffUser.role == models.StaffRole.system_admin,
            models.StaffUser.active == True,
            models.StaffUser.id != user_id,
        ).count()
        if sa_count == 0:
            raise ValueError("Cannot delete the last system administrator")

    if user_id == staff_user_id:
        raise ValueError("Cannot delete yourself")

    user.active = False

    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="delete_staff",
        entity_type="staff_user",
        entity_id=user_id,
        details={"username": user.username, "reason": reason},
    )
    db.add(audit)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "deleted": True}


# ---------------------------------------------------------------------------
# Player-data reset
# ---------------------------------------------------------------------------

def admin_player_data_summary(db: Session) -> dict:
    """Return counts for the confirmation dialog."""
    sessions = db.query(models.GameSession).count()
    challenges = db.query(models.SessionChallenge).count()
    attempts = db.query(models.Attempt).count()
    entitlements = db.query(models.Entitlement).count()
    awards_total = db.query(models.Award).count()
    awards_awarded = db.query(models.Award).filter(
        models.Award.status == models.AwardState.awarded
    ).count()
    awards_redeemed = db.query(models.Award).filter(
        models.Award.status == models.AwardState.redeemed
    ).count()
    awards_voided = db.query(models.Award).filter(
        models.Award.status == models.AwardState.voided
    ).count()
    awards_expired = db.query(models.Award).filter(
        models.Award.status == models.AwardState.expired
    ).count()
    return {
        "sessions": sessions,
        "challenges": challenges,
        "attempts": attempts,
        "entitlements": entitlements,
        "awards_total": awards_total,
        "awards_awarded": awards_awarded,
        "awards_redeemed": awards_redeemed,
        "awards_voided": awards_voided,
        "awards_expired": awards_expired,
    }


def admin_delete_player_data(
    db: Session,
    staff_user_id: str,
    confirmation: str,
) -> dict:
    """Delete all player data across every event.

    Preserves: staff, event config, rulesets, challenges, prizes, audit history.
    Anonymizes redeemed/voided awards as operational history.

    Raises ValueError on:
      - Non-system-admin caller
      - Incorrect confirmation text
      - Outstanding unredeemed awards (staff must redeem or void first)
    """
    if confirmation != "DELETE PLAYER DATA":
        raise ValueError("Incorrect confirmation text. Type DELETE PLAYER DATA exactly.")

    staff = db.query(models.StaffUser).filter(models.StaffUser.id == staff_user_id).first()
    if not staff or staff.role != models.StaffRole.system_admin:
        raise PermissionError("Only system administrators may delete player data.")

    # Block if there are unredeemed (awarded) awards — staff must handle them first.
    unredeemed = db.query(models.Award).filter(
        models.Award.status == models.AwardState.awarded
    ).count()
    if unredeemed > 0:
        raise ValueError(
            f"{unredeemed} unredeemed prize claim(s) exist. "
            "Redeem or void them in Claims before deleting player data."
        )

    # Collect counts before deletion
    counts = admin_player_data_summary(db)

    # --- Begin transactional deletion ---
    # Delete from leaf tables upward (no ON DELETE CASCADE defined).

    # 1. Attempts (leaf — child of SessionChallenge)
    db.query(models.Attempt).delete(synchronize_session="fetch")

    # 2. SessionChallenges (child of GameSession)
    db.query(models.SessionChallenge).delete(synchronize_session="fetch")

    # 3. Awards — anonymize redeemed/voided, delete expired
    #    Keep as anonymized operational history detached from player records.
    db.query(models.Award).filter(
        models.Award.status == models.AwardState.expired
    ).delete(synchronize_session="fetch")

    # Anonymize redeemed awards (preserve prize/staff/history, strip player links)
    redeemed_awards = db.query(models.Award).filter(
        models.Award.status.in_([
            models.AwardState.redeemed,
            models.AwardState.voided,
        ])
    ).all()
    for award in redeemed_awards:
        award.session_id = ""
        award.entitlement_id = ""
        award.claim_code = f"deleted-{award.id[:8]}"
        award.claim_code_hash = ""
        award.draw_snapshot = None

    # 4. Entitlements (child of GameSession)
    db.query(models.Entitlement).delete(synchronize_session="fetch")

    # 5. GameSessions
    db.query(models.GameSession).delete(synchronize_session="fetch")

    # 6. Idempotency records for player-facing routes
    player_routes = [
        "/sessions", "/prepare", "/challenges", "/answer",
        "/skip", "/hints", "/finalise", "/resume",
        "/leaderboard", "/entitlement",
    ]
    for route in player_routes:
        db.query(models.IdempotencyRecord).filter(
            models.IdempotencyRecord.route.like(f"%{route}%")
        ).delete(synchronize_session="fetch")

    # --- Audit log ---
    audit = models.AuditLog(
        actor_id=staff_user_id,
        actor_type="staff",
        action="delete_all_player_data",
        entity_type="system",
        entity_id=None,
        details={
            "scope": "all_events",
            "sessions_deleted": counts["sessions"],
            "challenges_deleted": counts["challenges"],
            "attempts_deleted": counts["attempts"],
            "entitlements_deleted": counts["entitlements"],
            "awards_expired_deleted": counts["awards_expired"],
            "awards_anonymized": counts["awards_redeemed"] + counts["awards_voided"],
        },
    )
    db.add(audit)

    db.commit()

    return {
        "deleted": True,
        "counts": counts,
        "awards_anonymized": counts["awards_redeemed"] + counts["awards_voided"],
    }
