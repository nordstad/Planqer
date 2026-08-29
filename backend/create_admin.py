#!/usr/bin/env python3
"""
Admin user management script for Planqer.

Creates admin users, promotes existing users to admin, and lists users on a
self-hosted instance.
"""
import asyncio
import getpass
import os
import re
import sys
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth.security import get_password_hash
from planqer.database import User, engine


def validate_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character"
    return True, ""


def get_secure_password(email: str, prompt: str = "Enter password for admin user '{email}': ") -> str:
    while True:
        password = getpass.getpass(prompt.format(email=email))
        if not password:
            print("Password cannot be empty. Please try again.")
            continue

        if not validate_password(password)[0]:
            print("Password does not meet the required policy. Please choose a different password.")
            continue

        if password != getpass.getpass("Confirm password: "):
            print("Passwords don't match. Please try again.")
            continue

        return password


def get_email_input() -> str:
    while True:
        email = input("Enter admin email address: ").strip().lower()
        if not email:
            print("Email cannot be empty. Please try again.")
            continue
        if not validate_email(email):
            print("Invalid email format. Please enter a valid email address.")
            continue
        return email


async def create_admin_user(email: str, password: Optional[str] = None, force: bool = False):
    async with AsyncSession(engine) as session:
        stmt = select(User).where(User.email == email)
        result = await session.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            if existing_user.is_admin:
                print(f"User '{email}' is already an admin.")
                return existing_user

            if not force:
                confirm = input(f"User '{email}' exists. Promote to admin? (y/N): ").strip().lower()
                if confirm not in ["y", "yes"]:
                    print("Operation cancelled.")
                    return None

            existing_user.is_admin = True
            existing_user.is_active = True
            await session.commit()
            print(f"User '{email}' has been promoted to admin.")
            return existing_user

        if not force:
            confirm = input(f"Create new admin user '{email}'? (y/N): ").strip().lower()
            if confirm not in ["y", "yes"]:
                print("Operation cancelled.")
                return None

        if not password:
            password = get_secure_password(email)
        else:
            if not validate_password(password)[0]:
                print("Password validation failed. Please choose a different password.")
                return None

        admin_user = User(
            email=email, hashed_password=get_password_hash(password), is_active=True, is_admin=True
        )

        session.add(admin_user)
        await session.commit()
        await session.refresh(admin_user)

        print(f"Admin user '{email}' created successfully.")
        return admin_user


async def set_user_password(email: str, password: Optional[str] = None, force: bool = False):
    async with AsyncSession(engine) as session:
        stmt = select(User).where(User.email == email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            print(f"No user found with email '{email}'.")
            return None

        if not force:
            confirm = input(f"Set a new password for '{email}'? (y/N): ").strip().lower()
            if confirm not in ["y", "yes"]:
                print("Operation cancelled.")
                return None

        if not password:
            password = get_secure_password(email, prompt="Enter new password for '{email}': ")
        else:
            if not validate_password(password)[0]:
                print("Password validation failed. Please choose a different password.")
                return None

        user.hashed_password = get_password_hash(password)
        await session.commit()

        print(f"Password updated for '{email}'.")
        return user


async def list_users():
    async with AsyncSession(engine) as session:
        stmt = select(User).order_by(User.created_at.desc())
        result = await session.execute(stmt)
        users = result.scalars().all()

        if not users:
            print("No users found in database.")
            return

        print("\nCurrent users:")
        print("-" * 60)
        for user in users:
            admin_status = "ADMIN" if user.is_admin else "USER"
            active_status = "ACTIVE" if user.is_active else "INACTIVE"
            print(f"{user.email:<30} {admin_status:<8} {active_status}")
        print("-" * 60)


async def check_database_connection():
    try:
        async with AsyncSession(engine) as session:
            await session.execute(select(User).limit(1))
        return True
    except Exception as e:
        print(f"Database connection failed: {e}")
        print("Make sure the database has been migrated: uv run alembic upgrade head")
        return False


def print_usage():
    print("Planqer Admin User Management")
    print("=" * 50)
    print()
    print("Usage:")
    print("  python create_admin.py                       # Interactive mode")
    print("  python create_admin.py list                   # List all users")
    print("  python create_admin.py <email>                # Create/promote user (interactive)")
    print("  python create_admin.py <email> --force        # Create/promote user (no prompts)")
    print("  python create_admin.py set-password <email>   # Reset a user's password (e.g. after a lockout)")
    print()
    print("Environment Variables:")
    print("  PLANQER_ADMIN_EMAIL      Admin email address")
    print("  PLANQER_ADMIN_PASSWORD   Admin password (use with caution)")
    print()
    print("Docker usage:")
    print("  docker exec -it planqer-web-backend uv run python create_admin.py")


async def main():
    print("Planqer Admin User Management")
    print("=" * 50)

    if not await check_database_connection():
        sys.exit(1)

    if len(sys.argv) == 1:
        print("Interactive admin creation mode\n")

        env_email = os.getenv("PLANQER_ADMIN_EMAIL")
        env_password = os.getenv("PLANQER_ADMIN_PASSWORD")

        if env_email:
            print(f"Found admin email in environment: {env_email}")
            email = env_email
            password = env_password
            force = bool(env_password)
        else:
            email = get_email_input()
            password = None
            force = False

        try:
            await create_admin_user(email, password, force=force)
            print("\nCurrent user list:")
            await list_users()
        except KeyboardInterrupt:
            print("\nOperation cancelled by user.")
            sys.exit(1)
        except Exception as e:
            print(f"Error creating admin user: {e}")
            sys.exit(1)

        return

    command = sys.argv[1]

    if command in ["-h", "--help", "help"]:
        print_usage()
        return

    if command == "list":
        await list_users()
        return

    if command == "set-password":
        if len(sys.argv) < 3:
            print("Usage: python create_admin.py set-password <email> [--force]")
            sys.exit(1)
        email = sys.argv[2]
        force = "--force" in sys.argv
        if not validate_email(email):
            print(f"Invalid email format: {email}")
            sys.exit(1)
        try:
            await set_user_password(email, password=None, force=force)
        except KeyboardInterrupt:
            print("\nOperation cancelled by user.")
            sys.exit(1)
        except Exception as e:
            print(f"Error: {e}")
            sys.exit(1)
        return

    email = command
    force = "--force" in sys.argv

    if not validate_email(email):
        print(f"Invalid email format: {email}")
        print_usage()
        sys.exit(1)

    try:
        await create_admin_user(email, password=None, force=force)
        print("\nUpdated user list:")
        await list_users()
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
