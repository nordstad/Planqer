import os

import pytest

TEST_DB_PATH = "./test_planqer.db"

# Set at collection time, before any test module's top-level `from planqer.api
# import app` runs — planqer.database.connection reads DATABASE_URL once, at
# import time, so setting this inside a fixture would be too late for
# whichever test file happens to get collected (and thus imported) first.
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_PATH}"


@pytest.fixture(scope="session", autouse=True)
def _cleanup_test_database():
    yield
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)
