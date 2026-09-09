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


# The rate-limited endpoints (/cutting-plans, /sheet-optimization,
# /api/tile-layout, etc.) share one process-lifetime Limiter instance —
# `app.state.limiter` is created once at import time in api.py, so its
# in-memory request counts persist across every test in the whole session,
# not just within one test file. As more test files legitimately need a
# real solve from the same endpoint, their combined count can exceed that
# endpoint's own "10 per minute" long before a real user ever would.
# Resetting before every test keeps each test's own rate-limit budget
# independent of how many other tests happened to run first — this is a
# test-isolation fix, not a loosening of the real limit real users see.
@pytest.fixture(autouse=True)
def _reset_rate_limits():
    from planqer.api import app

    app.state.limiter.reset()
    yield
