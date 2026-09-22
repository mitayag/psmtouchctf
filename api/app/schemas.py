from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator


class ErrorResponse(BaseModel):
    detail: str
    request_id: str | None = None


class EventStatusOut(BaseModel):
    id: str
    name: str
    state: str
    open: bool
    duration_seconds: int
    qualification_text: str


class RulesetOut(BaseModel):
    id: str
    revision: int
    duration_seconds: int
    extended_duration_seconds: int
    max_attempts: int
    hint_penalty: int
    base_points: int
    wrong_attempt_penalty: int
    capture_bonus: int
    qualification_solves_required: int


class ChallengePublic(BaseModel):
    id: str
    position: int
    type: str
    title: str
    instruction: str
    hint: str | None = None
    hint_used: bool = False
    outcome: str
    data: dict[str, Any]


class SessionStartRequest(BaseModel):
    alias: str | None = Field(default=None, max_length=100)
    publish_consent: bool = False
    accessibility_mode: str = "standard"
    kiosk_credential: str = Field(default="default-kiosk")
    force_new: bool = False

    @field_validator("alias")
    @classmethod
    def validate_alias(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 100:
            raise ValueError("Alias must be 100 characters or fewer")
        if len(v) > 0 and len(v) < 2:
            raise ValueError("Alias must be at least 2 characters or blank")
        return v


class SessionOut(BaseModel):
    id: str
    alias: str
    state: str
    score: int
    solved_count: int
    prepared_at: datetime | None = None
    started_at: datetime | None = None
    expires_at: datetime | None = None
    server_now: datetime
    elapsed_ms: int
    qualified: bool = False
    current_position: int | None = None
    challenges: list[ChallengePublic]

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("prepared_at", "started_at", "expires_at", "server_now")
    def serialize_datetime(self, dt: datetime | None, _info) -> str | None:
        """Serialize naive UTC datetimes with an explicit Z suffix."""
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")


class AnswerRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=1, max_length=255)
    answer: Any


class AnswerResponse(BaseModel):
    correct: bool
    finished: bool
    attempts_remaining: int
    score: int
    feedback: str | None = None
    explanation: str | None = None


class HintRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=1, max_length=255)


class HintResponse(BaseModel):
    hint: str
    score: int


class SkipRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=1, max_length=255)


class SkipResponse(BaseModel):
    skipped: bool
    score: int


class CaptureRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=1, max_length=255)
    flag: str | None = Field(default=None, max_length=500)


class CaptureResponse(BaseModel):
    captured: bool
    score: int
    qualified: bool
    time_bonus: int


class ResultsOut(BaseModel):
    id: str
    alias: str
    state: str
    score: int
    solved_count: int
    captured: bool
    qualified: bool
    elapsed_ms: int
    breakdown: dict[str, Any]
    entitlement_id: str | None = None


class LeaderboardEntryOut(BaseModel):
    rank: int
    nickname: str
    score: int
    solved_count: int
    elapsed_ms: int
    is_current_player: bool = False


class LeaderboardOut(BaseModel):
    entries: list[LeaderboardEntryOut]
    updated_at: datetime


class AbandonRequest(BaseModel):
    idempotency_key: str = Field(..., min_length=1, max_length=255)


class PublicConfigOut(BaseModel):
    event_id: str | None
    event_name: str
    event_open: bool
    duration_seconds: int
    qualification_solves_required: int


class HealthOut(BaseModel):
    status: str
    database: str
    version: str = "2.0.0"


class PrizeOut(BaseModel):
    id: str
    name: str
    short_label: str
    icon: str
    description: str
    image_url: str | None = None
    weight: int
    active: bool
    display_order: int
    color: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PrizeInventoryOut(BaseModel):
    prize_id: str
    name: str
    short_label: str
    icon: str
    weight: int
    active: bool
    color: str | None = None
    stock_received: int
    stock_reserved: int
    stock_redeemed: int
    available: int

    model_config = ConfigDict(from_attributes=True)


class AwardOut(BaseModel):
    id: str
    prize_id: str
    prize_name: str
    prize_icon: str
    prize_color: str | None = None
    claim_code: str
    segment_index: int
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at")
    def serialize_datetime(self, dt: datetime | None, _info) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")


class SpinResponse(BaseModel):
    award: AwardOut | None
    message: str
    no_stock: bool = False


class StaffLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class StaffLoginResponse(BaseModel):
    token: str
    role: str
    username: str


class ClaimLookupResponse(BaseModel):
    award_id: str
    claim_code: str
    prize_name: str
    prize_icon: str
    status: str
    player_alias: str
    awarded_at: datetime
    redeemed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("awarded_at", "redeemed_at")
    def serialize_datetime(self, dt: datetime | None, _info) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")


class RedeemResponse(BaseModel):
    success: bool
    message: str
    claim_code: str
    prize_name: str


class PrizeCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    short_label: str = Field(..., min_length=1, max_length=50)
    icon: str = Field(default="🎁", max_length=10)
    description: str = Field(default="", max_length=1000)
    image_url: str | None = Field(default=None, max_length=500)
    weight: int = Field(..., ge=1)
    active: bool = True
    display_order: int = 0
    color: str | None = Field(default=None, max_length=20)
    initial_stock: int = Field(default=0, ge=0)


class AdminStatsOut(BaseModel):
    total_sessions: int = 0
    active_sessions: int = 0
    completed_sessions: int = 0
    expired_sessions: int = 0
    abandoned_sessions: int = 0
    total_players: int = 0
    prizes_awarded: int = 0
    pending_claims: int = 0
    total_solved: int = 0
    total_attempts: int = 0
    hints_used: int = 0
    captures: int = 0


class SessionListItemOut(BaseModel):
    id: str
    alias: str
    state: str
    score: int
    solved_count: int
    elapsed_ms: int
    publish_consent: bool
    kiosk_id: str
    created_at: datetime
    started_at: datetime | None = None
    finalized_at: datetime | None = None
    award_status: str | None = None
    award_prize_name: str | None = None
    claim_code: str | None = None

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at", "started_at", "finalized_at")
    def serialize_datetime(self, dt: datetime | None, _info) -> str | None:
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")


class ChallengeListItemOut(BaseModel):
    id: str
    stable_id: str
    type: str
    difficulty: str
    title: str
    published: bool
    revision_number: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChallengeDetailOut(BaseModel):
    id: str
    stable_id: str
    type: str
    difficulty: str
    created_at: datetime
    revisions: list[dict]


class ChallengeCreateRequest(BaseModel):
    challenge_type: str = Field(..., pattern="^(phishing|logs|decode)$")
    title: str = Field(..., min_length=1, max_length=200)
    instruction: str = Field(..., min_length=1)
    hint: str = Field(default="", max_length=2000)
    explanation: str = Field(default="", max_length=5000)
    public_data: dict = Field(default_factory=dict)
    private_validator: dict = Field(default_factory=dict)
    difficulty: str = Field(default="standard", max_length=50)


class ChallengeUpdateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    instruction: str | None = None
    hint: str | None = Field(default=None, max_length=2000)
    explanation: str | None = Field(default=None, max_length=5000)
    public_data: dict | None = None
    private_validator: dict | None = None


class PrizeListItemOut(BaseModel):
    id: str
    name: str
    short_label: str
    icon: str
    description: str = ""
    image_url: str | None = None
    weight: int
    active: bool
    archived: bool = False
    display_order: int
    color: str | None = None
    stock_received: int = 0
    stock_reserved: int = 0
    stock_redeemed: int = 0
    available: int = 0
    odds_percent: float = 0.0


class PrizeUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    short_label: str | None = Field(default=None, max_length=50)
    icon: str | None = Field(default=None, max_length=10)
    description: str | None = Field(default=None, max_length=1000)
    image_url: str | None = Field(default=None, max_length=500)
    weight: int | None = Field(default=None, ge=1)
    active: bool | None = None
    display_order: int | None = None
    color: str | None = Field(default=None, max_length=20)


class StockAdjustRequest(BaseModel):
    adjustment: int
    reason: str = Field(..., min_length=1, max_length=500)


class LeaderboardEntryAdminOut(BaseModel):
    rank: int
    alias: str
    score: int
    solved_count: int
    elapsed_ms: int
    captured: bool
    publish_consent: bool
    is_hidden: bool = False
    session_id: str
    finalized_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class LeaderboardModerateRequest(BaseModel):
    hide: bool
    reason: str = Field(..., min_length=1, max_length=500)


class AnalyticsOut(BaseModel):
    rounds_started: int = 0
    rounds_completed: int = 0
    rounds_expired: int = 0
    rounds_abandoned: int = 0
    completion_rate: float = 0.0
    qualification_rate: float = 0.0
    total_players: int = 0
    avg_score: float = 0.0
    median_score: float = 0.0
    avg_duration_ms: float = 0.0
    challenge_stats: list[dict] = Field(default_factory=list)
    prize_distribution: list[dict] = Field(default_factory=list)
    inventory_status: list[dict] = Field(default_factory=list)


class AuditLogOut(BaseModel):
    id: str
    actor_id: str | None = None
    actor_type: str
    action: str
    entity_type: str
    entity_id: str | None = None
    details: dict | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StaffListItemOut(BaseModel):
    id: str
    username: str
    display_name: str | None = None
    role: str
    active: bool
    created_at: datetime
    last_login_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class StaffCreateRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=6, max_length=200)
    display_name: str | None = Field(default=None, max_length=200)
    role: str = Field(default="staff", pattern="^(staff|admin|system_admin)$")


class StaffUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, pattern="^(staff|admin|system_admin)$")
    active: bool | None = None


class EventDetailOut(BaseModel):
    id: str
    name: str
    state: str
    timezone: str
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    active_ruleset_id: str | None = None
    created_at: datetime
    ruleset: dict | None = None


class EventUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    state: str | None = Field(default=None, pattern="^(draft|open|paused|closed)$")
    timezone: str | None = Field(default=None, max_length=50)


class StaffPasswordResetRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=200)


class PrizeDeleteRequest(BaseModel):
    reason: str = Field(default="Archived by admin", max_length=500)


class StaffDeleteRequest(BaseModel):
    reason: str = Field(default="Removed by admin", max_length=500)


class DeletePlayerDataRequest(BaseModel):
    confirmation: str = Field(..., pattern="^DELETE PLAYER DATA$")
