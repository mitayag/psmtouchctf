"""Regression tests: startup schema reconciliation for legacy volumes.

The deployed volume's game_sessions table predated prepared_at (and
challenge_pools predated recently_assigned), so create_all() alone left the
model ahead of the DB and POST /api/v1/sessions failed with
sqlite3.OperationalError: no such column: game_sessions.prepared_at (HTTP 500).
"""

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app import engine as game_engine
from app import models, seed
from app.database import Base, ensure_columns


def _sqlite_supports_drop_column(engine) -> bool:
    with engine.connect() as conn:
        version = conn.exec_driver_sql("SELECT sqlite_version()").scalar()
    parts = tuple(int(p) for p in version.split(".")[:2])
    return parts >= (3, 35)


@pytest.fixture
def legacy_engine(tmp_path):
    """A DB whose schema matches the older model (missing the two newer columns)."""
    engine = create_engine(f"sqlite:///{tmp_path}/legacy.db")
    Base.metadata.create_all(bind=engine)
    if not _sqlite_supports_drop_column(engine):
        pytest.skip("sqlite lacks DROP COLUMN support")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE game_sessions DROP COLUMN prepared_at"))
        conn.execute(text("ALTER TABLE challenge_pools DROP COLUMN recently_assigned"))
    yield engine
    engine.dispose()


def _columns(engine, table):
    return {c["name"] for c in inspect(engine).get_columns(table)}


def test_legacy_db_is_missing_columns(legacy_engine):
    assert "prepared_at" not in _columns(legacy_engine, "game_sessions")
    assert "recently_assigned" not in _columns(legacy_engine, "challenge_pools")


def test_ensure_columns_adds_missing_model_columns(legacy_engine):
    ensure_columns(legacy_engine)
    assert "prepared_at" in _columns(legacy_engine, "game_sessions")
    assert "recently_assigned" in _columns(legacy_engine, "challenge_pools")


def test_ensure_columns_is_idempotent(legacy_engine):
    ensure_columns(legacy_engine)
    ensure_columns(legacy_engine)
    assert "prepared_at" in _columns(legacy_engine, "game_sessions")


def test_ensure_columns_preserves_existing_rows(legacy_engine):
    engine = legacy_engine
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO events (id, name, state, timezone, created_at, updated_at) "
                "VALUES ('evt-1', 'Legacy', 'open', 'UTC', '2026-01-01 00:00:00', '2026-01-01 00:00:00')"
            )
        )
    ensure_columns(engine)
    with engine.connect() as conn:
        count = conn.exec_driver_sql("SELECT COUNT(*) FROM events").scalar()
    assert count == 1


def test_force_new_query_and_session_create_work_after_reconcile(legacy_engine):
    """The exact query that 500'd (force_new path) plus full session creation."""
    ensure_columns(legacy_engine)
    db = sessionmaker(autocommit=False, autoflush=False, bind=legacy_engine)()
    try:
        seed.seed(db)
        game_engine.open_event(db)
        event = game_engine.ensure_event(db)
        kiosk = game_engine.ensure_kiosk(db, event.id, "default-kiosk")

        active_states = [
            models.GameSessionState.ready,
            models.GameSessionState.prepared,
            models.GameSessionState.active,
        ]
        # This SELECT includes prepared_at — it is what raised OperationalError.
        existing = (
            db.query(models.GameSession)
            .filter(
                models.GameSession.kiosk_id == kiosk.id,
                models.GameSession.state.in_(active_states),
            )
            .order_by(models.GameSession.created_at.desc())
            .first()
        )
        assert existing is None

        ruleset = game_engine.get_published_ruleset(db, event.id)
        session = game_engine.start_session(
            db,
            event_id=event.id,
            ruleset_id=ruleset.id,
            kiosk_id=kiosk.id,
            alias="SKEE",
            publish_consent=True,
            accessibility_mode="standard",
        )
        # start_session assigns challenges, which writes challenge_pools.recently_assigned.
        assert session.alias == "SKEE"
        assert session.state == models.GameSessionState.ready
        assert session.prepared_at is None
    finally:
        db.close()
