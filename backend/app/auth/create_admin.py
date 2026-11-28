from getpass import getpass

from app.core.database import Base, engine, SessionLocal
from app.db.models import User  # noqa: F401 - registers all models with Base
from app.auth.security import hash_password


def main() -> None:
    Base.metadata.create_all(bind=engine)
    email = input("Admin email: ").strip().lower()
    password = getpass("Admin password (minimum 12 characters): ")
    confirm = getpass("Confirm password: ")
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise SystemExit("Enter a valid email address.")
    if len(password) < 12:
        raise SystemExit("Password must contain at least 12 characters.")
    if password != confirm:
        raise SystemExit("Passwords do not match.")

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise SystemExit("That email already has an account. No changes were made.")
        name = email.split("@")[0].title() or "Administrator"
        db.add(User(name=name, email=email, password_hash=hash_password(password), role="admin", is_active=True))
        db.commit()
        print(f"Admin account created for {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
