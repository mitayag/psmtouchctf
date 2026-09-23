import logging

from sqlalchemy import Enum as SAEnum, create_engine, event, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import get_database_url, get_settings

logger = logging.getLogger("touchctf")

settings = get_settings()
DATABASE_URL = get_database_url(settings)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_columns(bind) -> None:
    """Create tables if missing, then additively reconcile missing columns.

    create_all() never alters existing tables, so a volume created by an older
    model (missing game_sessions.prepared_at, challenge_pools.recently_assigned)
    makes every session query raise OperationalError. Only data-preserving
    ADD COLUMN is issued; nothing is dropped or rewritten.
    """
    Base.metadata.create_all(bind=bind)
    inspector = inspect(bind)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        missing = [col for col in table.columns if col.name not in existing]
        if not missing:
            continue
        with bind.begin() as conn:
            for col in missing:
                col_type = col.type.compile(bind.dialect)
                if col.nullable:
                    conn.execute(
                        text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}')
                    )
                    logger.info("Schema reconcile: added %s.%s", table.name, col.name)
                else:
                    logger.error(
                        "Schema reconcile: cannot add NOT NULL column %s.%s without a server default; skipping",
                        table.name,
                        col.name,
                    )


def required_enum_values() -> dict[str, set[str]]:
    """Map each native enum type name to the values the models expect."""
    import app.models  # noqa: F401 — populate Base.metadata before scanning

    required: dict[str, set[str]] = {}
    for table in Base.metadata.sorted_tables:
        for col in table.columns:
            col_type = col.type
            if isinstance(col_type, SAEnum):
                required.setdefault(col_type.name, set()).update(
                    str(v) for v in col_type.enums
                )
    return required


def ensure_enum_values(bind) -> None:
    """Add missing native enum values (PostgreSQL) so model states stay writable.

    create_all() never alters existing types: the gamesessionstate enum created
    by migration 2a92775f145c lacked 'prepared', so any query binding that state
    raised InvalidTextRepresentation (HTTP 500) even with the column present.
    Only additive ALTER TYPE ... ADD VALUE is issued; values are never removed.
    """
    if bind.dialect.name != "postgresql":
        return
    required = required_enum_values()
    if not required:
        return
    with bind.begin() as conn:
        for type_name in sorted(required):
            rows = conn.execute(
                text(
                    "SELECT e.enumlabel FROM pg_type t "
                    "JOIN pg_enum e ON e.enumtypid = t.oid "
                    "WHERE t.typname = :name"
                ),
                {"name": type_name},
            ).fetchall()
            if not rows:
                continue  # type not created yet; create_all runs first
            existing = {row[0] for row in rows}
            for value in sorted(required[type_name] - existing):
                safe_value = value.replace("'", "''")
                conn.execute(
                    text(
                        f"ALTER TYPE \"{type_name}\" "
                        f"ADD VALUE IF NOT EXISTS '{safe_value}'"
                    )
                )
                logger.info("Schema reconcile: added enum value %s.%s", type_name, value)
