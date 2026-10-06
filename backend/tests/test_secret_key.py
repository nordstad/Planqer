import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from planqer.auth import secret_key
from planqer.auth.secret_key import resolve_secret_key


def test_environment_key_wins_without_creating_a_file(tmp_path: Path):
    key_path = tmp_path / "data" / ".secret_key"

    assert (
        resolve_secret_key(
            environment={"SECRET_KEY": "from-environment"},
            auth_config={"secret_key": "from-config"},
            key_path=key_path,
        )
        == "from-environment"
    )
    assert not key_path.exists()


def test_configured_key_wins_without_creating_a_file(tmp_path: Path):
    key_path = tmp_path / "data" / ".secret_key"

    assert (
        resolve_secret_key(
            environment={},
            auth_config={"secret_key": "from-config"},
            key_path=key_path,
        )
        == "from-config"
    )
    assert not key_path.exists()


def test_generated_key_is_persisted_and_reused(tmp_path: Path):
    key_path = tmp_path / "data" / ".secret_key"

    first_key = resolve_secret_key(environment={}, key_path=key_path)
    second_key = resolve_secret_key(environment={}, key_path=key_path)

    assert len(first_key) == 64
    assert all(character in "0123456789abcdef" for character in first_key)
    assert second_key == first_key
    assert key_path.read_text() == first_key
    assert os.stat(key_path).st_mode & 0o777 == 0o600


def test_concurrent_generation_reuses_the_key_created_by_the_winner(tmp_path: Path):
    key_path = tmp_path / "data" / ".secret_key"

    with ThreadPoolExecutor(max_workers=2) as executor:
        keys = list(
            executor.map(
                lambda _: resolve_secret_key(environment={}, key_path=key_path),
                range(2),
            )
        )

    assert keys[0] == keys[1] == key_path.read_text()


def test_empty_key_file_falls_back_to_temporary_key(tmp_path: Path, monkeypatch):
    key_path = tmp_path / "data" / ".secret_key"
    key_path.parent.mkdir()
    key_path.touch()
    warnings = []
    monkeypatch.setattr(
        secret_key.logger, "warning", lambda message, *args: warnings.append(message)
    )

    key = resolve_secret_key(environment={}, key_path=key_path)

    assert len(key) == 64
    assert "generated a temporary key" in warnings[0]


def test_unwritable_key_path_falls_back_to_temporary_key(tmp_path: Path, monkeypatch):
    key_path = tmp_path / "not-a-directory" / ".secret_key"
    key_path.parent.write_text("not a directory")
    warnings = []
    monkeypatch.setattr(
        secret_key.logger, "warning", lambda message, *args: warnings.append(message)
    )

    key = resolve_secret_key(environment={}, key_path=key_path)

    assert len(key) == 64
    assert "generated a temporary key" in warnings[0]
