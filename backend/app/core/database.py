from urllib.parse import urlparse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

db_url = settings.DATABASE_URL
connect_args = {}

if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif "postgres" in db_url:
    # Ensure postgresql+psycopg2 driver dialect is specified
    if db_url.startswith("postgresql://"):
        db_url = "postgresql+psycopg2://" + db_url[len("postgresql://"):]
    # Auto-resolve host via fallback DNS if local router DNS blocks/refuses cloud domain
    try:
        parsed = urlparse(db_url)
        if parsed.hostname:
            try:
                import socket
                socket.gethostbyname(parsed.hostname)
            except Exception:
                import dns.resolver
                res = dns.resolver.Resolver()
                res.nameservers = ['8.8.8.8', '1.1.1.1']
                ip = res.resolve(parsed.hostname, 'A')[0].to_text()
                connect_args["hostaddr"] = ip
    except Exception:
        pass

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
