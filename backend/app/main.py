import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Depends
from app.auth.dependencies import get_current_user, enforce_api_permissions
from app.api.auth_endpoints import router as auth_router
import app.db.models  # Register SQLAlchemy models before create_all
from app.core.config import settings
from app.core.database import engine, Base
from app.api.endpoints import router as api_router

# Setup logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)

logger = logging.getLogger(__name__)

# Initialize database tables
try:
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        from sqlalchemy import text
        res = conn.execute(text("PRAGMA table_info(users)"))
        cols = [r[1] for r in res.fetchall()]
        if cols and "name" not in cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN name VARCHAR(100) DEFAULT ''"))
            conn.commit()
            logger.info("Added 'name' column to users table.")
    logger.info("Database tables initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize database tables: {e}")

# Instantiate FastAPI App
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="IoT Sentinel: Intrusion Detection & Threat Analysis Platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)


@app.on_event("startup")
async def validate_auth_configuration():
    if not settings.AUTH_SECRET_KEY or len(settings.AUTH_SECRET_KEY.encode("utf-8")) < 32:
        raise RuntimeError(
            "Set AUTH_SECRET_KEY in the repository-root .env file to a random value "
            "of at least 32 bytes before starting IoT Shield."
        )

# Set up CORS middleware
# Only trusted frontend origins may make credentialed requests.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_auth_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth")
app.include_router(
    api_router,
    prefix=settings.API_V1_STR,
    dependencies=[Depends(get_current_user), Depends(enforce_api_permissions)],
)

@app.get("/")
def read_root():
    return {
        "message": "Welcome to IoT Sentinel Intrusion Detection Platform API",
        "docs": "/docs",
        "status": "online"
    }
