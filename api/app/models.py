import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_uuid() -> str:
    return str(uuid.uuid4())


UUID_STR = String(36)


class EventState(str, Enum):
    draft = "draft"
    open = "open"
    paused = "paused"
    closed = "closed"


class GameSessionState(str, Enum):
    ready = "ready"
    prepared = "prepared"
    active = "active"
    completed = "completed"
    expired = "expired"
    abandoned = "abandoned"


class ChallengeType(str, Enum):
    phishing = "phishing"
    logs = "logs"
    decode = "decode"


class Outcome(str, Enum):
    pending = "pending"
    solved = "solved"
    failed = "failed"
    skipped = "skipped"


class EntitlementState(str, Enum):
    pending = "pending"
    qualified = "qualified"
    unqualified = "unqualified"


class AwardState(str, Enum):
    awarded = "awarded"
    redeemed = "redeemed"
    expired = "expired"
    voided = "voided"


class StaffRole(str, Enum):
    staff = "staff"
    admin = "admin"
    system_admin = "system_admin"


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    name = Column(String(200), nullable=False)
    state = Column(SQLEnum(EventState), nullable=False, default=EventState.draft)
    timezone = Column(String(50), default="UTC")
    opens_at = Column(DateTime(timezone=False), nullable=True)
    closes_at = Column(DateTime(timezone=False), nullable=True)
    active_ruleset_id = Column(UUID_STR, nullable=True)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=False), default=utcnow, onupdate=utcnow, nullable=False)

    rulesets = relationship("Ruleset", back_populates="event", order_by="Ruleset.revision.desc()")


class Ruleset(Base):
    __tablename__ = "rulesets"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    event_id = Column(UUID_STR, ForeignKey("events.id"), nullable=False)
    revision = Column(Integer, nullable=False)
    duration_seconds = Column(Integer, default=180, nullable=False)
    extended_duration_seconds = Column(Integer, default=300, nullable=False)
    max_attempts = Column(Integer, default=2, nullable=False)
    hint_penalty = Column(Integer, default=25, nullable=False)
    base_points = Column(Integer, default=100, nullable=False)
    wrong_attempt_penalty = Column(Integer, default=10, nullable=False)
    capture_bonus = Column(Integer, default=100, nullable=False)
    qualification_solves_required = Column(Integer, default=2, nullable=False)
    difficulty = Column(String(50), default="standard")
    mode = Column(String(50), default="standard")
    published_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)

    event = relationship("Event", back_populates="rulesets")


class Kiosk(Base):
    __tablename__ = "kiosks"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    event_id = Column(UUID_STR, ForeignKey("events.id"), nullable=False)
    label = Column(String(100), nullable=False)
    credential_hash = Column(String(255), nullable=False)
    revoked = Column(Boolean, default=False, nullable=False)
    last_seen_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)


class Challenge(Base):
    __tablename__ = "challenges"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    stable_id = Column(String(100), unique=True, nullable=False)
    challenge_type = Column(SQLEnum(ChallengeType), nullable=False)
    difficulty = Column(String(50), default="standard")
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)

    revisions = relationship("ChallengeRevision", back_populates="challenge", order_by="ChallengeRevision.revision.desc()")


class ChallengeRevision(Base):
    __tablename__ = "challenge_revisions"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    challenge_id = Column(UUID_STR, ForeignKey("challenges.id"), nullable=False)
    revision = Column(Integer, nullable=False)
    title = Column(String(200), nullable=False)
    instruction = Column(Text, nullable=False)
    hint = Column(Text, nullable=False)
    explanation = Column(Text, nullable=False)
    public_data = Column(JSON, nullable=False)
    private_validator = Column(JSON, nullable=False)
    content_hash = Column(String(64), nullable=True)
    published = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("challenge_id", "revision", name="uq_challenge_revision"),)

    challenge = relationship("Challenge", back_populates="revisions")


class ChallengePool(Base):
    __tablename__ = "challenge_pools"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    event_id = Column(UUID_STR, ForeignKey("events.id"), nullable=False)
    ruleset_id = Column(UUID_STR, ForeignKey("rulesets.id"), nullable=False)
    challenge_type = Column(SQLEnum(ChallengeType), nullable=False)
    pool = Column(JSON, nullable=False)
    consumed = Column(JSON, nullable=False, default=list)
    last_assigned_revision_id = Column(UUID_STR, nullable=True)
    recently_assigned = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=False), default=utcnow, onupdate=utcnow, nullable=False)


class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    event_id = Column(UUID_STR, ForeignKey("events.id"), nullable=False)
    kiosk_id = Column(UUID_STR, ForeignKey("kiosks.id"), nullable=False)
    ruleset_id = Column(UUID_STR, ForeignKey("rulesets.id"), nullable=False)
    alias = Column(String(100), nullable=False)
    publish_consent = Column(Boolean, default=False, nullable=False)
    accessibility_mode = Column(String(50), default="standard")
    state = Column(SQLEnum(GameSessionState), default=GameSessionState.ready, nullable=False)
    prepared_at = Column(DateTime(timezone=False), nullable=True)
    started_at = Column(DateTime(timezone=False), nullable=True)
    expires_at = Column(DateTime(timezone=False), nullable=True)
    finalized_at = Column(DateTime(timezone=False), nullable=True)
    elapsed_ms = Column(Integer, default=0)
    solved_count = Column(Integer, default=0)
    score = Column(Integer, default=0)
    recovery_credential_hash = Column(String(255), nullable=True)
    idempotency_salt = Column(UUID_STR, nullable=False, default=new_uuid)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)

    ruleset = relationship("Ruleset")
    challenges = relationship("SessionChallenge", back_populates="session", order_by="SessionChallenge.position")
    entitlement = relationship("Entitlement", back_populates="session", uselist=False)


class SessionChallenge(Base):
    __tablename__ = "session_challenges"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    session_id = Column(UUID_STR, ForeignKey("game_sessions.id"), nullable=False)
    position = Column(Integer, nullable=False)
    challenge_revision_id = Column(UUID_STR, ForeignKey("challenge_revisions.id"), nullable=False)
    outcome = Column(SQLEnum(Outcome), default=Outcome.pending, nullable=False)
    hint_used = Column(Boolean, default=False, nullable=False)
    awarded_points = Column(Integer, default=0, nullable=False)
    finalized_at = Column(DateTime(timezone=False), nullable=True)

    __table_args__ = (UniqueConstraint("session_id", "position", name="uq_session_position"),)

    session = relationship("GameSession", back_populates="challenges")
    revision = relationship("ChallengeRevision")
    attempts = relationship("Attempt", back_populates="session_challenge", order_by="Attempt.ordinal")

    def attempts_count(self) -> int:
        return len(self.attempts)


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    session_challenge_id = Column(UUID_STR, ForeignKey("session_challenges.id"), nullable=False)
    ordinal = Column(Integer, nullable=False)
    answer_summary = Column(String(500), nullable=True)
    correct = Column(Boolean, nullable=False)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    idempotency_key = Column(String(255), nullable=False)

    session_challenge = relationship("SessionChallenge", back_populates="attempts")

    __table_args__ = (UniqueConstraint("session_challenge_id", "ordinal", name="uq_attempt_ordinal"),)


class Entitlement(Base):
    __tablename__ = "entitlements"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    session_id = Column(UUID_STR, ForeignKey("game_sessions.id"), nullable=False, unique=True)
    state = Column(SQLEnum(EntitlementState), default=EntitlementState.pending, nullable=False)
    qualified_at = Column(DateTime(timezone=False), nullable=True)
    reason = Column(String(50), nullable=True)
    expiry = Column(DateTime(timezone=False), nullable=True)

    session = relationship("GameSession", back_populates="entitlement")
    awards = relationship("Award", back_populates="entitlement")


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    scope = Column(String(255), nullable=False)
    route = Column(String(255), nullable=False)
    key = Column(String(255), nullable=False)
    request_hash = Column(String(64), nullable=False)
    response_status = Column(Integer, nullable=False)
    response_body = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("scope", "route", "key", name="uq_idempotency_scope_route_key"),)


class Prize(Base):
    __tablename__ = "prizes"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    event_id = Column(UUID_STR, ForeignKey("events.id"), nullable=False)
    name = Column(String(200), nullable=False)
    short_label = Column(String(50), nullable=False)
    icon = Column(String(10), nullable=False, default="🎁")
    description = Column(Text, nullable=False, default="")
    image_url = Column(String(500), nullable=True)
    weight = Column(Integer, nullable=False, default=1)
    active = Column(Boolean, nullable=False, default=True)
    archived = Column(Boolean, nullable=False, default=False)
    display_order = Column(Integer, nullable=False, default=0)
    color = Column(String(20), nullable=True, default="#20E3FF")
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=False), default=utcnow, onupdate=utcnow, nullable=False)

    inventory = relationship("PrizeInventory", back_populates="prize", uselist=False)
    awards = relationship("Award", back_populates="prize")


class PrizeInventory(Base):
    __tablename__ = "prize_inventory"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    prize_id = Column(UUID_STR, ForeignKey("prizes.id"), nullable=False, unique=True)
    stock_received = Column(Integer, nullable=False, default=0)
    stock_reserved = Column(Integer, nullable=False, default=0)
    stock_redeemed = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=False), default=utcnow, onupdate=utcnow, nullable=False)

    prize = relationship("Prize", back_populates="inventory")

    @property
    def available(self) -> int:
        return self.stock_received - self.stock_reserved - self.stock_redeemed


class Award(Base):
    __tablename__ = "awards"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    event_id = Column(UUID_STR, ForeignKey("events.id"), nullable=False)
    session_id = Column(UUID_STR, ForeignKey("game_sessions.id"), nullable=False)
    entitlement_id = Column(UUID_STR, ForeignKey("entitlements.id"), nullable=False)
    prize_id = Column(UUID_STR, ForeignKey("prizes.id"), nullable=False)
    claim_code = Column(String(50), nullable=False)
    claim_code_hash = Column(String(64), nullable=False)
    segment_index = Column(Integer, nullable=False)
    status = Column(SQLEnum(AwardState), nullable=False, default=AwardState.awarded)
    draw_snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    redeemed_at = Column(DateTime(timezone=False), nullable=True)
    redeemed_by = Column(UUID_STR, ForeignKey("staff_users.id"), nullable=True)

    session = relationship("GameSession")
    entitlement = relationship("Entitlement")
    prize = relationship("Prize", back_populates="awards")
    staff_user = relationship("StaffUser")

    __table_args__ = (
        UniqueConstraint("session_id", name="uq_award_session"),
        UniqueConstraint("claim_code", name="uq_award_claim_code"),
    )


class StaffUser(Base):
    __tablename__ = "staff_users"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    username = Column(String(100), unique=True, nullable=False)
    display_name = Column(String(200), nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SQLEnum(StaffRole), nullable=False, default=StaffRole.staff)
    active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
    last_login_at = Column(DateTime(timezone=False), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID_STR, primary_key=True, default=new_uuid)
    actor_id = Column(UUID_STR, nullable=True)
    actor_type = Column(String(50), nullable=False, default="system")
    action = Column(String(100), nullable=False)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(UUID_STR, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=False), default=utcnow, nullable=False)
