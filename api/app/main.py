import hashlib
import logging
import secrets
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import engine, models, schemas, seed
from app.config import get_settings
from app.database import (
    SessionLocal,
    engine as db_engine,
    ensure_columns,
    ensure_enum_values,
    get_db,
)

logger = logging.getLogger("touchctf")


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_columns(db_engine)
    ensure_enum_values(db_engine)
    db = SessionLocal()
    try:
        seed.seed(db)
        event = engine.open_event(db)
        engine.seed_prizes(db, event.id)
    finally:
        db.close()
    yield


app = FastAPI(
    title="PSM TouchCTF API",
    version="2.0.0",
    docs_url="/api/docs" if get_settings().app_env != "production" else None,
    redoc_url=None,
    lifespan=lifespan,
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.allowed_hosts.split(",") if o.strip()] if settings.allowed_hosts != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    start = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.exception("Unhandled error", extra={"request_id": request_id, "path": request.url.path})
        # Re-raise so FastAPI exception handlers can map known errors (PermissionError,
        # ValueError, HTTPException) to the correct status codes. A fallback handler
        # below turns any remaining unhandled exception into the JSON 500 response.
        raise exc
    response.headers["x-request-id"] = request_id
    return response


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", str(uuid.uuid4()))


@app.exception_handler(PermissionError)
async def permission_error_handler(request: Request, exc: PermissionError):
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"detail": str(exc)},
    )


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": str(exc)},
    )


@app.exception_handler(Exception)
async def catch_all_handler(request: Request, exc: Exception):
    request_id = get_request_id(request)
    logger.exception("Unhandled error", extra={"request_id": request_id, "path": request.url.path})
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error", "request_id": request_id},
    )


def get_kiosk_hash(kiosk_credential: str = Header(default="default-kiosk")) -> str:
    return hashlib.sha256(kiosk_credential.encode()).hexdigest()


@app.get("/api/v1/health/live")
def health_live():
    return {"status": "ok"}


@app.get("/api/v1/health/ready")
def health_ready(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ready", "database": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Database not ready")


@app.get("/api/v1/public/config")
def public_config(db: Session = Depends(get_db)):
    event = engine.ensure_event(db)
    ruleset = engine.get_published_ruleset(db, event.id)
    return schemas.PublicConfigOut(
        event_id=event.id,
        event_name=event.name,
        event_open=event.state == models.EventState.open,
        duration_seconds=ruleset.duration_seconds,
        qualification_solves_required=ruleset.qualification_solves_required,
    )


@app.get("/api/v1/public/event")
def public_event(db: Session = Depends(get_db)):
    event = engine.ensure_event(db)
    ruleset = engine.get_published_ruleset(db, event.id)
    return schemas.EventStatusOut(
        id=event.id,
        name=event.name,
        state=event.state.value,
        open=event.state == models.EventState.open,
        duration_seconds=ruleset.duration_seconds,
        qualification_text=f"Solve at least {ruleset.qualification_solves_required} of the 3 challenges and capture the final flag before time expires.",
    )


@app.post("/api/v1/sessions", response_model=schemas.SessionOut)
def create_session(
    req: schemas.SessionStartRequest,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    event = engine.ensure_event(db)
    if event.state != models.EventState.open:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Event is not open")
    ruleset = engine.get_published_ruleset(db, event.id)
    kiosk = engine.ensure_kiosk(db, event.id, req.kiosk_credential)

    # If force_new, abandon any existing active session for this kiosk
    if getattr(req, "force_new", False):
        active_states = [models.GameSessionState.ready, models.GameSessionState.prepared, models.GameSessionState.active]
        existing = (
            db.query(models.GameSession)
            .filter(
                models.GameSession.kiosk_id == kiosk.id,
                models.GameSession.state.in_(active_states),
            )
            .order_by(models.GameSession.created_at.desc())
            .first()
        )
        if existing:
            engine.abandon_session(db, existing, str(uuid.uuid4()))

    try:
        session = engine.start_session(
            db,
            event_id=event.id,
            ruleset_id=ruleset.id,
            kiosk_id=kiosk.id,
            alias=req.alias,
            publish_consent=req.publish_consent,
            accessibility_mode=req.accessibility_mode,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return engine.to_session_out(session)


@app.post("/api/v1/sessions/{session_id}/begin", response_model=schemas.SessionOut)
def begin_session(
    session_id: str,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    engine.begin_round(db, session)
    return engine.to_session_out(session)


@app.post("/api/v1/sessions/{session_id}/prepare", response_model=schemas.SessionOut)
def prepare_session(
    session_id: str,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    """Idempotent preparation: ready → prepared.  Countdown consumes no game time."""
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    engine.prepare_session(db, session)
    return engine.to_session_out(session)


@app.get("/api/v1/sessions/{session_id}", response_model=schemas.SessionOut)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    if session.state == models.GameSessionState.active and engine.check_expired(session):
        engine.finalize_session(db, session, models.GameSessionState.expired)
    return engine.to_session_out(session)


@app.post("/api/v1/sessions/{session_id}/answers", response_model=schemas.AnswerResponse)
def submit_answer(
    session_id: str,
    req: schemas.AnswerRequest,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    try:
        return engine.submit_answer(db, session, req.answer, req.idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@app.post("/api/v1/sessions/{session_id}/hints", response_model=schemas.HintResponse)
def request_hint(
    session_id: str,
    req: schemas.HintRequest,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    try:
        return engine.request_hint(db, session, req.idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@app.post("/api/v1/sessions/{session_id}/skip", response_model=schemas.SkipResponse)
def skip_challenge(
    session_id: str,
    req: schemas.SkipRequest,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    try:
        return engine.skip_challenge(db, session, req.idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@app.post("/api/v1/sessions/{session_id}/capture", response_model=schemas.CaptureResponse)
def capture_flag(
    session_id: str,
    req: schemas.CaptureRequest,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    try:
        return engine.capture_flag(db, session, req.flag, req.idempotency_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@app.get("/api/v1/sessions/{session_id}/results", response_model=schemas.ResultsOut)
def get_results(
    session_id: str,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    return engine.get_results(db, session)


@app.post("/api/v1/sessions/{session_id}/abandon")
def abandon_session(
    session_id: str,
    req: schemas.AbandonRequest,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    engine.abandon_session(db, session, req.idempotency_key)
    return {"abandoned": True}


@app.get("/api/v1/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    event = engine.ensure_event(db)
    entries = engine.get_leaderboard_entries(db, event.id, limit=10)
    return schemas.LeaderboardOut(entries=entries, updated_at=engine.utcnow())


# ──────────────────────────────────────────────────────────────────
# Phase 3: Prize endpoints
# ──────────────────────────────────────────────────────────────────


@app.get("/api/v1/prizes")
def list_prizes(
    db: Session = Depends(get_db),
):
    """Public endpoint: list active prizes for the wheel display."""
    event = engine.ensure_event(db)
    return engine.get_wheel_prizes(db, event.id)


@app.post("/api/v1/sessions/{session_id}/spin", response_model=schemas.SpinResponse)
def spin_prize(
    session_id: str,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    """Spin the prize wheel for a qualified session."""
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    if session.state != models.GameSessionState.completed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Round must be completed before spinning",
        )
    entitlement = db.query(models.Entitlement).filter(
        models.Entitlement.session_id == session.id
    ).first()
    if not entitlement or entitlement.state != models.EntitlementState.qualified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not eligible for a prize spin",
        )
    event = engine.ensure_event(db)
    return engine.draw_prize(db, event.id, session, entitlement)


@app.get("/api/v1/sessions/{session_id}/award")
def get_award(
    session_id: str,
    db: Session = Depends(get_db),
    kiosk_hash: str = Depends(get_kiosk_hash),
):
    """Get the existing award for a session (idempotent)."""
    session = engine.get_session_for_mutation(db, session_id, kiosk_hash)
    award = engine.get_award_by_session(db, session.id)
    if not award:
        return {"award": None}
    prize = db.query(models.Prize).filter(models.Prize.id == award.prize_id).first()
    return {"award": engine._award_to_out(award, prize)}


# ──────────────────────────────────────────────────────────────────
# Phase 3: Staff endpoints
# ──────────────────────────────────────────────────────────────────


def get_staff_auth(
    request: Request,
    db: Session = Depends(get_db),
) -> models.StaffUser:
    """Extract and validate staff bearer token."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
        )
    token = auth_header[7:]
    # Token is the user ID (simple for now; JWT in Phase 4)
    user = engine.get_staff_user(db, token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    return user


def require_staff(
    request: Request,
    db: Session = Depends(get_db),
) -> models.StaffUser:
    """Require any staff role."""
    return get_staff_auth(request, db)


def require_admin(
    request: Request,
    db: Session = Depends(get_db),
) -> models.StaffUser:
    """Require admin or system_admin role."""
    staff = get_staff_auth(request, db)
    if staff.role.value not in ("admin", "system_admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return staff


def require_system_admin(
    request: Request,
    db: Session = Depends(get_db),
) -> models.StaffUser:
    """Require system_admin role."""
    staff = get_staff_auth(request, db)
    if staff.role != models.StaffRole.system_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="System administrator access required")
    return staff


@app.post("/api/v1/staff/login", response_model=schemas.StaffLoginResponse)
def staff_login(
    req: schemas.StaffLoginRequest,
    db: Session = Depends(get_db),
):
    user = engine.staff_authenticate(db, req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return schemas.StaffLoginResponse(
        token=user.id,
        role=user.role.value,
        username=user.username,
    )


@app.get("/api/v1/staff/claims/outstanding")
def staff_outstanding_claims(
    staff: models.StaffUser = Depends(get_staff_auth),
    db: Session = Depends(get_db),
):
    """List all outstanding (awarded but not redeemed) claims."""
    return engine.staff_list_outstanding_claims(db)


@app.get("/api/v1/staff/claims/{claim_code}")
def staff_lookup_claim(
    claim_code: str,
    staff: models.StaffUser = Depends(get_staff_auth),
    db: Session = Depends(get_db),
):
    """Look up a specific claim by code."""
    result = engine.staff_lookup_claim(db, claim_code)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Claim code not found",
        )
    return result


@app.post("/api/v1/staff/claims/{claim_code}/redeem")
def staff_redeem_claim(
    claim_code: str,
    staff: models.StaffUser = Depends(get_staff_auth),
    db: Session = Depends(get_db),
):
    """Redeem (confirm handover of) a claim code."""
    return engine.staff_redeem_claim(db, claim_code, staff.id)


@app.get("/api/v1/staff/prizes")
def staff_list_prizes(
    staff: models.StaffUser = Depends(get_staff_auth),
    db: Session = Depends(get_db),
):
    """List all prizes with inventory status."""
    event = engine.ensure_event(db)
    return engine.staff_list_prizes_with_inventory(db, event.id)


# ──────────────────────────────────────────────────────────────────
# Phase 4: Admin endpoints
# ──────────────────────────────────────────────────────────────────


@app.get("/api/v1/admin/stats")
def admin_stats(
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_get_stats(db)


@app.get("/api/v1/admin/sessions", response_model=list[schemas.SessionListItemOut])
def admin_sessions(
    search: str | None = None,
    state: str | None = None,
    limit: int = 50,
    offset: int = 0,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_list_sessions(db, search=search, state=state, limit=limit, offset=offset)


@app.get("/api/v1/admin/sessions/{session_id}")
def admin_session_detail(
    session_id: str,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    result = engine.admin_get_session(db, session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


@app.post("/api/v1/admin/sessions/{session_id}/abandon")
def admin_abandon_session(
    session_id: str,
    req: schemas.LeaderboardModerateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    engine.admin_abandon_session(db, session_id, staff.id, req.reason)
    return {"abandoned": True}


@app.get("/api/v1/admin/challenges")
def admin_challenges(
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_list_challenges(db)


@app.get("/api/v1/admin/challenges/{challenge_id}")
def admin_challenge_detail(
    challenge_id: str,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    result = engine.admin_get_challenge(db, challenge_id)
    if not result:
        raise HTTPException(status_code=404, detail="Challenge not found")
    return result


@app.post("/api/v1/admin/challenges")
def admin_create_challenge(
    req: schemas.ChallengeCreateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_create_challenge(
        db,
        req.challenge_type,
        req.title,
        req.instruction,
        req.hint,
        req.explanation,
        req.public_data,
        req.private_validator,
        req.difficulty,
    )


@app.put("/api/v1/admin/challenges/{challenge_id}")
def admin_update_challenge(
    challenge_id: str,
    req: schemas.ChallengeUpdateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_update_challenge(
        db,
        challenge_id,
        req.title,
        req.instruction,
        req.hint,
        req.explanation,
        req.public_data,
        req.private_validator,
    )


@app.post("/api/v1/admin/challenges/revisions/{revision_id}/publish")
def admin_publish_revision(
    revision_id: str,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    engine.admin_publish_challenge_revision(db, revision_id, staff.id)
    return {"published": True}


@app.get("/api/v1/admin/prizes")
def admin_prizes(
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = engine.ensure_event(db)
    return engine.admin_list_prizes(db, event.id)


@app.put("/api/v1/admin/prizes/{prize_id}")
def admin_update_prize(
    prize_id: str,
    req: schemas.PrizeUpdateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_update_prize(db, prize_id, req.name, req.short_label, req.icon, req.description, req.image_url, req.weight, req.active, req.display_order, req.color, staff.id)


@app.post("/api/v1/admin/prizes/{prize_id}/adjust")
def admin_adjust_stock(
    prize_id: str,
    req: schemas.StockAdjustRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_adjust_stock(db, prize_id, req.adjustment, req.reason, staff.id)


@app.get("/api/v1/admin/leaderboard")
def admin_leaderboard(
    event_id: str | None = None,
    limit: int = 100,
    staff: models.StaffUser = Depends(require_staff),
    db: Session = Depends(get_db),
):
    if not event_id:
        event = engine.ensure_event(db)
        event_id = event.id
    return engine.admin_get_leaderboard(db, event_id, limit)


@app.post("/api/v1/admin/leaderboard/{session_id}/moderate")
def admin_moderate_leaderboard(
    session_id: str,
    req: schemas.LeaderboardModerateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    engine.admin_moderate_leaderboard(db, session_id, req.hide, req.reason, staff.id)
    return {"moderated": True}


@app.get("/api/v1/admin/analytics")
def admin_analytics(
    event_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_get_analytics(db, event_id, start_date, end_date)


@app.get("/api/v1/admin/analytics/export")
def admin_analytics_export(
    event_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    csv_data = engine.admin_export_analytics_csv(db, event_id, start_date, end_date)
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=touchctf-analytics.csv"},
    )


@app.get("/api/v1/admin/audit")
def admin_audit(
    limit: int = 100,
    offset: int = 0,
    action: str | None = None,
    entity_type: str | None = None,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_list_audit_logs(db, limit, offset, action, entity_type)


@app.get("/api/v1/admin/users")
def admin_staff_list(
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_list_staff(db)


@app.post("/api/v1/admin/users")
def admin_staff_create(
    req: schemas.StaffCreateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        return engine.admin_create_staff(db, req.username, req.password, req.role, req.display_name, staff.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.put("/api/v1/admin/users/{user_id}")
def admin_staff_update(
    user_id: str,
    req: schemas.StaffUpdateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_update_staff(db, user_id, req.role, req.active, req.display_name, staff.id)


@app.get("/api/v1/admin/events/{event_id}")
def admin_event_detail(
    event_id: str,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if event_id == "current":
        event = engine.ensure_event(db)
        event_id = event.id
    return engine.admin_get_event(db, event_id)


@app.put("/api/v1/admin/events/{event_id}")
def admin_event_update(
    event_id: str,
    req: schemas.EventUpdateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if event_id == "current":
        event = engine.ensure_event(db)
        event_id = event.id
    return engine.admin_update_event(db, event_id, req.name, req.state, req.timezone)


@app.post("/api/v1/admin/prizes")
def admin_create_prize(
    req: schemas.PrizeCreateRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    event = engine.ensure_event(db)
    try:
        return engine.admin_create_prize(
            db, event.id, req.name, req.short_label, req.icon,
            req.description, req.image_url, req.weight, req.active,
            req.display_order, req.color, req.initial_stock, staff.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/api/v1/admin/prizes/{prize_id}/archive")
def admin_archive_prize(
    prize_id: str,
    req: schemas.PrizeDeleteRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        return engine.admin_archive_prize(db, prize_id, req.reason, staff.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.post("/api/v1/admin/users/{user_id}/reset-password")
def admin_reset_password(
    user_id: str,
    req: schemas.StaffPasswordResetRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        return engine.admin_reset_staff_password(db, user_id, req.new_password, staff.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/api/v1/admin/users/{user_id}/delete")
def admin_delete_staff(
    user_id: str,
    req: schemas.StaffDeleteRequest,
    staff: models.StaffUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        return engine.admin_delete_staff(db, user_id, req.reason, staff.id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.get("/api/v1/admin/player-data/summary")
def admin_player_data_summary(
    staff: models.StaffUser = Depends(require_system_admin),
    db: Session = Depends(get_db),
):
    return engine.admin_player_data_summary(db)


@app.post("/api/v1/admin/player-data")
def admin_delete_player_data(
    req: schemas.DeletePlayerDataRequest,
    staff: models.StaffUser = Depends(require_system_admin),
    db: Session = Depends(get_db),
):
    try:
        return engine.admin_delete_player_data(db, staff.id, req.confirmation)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
