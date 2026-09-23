import logging

from sqlalchemy import create_engine, event, inspect, text
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
