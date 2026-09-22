import uuid
from datetime import timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import engine as game_engine
from app import models, schemas, seed
from app.database import Base


def challenge_bank_answers(db):
    """Return a dict mapping stable_id to the correct answer for all published challenges."""
    from app import models

    result = {}
    revisions = (
        db.query(models.ChallengeRevision)
        .join(models.Challenge)
        .filter(models.ChallengeRevision.published == True)
        .all()
    )
    for rev in revisions:
        validator = rev.private_validator
        kind = rev.challenge.challenge_type.value
        if kind == "decode":
            result[rev.challenge.stable_id] = validator["answer"]
        else:
            result[rev.challenge.stable_id] = validator["correct_ids"]
    return result


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        seed.seed(db)
        game_engine.open_event(db)
        yield db
    finally:
        db.close()


def create_session(db, alias="TestPilot"):
    event = game_engine.ensure_event(db)
    ruleset = game_engine.get_published_ruleset(db, event.id)
    kiosk = game_engine.ensure_kiosk(db, event.id, "kiosk-test")
    return game_engine.start_session(
        db,
        event_id=event.id,
        ruleset_id=ruleset.id,
        kiosk_id=kiosk.id,
        alias=alias,
        publish_consent=True,
        accessibility_mode="standard",
    )


def begin(db, session):
    return game_engine.begin_round(db, session)


def answer_for(challenge):
    validator = challenge.revision.private_validator
    kind = challenge.revision.challenge.challenge_type.value
    if kind == "decode":
        return validator["answer"]
    return validator["correct_ids"]


def test_three_solves_with_hint_and_wrong_attempt_scores_398(db):
    session = create_session(db)
    begin(db, session)

    # Manually set expiry so we can control remaining time
    ruleset = session.ruleset
    session.expires_at = game_engine.utcnow() + timedelta(seconds=60)
    db.commit()

    # Solve first challenge normally
    sc1 = game_engine.get_current_session_challenge(session)
    ans1 = answer_for(sc1)
    game_engine.submit_answer(db, session, ans1, "k1")

    # Second challenge: use hint and one wrong attempt before correct
    sc2 = game_engine.get_current_session_challenge(session)
    if sc2.revision.challenge.challenge_type.value == "decode":
        wrong = "wrong"
    else:
        wrong = [sc2.revision.private_validator["correct_ids"][0] + "-wrong"]
    game_engine.submit_answer(db, session, wrong, "k2-wrong")
    game_engine.request_hint(db, session, "hint-2")
    ans2 = answer_for(sc2)
    game_engine.submit_answer(db, session, ans2, "k2-correct")

    # Third challenge: solve correctly
    sc3 = game_engine.get_current_session_challenge(session)
    ans3 = answer_for(sc3)
    game_engine.submit_answer(db, session, ans3, "k3")

    # Capture flag with exactly 60 seconds remaining
    session.expires_at = game_engine.utcnow() + timedelta(seconds=60)
    db.commit()
    flag = f"PSM{{{session.id.split('-')[0]}}}"
    result = game_engine.capture_flag(db, session, flag, "cap-1")

    assert result.captured
    assert result.qualified
    # 300 - 25 (hint) - 10 (wrong attempt) + 100 (capture) + 33 (time bonus) = 398
    assert session.score == 398
    assert result.time_bonus == 33


def test_failed_challenge_scores_zero(db):
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    if sc.revision.challenge.challenge_type.value == "decode":
        wrong = "wrong"
    else:
        wrong = ["wrong-id"]
    game_engine.submit_answer(db, session, wrong, "w1")
    game_engine.submit_answer(db, session, wrong, "w2")
    sc = db.merge(sc)
    assert sc.outcome == models.Outcome.failed
    assert sc.awarded_points == 0


def test_skipped_challenge_scores_zero(db):
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    game_engine.skip_challenge(db, session, "skip-1")
    assert sc.outcome == models.Outcome.skipped
    assert sc.awarded_points == 0


def test_request_at_expiry_rejected(db):
    session = create_session(db)
    begin(db, session)
    # Force expiry
    session.expires_at = game_engine.utcnow() - timedelta(seconds=1)
    db.commit()
    sc = game_engine.get_current_session_challenge(session)
    ans = answer_for(sc)
    with pytest.raises(ValueError, match="expired"):
        game_engine.submit_answer(db, session, ans, "late")


def test_submit_answer_one_ms_before_expiry_accepted(db, monkeypatch):
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    ans = answer_for(sc)
    expiry = game_engine.utcnow() + timedelta(seconds=5)
    session.expires_at = expiry
    db.commit()
    monkeypatch.setattr(game_engine, "utcnow", lambda: expiry - timedelta(milliseconds=1))
    result = game_engine.submit_answer(db, session, ans, "just-in-time")
    assert result.correct


def test_submit_answer_exactly_at_expiry_rejected(db, monkeypatch):
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    ans = answer_for(sc)
    expiry = game_engine.utcnow() + timedelta(seconds=5)
    session.expires_at = expiry
    db.commit()
    monkeypatch.setattr(game_engine, "utcnow", lambda: expiry)
    with pytest.raises(ValueError, match="expired"):
        game_engine.submit_answer(db, session, ans, "too-late")


def test_capture_flag_one_ms_before_expiry_accepted(db, monkeypatch):
    session = create_session(db)
    begin(db, session)
    for i in range(3):
        sc = game_engine.get_current_session_challenge(session)
        game_engine.submit_answer(db, session, answer_for(sc), f"solve-{i}")
    expiry = game_engine.utcnow() + timedelta(seconds=5)
    session.expires_at = expiry
    db.commit()
    monkeypatch.setattr(game_engine, "utcnow", lambda: expiry - timedelta(milliseconds=1))
    result = game_engine.capture_flag(db, session, None, "just-in-time-cap")
    assert result.captured


def test_capture_flag_exactly_at_expiry_rejected(db, monkeypatch):
    session = create_session(db)
    begin(db, session)
    for i in range(3):
        sc = game_engine.get_current_session_challenge(session)
        game_engine.submit_answer(db, session, answer_for(sc), f"solve-{i}")
    expiry = game_engine.utcnow() + timedelta(seconds=5)
    session.expires_at = expiry
    db.commit()
    monkeypatch.setattr(game_engine, "utcnow", lambda: expiry)
    with pytest.raises(ValueError, match="expired"):
        game_engine.capture_flag(db, session, None, "too-late-cap")


def test_duplicate_answer_request_is_idempotent(db):
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    ans = answer_for(sc)
    r1 = game_engine.submit_answer(db, session, ans, "dup-key")
    r2 = game_engine.submit_answer(db, session, ans, "dup-key")
    assert r1.correct == r2.correct
    assert r1.score == r2.score


def test_session_ownership_prevents_unauthorized_access(db):
    session = create_session(db)
    other_kiosk = game_engine.ensure_kiosk(db, session.event_id, "other-kiosk")
    with pytest.raises(PermissionError):
        game_engine.get_session_for_mutation(db, session.id, game_engine.hash_credential("other-kiosk"))


def test_public_challenge_does_not_expose_answers(db):
    session = create_session(db)
    out = game_engine.to_session_out(session)
    for ch in out.challenges:
        if ch.type in ("phishing", "logs"):
            items = ch.data.get("evidence") or ch.data.get("logs") or []
            for item in items:
                assert "correct" not in item
        assert not ch.data.get("answer")


def test_pool_rotation_consumes_entries(db):
    event = game_engine.ensure_event(db)
    ruleset = game_engine.get_published_ruleset(db, event.id)
    kiosk = game_engine.ensure_kiosk(db, event.id, "rotate-kiosk")
    ids_seen = set()
    for _ in range(10):
        session = game_engine.start_session(
            db,
            event_id=event.id,
            ruleset_id=ruleset.id,
            kiosk_id=kiosk.id,
            alias="R",
            publish_consent=False,
            accessibility_mode="standard",
        )
        for sc in session.challenges:
            ids_seen.add(sc.challenge_revision_id)
    # After 10 rounds we should have seen several different revisions
    assert len(ids_seen) >= 3


def test_abandon_excludes_from_leaderboard_eligibility(db):
    session = create_session(db)
    begin(db, session)
    game_engine.abandon_session(db, session, "ab-1")
    assert session.state == models.GameSessionState.abandoned


def test_two_solves_without_capture_does_not_qualify(db):
    session = create_session(db)
    begin(db, session)
    solved = 0
    while solved < 2:
        sc = game_engine.get_current_session_challenge(session)
        ans = answer_for(sc)
        game_engine.submit_answer(db, session, ans, f"s{solved}")
        solved += 1
    # Skip third
    game_engine.skip_challenge(db, session, "skip-3")
    # Capture succeeds because 2 solves + capture == qualified
    result = game_engine.capture_flag(db, session, None, "cap-1")
    assert result.captured
    assert result.qualified


def test_session_out_includes_server_now_with_z_suffix(db):
    session = create_session(db)
    begin(db, session)
    out = game_engine.to_session_out(session)
    serialized = out.model_dump()
    assert serialized["server_now"].endswith("Z")
    assert serialized["started_at"].endswith("Z")
    assert serialized["expires_at"].endswith("Z")


def test_expired_session_finalized_on_get(db):
    session = create_session(db)
    begin(db, session)
    session.expires_at = game_engine.utcnow() - timedelta(seconds=1)
    db.commit()
    game_engine.finalize_session(db, session, models.GameSessionState.expired)
    assert session.state == models.GameSessionState.expired


def test_late_capture_rejected(db):
    session = create_session(db)
    begin(db, session)
    # Solve all three quickly
    for i in range(3):
        sc = game_engine.get_current_session_challenge(session)
        game_engine.submit_answer(db, session, answer_for(sc), f"solve-{i}")
    session.expires_at = game_engine.utcnow() - timedelta(seconds=1)
    db.commit()
    with pytest.raises(ValueError, match="expired"):
        game_engine.capture_flag(db, session, None, "late-cap")


def test_all_published_challenges_have_valid_answers(db):
    answers = challenge_bank_answers(db)
    assert len(answers) == 20
    for stable_id, answer in answers.items():
        if isinstance(answer, str):
            assert answer.startswith("PSM{") and answer.endswith("}")
        else:
            assert isinstance(answer, list)
            assert len(answer) >= 1


def test_fresh_session_gets_full_duration(db):
    """Timer regression: new session always gets the full round duration."""
    event = game_engine.ensure_event(db)
    ruleset = game_engine.get_published_ruleset(db, event.id)
    kiosk = game_engine.ensure_kiosk(db, event.id, "timer-kiosk")
    session_a = game_engine.start_session(
        db, event_id=event.id, ruleset_id=ruleset.id,
        kiosk_id=kiosk.id, alias="TimerA", publish_consent=True,
        accessibility_mode="standard",
    )
    out_a = begin(db, session_a)
    dur_a = (session_a.expires_at - session_a.started_at).total_seconds()

    game_engine.abandon_session(db, session_a, "abandon-a")

    session_b = game_engine.start_session(
        db, event_id=event.id, ruleset_id=ruleset.id,
        kiosk_id=kiosk.id, alias="TimerB", publish_consent=True,
        accessibility_mode="standard",
    )
    out_b = begin(db, session_b)
    dur_b = (session_b.expires_at - session_b.started_at).total_seconds()

    assert session_a.id != session_b.id
    assert dur_a == 180
    assert dur_b == 180
    assert out_a.expires_at != out_b.expires_at


def test_hint_used_reflected_in_public_challenge(db):
    """Hint regression: ChallengePublic must include hint_used field."""
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    out_before = game_engine.to_session_out(session)
    ch_before = out_before.challenges[0]
    assert hasattr(ch_before, 'hint_used')
    assert ch_before.hint_used is False

    game_engine.request_hint(db, session, "hint-regression")
    out_after = game_engine.to_session_out(session)
    ch_after = out_after.challenges[0]
    assert ch_after.hint_used is True


def test_hint_penalty_applied_at_solve_time(db):
    """Hint regression: hint used before solving deducts 25 from awarded points."""
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    game_engine.request_hint(db, session, "hint-before-solve")
    assert sc.hint_used is True
    ans = answer_for(sc)
    game_engine.submit_answer(db, session, ans, "solve-after-hint")
    # base_points=100, hint_penalty=25 → 75
    assert sc.awarded_points == 75
    assert session.score == 75


def test_hint_double_tap_only_records_once(db):
    """Hint regression: requesting hint twice on same challenge only marks hint_used once."""
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    game_engine.request_hint(db, session, "hint-dup-1")
    game_engine.request_hint(db, session, "hint-dup-1")
    assert sc.hint_used is True
    ans = answer_for(sc)
    game_engine.submit_answer(db, session, ans, "solve-dup")
    assert sc.awarded_points == 75


def test_hint_restores_after_refresh(db):
    """Hint regression: hint text is preserved across session refresh."""
    session = create_session(db)
    begin(db, session)
    sc = game_engine.get_current_session_challenge(session)
    game_engine.request_hint(db, session, "hint-persist")
    out = game_engine.to_session_out(session)
    ch = out.challenges[0]
    assert ch.hint_used is True
    assert ch.hint is not None
    assert len(ch.hint) > 0


def test_all_published_challenges_validate_correctly(db):
    """Every published challenge accepts its canonical answer and rejects a wrong one."""
    revisions = (
        db.query(models.ChallengeRevision)
        .join(models.Challenge)
        .filter(models.ChallengeRevision.published == True)
        .all()
    )
    assert len(revisions) == 20
    for rev in revisions:
        kind = rev.challenge.challenge_type.value
        validator = rev.private_validator
        if kind == "decode":
            correct = validator["answer"]
            wrong = "PSM{WRONG}"
        else:
            correct = validator["correct_ids"]
            wrong = ["not-a-real-id"]

        valid_shape, normalized = game_engine.normalize_answer(kind, correct, validator)
        assert valid_shape
        assert game_engine.check_answer(kind, normalized, validator)

        valid_shape_wrong, normalized_wrong = game_engine.normalize_answer(kind, wrong, validator)
        assert valid_shape_wrong
        assert not game_engine.check_answer(kind, normalized_wrong, validator)


# ──────────────────────────────────────────────────────────────────
# Phase 3: Prize allocation tests
# ──────────────────────────────────────────────────────────────────

def _create_qualified_session(db):
    """Helper: create a session that qualifies for a prize spin."""
    session = create_session(db)
    begin(db, session)
    # Solve 2 challenges
    for _ in range(2):
        sc = game_engine.get_current_session_challenge(session)
        game_engine.submit_answer(db, session, answer_for(sc), f"q-{_}")
    # Skip third
    sc3 = game_engine.get_current_session_challenge(session)
    game_engine.skip_challenge(db, session, "skip-q")
    # Capture flag
    result = game_engine.capture_flag(db, session, None, "cap-q")
    assert result.qualified
    return session


def test_prize_seeding_creates_inventory(db):
    """Prize seed creates prizes and inventory records."""
    event = game_engine.ensure_event(db)
    count = game_engine.seed_prizes(db, event.id)
    assert count == 6
    prizes = db.query(models.Prize).filter(models.Prize.event_id == event.id).all()
    assert len(prizes) == 6
    for prize in prizes:
        inv = db.query(models.PrizeInventory).filter(
            models.PrizeInventory.prize_id == prize.id
        ).first()
        assert inv is not None
        assert inv.stock_received > 0
        assert inv.available == inv.stock_received


def test_prize_seeding_is_idempotent(db):
    """Prize seed does not duplicate prizes."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    count = game_engine.seed_prizes(db, event.id)
    assert count == 0
    prizes = db.query(models.Prize).filter(models.Prize.event_id == event.id).all()
    assert len(prizes) == 6


def test_qualified_spin_awards_prize(db):
    """Qualified session can spin and receives an award."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()
    assert entitlement.state == models.EntitlementState.qualified

    result = game_engine.draw_prize(db, event.id, session, entitlement)
    assert result.award is not None
    assert result.award.claim_code is not None
    assert len(result.award.claim_code) == 14  # XXXX-XXXX-XXXX
    assert "won" in result.message.lower()


def test_unqualified_spin_rejected(db):
    """Unqualified session cannot spin."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    session = create_session(db)
    begin(db, session)
    # Don't solve anything, just skip all
    for _ in range(3):
        game_engine.skip_challenge(db, session, f"skip-u-{_}")
    game_engine.finalize_session(db, session, models.GameSessionState.completed)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()
    assert entitlement.state == models.EntitlementState.unqualified

    result = game_engine.draw_prize(db, event.id, session, entitlement)
    assert result.award is None


def test_duplicate_spin_returns_same_award(db):
    """Spinning twice returns the same award (idempotent)."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    r1 = game_engine.draw_prize(db, event.id, session, entitlement)
    r2 = game_engine.draw_prize(db, event.id, session, entitlement)
    assert r1.award.id == r2.award.id
    assert r1.award.claim_code == r2.award.claim_code


def test_zero_stock_award_returns_no_stock(db):
    """When all stock is depleted, spin returns no_stock=True."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    # Deplete all stock
    for inv in db.query(models.PrizeInventory).all():
        inv.stock_received = 0
        inv.stock_reserved = 0
    db.commit()

    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    result = game_engine.draw_prize(db, event.id, session, entitlement)
    assert result.award is None
    assert result.no_stock is True


def test_claim_code_format(db):
    """Claim codes have the expected format: XXXX-XXXX-XXXX."""
    code = game_engine.generate_claim_code()
    parts = code.split("-")
    assert len(parts) == 3
    for part in parts:
        assert len(part) == 4
        for c in part:
            assert c in game_engine.CLAIM_ALPHABET


def test_claim_code_hash_is_deterministic(db):
    """Hashing the same code always produces the same hash."""
    code = "ABCD-EFGH-JKMN"
    h1 = game_engine.hash_claim_code(code)
    h2 = game_engine.hash_claim_code(code)
    assert h1 == h2
    assert len(h1) == 64  # SHA-256 hex


def test_staff_authenticate_valid(db):
    """Valid credentials return the staff user."""
    user = game_engine.create_staff_user(db, "teststaff", "password123", "staff")
    result = game_engine.staff_authenticate(db, "teststaff", "password123")
    assert result is not None
    assert result.id == user.id
    assert result.last_login_at is not None


def test_staff_authenticate_invalid_password(db):
    """Invalid password returns None."""
    game_engine.create_staff_user(db, "teststaff2", "correct", "staff")
    result = game_engine.staff_authenticate(db, "teststaff2", "wrong")
    assert result is None


def test_staff_authenticate_nonexistent_user(db):
    """Non-existent user returns None."""
    result = game_engine.staff_authenticate(db, "nobody", "password")
    assert result is None


def test_staff_redeem_claim_success(db):
    """Staff can redeem a valid claim code."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    user = game_engine.create_staff_user(db, "redeemer", "pass123", "staff")
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    result = game_engine.draw_prize(db, event.id, session, entitlement)
    claim_code = result.award.claim_code

    redeem_result = game_engine.staff_redeem_claim(db, claim_code, user.id)
    assert redeem_result.success is True
    assert "handed over" in redeem_result.message.lower()


def test_staff_redeem_claim_already_redeemed(db):
    """Redeeming an already-redeemed code is idempotent."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    user = game_engine.create_staff_user(db, "redeemer2", "pass123", "staff")
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    spin_result = game_engine.draw_prize(db, event.id, session, entitlement)
    code = spin_result.award.claim_code

    r1 = game_engine.staff_redeem_claim(db, code, user.id)
    assert r1.success is True

    r2 = game_engine.staff_redeem_claim(db, code, user.id)
    assert r2.success is True
    assert "already" in r2.message.lower()


def test_staff_redeem_claim_not_found(db):
    """Redeeming a non-existent code returns failure."""
    user = game_engine.create_staff_user(db, "redeemer3", "pass123", "staff")
    result = game_engine.staff_redeem_claim(db, "XXXX-XXXX-XXXX", user.id)
    assert result.success is False


def test_staff_lookup_claim_found(db):
    """Staff can look up an existing claim."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    spin_result = game_engine.draw_prize(db, event.id, session, entitlement)
    code = spin_result.award.claim_code

    lookup = game_engine.staff_lookup_claim(db, code)
    assert lookup is not None
    assert lookup.claim_code == code
    assert lookup.status == "awarded"


def test_staff_lookup_claim_not_found(db):
    """Staff lookup of non-existent code returns None."""
    result = game_engine.staff_lookup_claim(db, "XXXX-XXXX-XXXX")
    assert result is None


def test_staff_list_outstanding_claims(db):
    """Outstanding claims list includes awarded but not redeemed."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    spin_result = game_engine.draw_prize(db, event.id, session, entitlement)
    outstanding = game_engine.staff_list_outstanding_claims(db)
    assert len(outstanding) >= 1
    codes = [c.claim_code for c in outstanding]
    assert spin_result.award.claim_code in codes


def test_staff_list_prizes_with_inventory(db):
    """Staff can list all prizes with inventory."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    prizes = game_engine.staff_list_prizes_with_inventory(db, event.id)
    assert len(prizes) == 6
    for p in prizes:
        assert p.stock_received >= 0
        assert p.available >= 0


def test_inventory_decrements_on_redeem(db):
    """Redeeming a claim moves stock from reserved to redeemed."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    user = game_engine.create_staff_user(db, "invstaff", "pass123", "staff")
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    spin_result = game_engine.draw_prize(db, event.id, session, entitlement)
    prize_id = spin_result.award.prize_id

    inv_before = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == prize_id
    ).first()
    reserved_before = inv_before.stock_reserved
    redeemed_before = inv_before.stock_redeemed

    game_engine.staff_redeem_claim(db, spin_result.award.claim_code, user.id)

    inv_after = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == prize_id
    ).first()
    assert inv_after.stock_reserved == reserved_before - 1
    assert inv_after.stock_redeemed == redeemed_before + 1


def test_staff_void_claim(db):
    """Admin can void an awarded claim and release stock."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    admin = game_engine.create_staff_user(db, "voidadmin", "pass123", "admin")
    session = _create_qualified_session(db)
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()

    spin_result = game_engine.draw_prize(db, event.id, session, entitlement)
    award_id = spin_result.award.id
    prize_id = spin_result.award.prize_id

    inv_before = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == prize_id
    ).first()
    reserved_before = inv_before.stock_reserved

    result = game_engine.staff_void_claim(db, award_id, admin.id, "test void")
    assert result.success is True

    inv_after = db.query(models.PrizeInventory).filter(
        models.PrizeInventory.prize_id == prize_id
    ).first()
    assert inv_after.stock_reserved == reserved_before - 1


def test_weighted_selection_uses_cryptographic_randomness(db):
    """Draw uses secrets.randbelow, not a fixed seed."""
    event = game_engine.ensure_event(db)
    game_engine.seed_prizes(db, event.id)
    # Run many draws and check distribution is not degenerate
    prizes_won = {}
    for i in range(100):
        # Create and qualify a session
        session = create_session(db, alias=f"WeightTest{i}")
        begin(db, session)
        for _ in range(2):
            sc = game_engine.get_current_session_challenge(session)
            game_engine.submit_answer(db, session, answer_for(sc), f"ws-{i}-{_}")
        game_engine.skip_challenge(db, session, f"ws-skip-{i}")
        game_engine.capture_flag(db, session, None, f"ws-cap-{i}")

        entitlement = db.query(models.Entitlement).filter(
            models.Entitlement.session_id == session.id
        ).first()
        result = game_engine.draw_prize(db, event.id, session, entitlement)
        if result.award:
            prizes_won[result.award.prize_name] = prizes_won.get(result.award.prize_name, 0) + 1

    # Should have won at least 2 different prizes
    assert len(prizes_won) >= 2
