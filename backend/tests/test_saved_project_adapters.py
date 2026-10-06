import base64

import pytest
from fastapi import HTTPException

from planqer.saved_project_adapters import load_saved_json, update_saved_image


def test_load_saved_json_rejects_malformed_legacy_data_with_actionable_error():
    with pytest.raises(HTTPException, match="Saved board parts is not valid JSON"):
        load_saved_json("{not-json}", field="board parts", default={}, expected=dict)


def test_saved_image_download_uses_unicode_filename_and_safe_ascii_fallback():
    response = update_saved_image(
        base64.b64encode(b"<svg/>").decode(),
        project_name="Ångström / kitchen",
        diagram_label="cutlist",
    )

    assert response.headers["content-type"] == "image/png"
    assert (
        'filename="Angstrom kitchen - Cutlist.png"'
        in response.headers["content-disposition"]
    )
    assert (
        "filename*=UTF-8''%C3%85ngstr%C3%B6m%20kitchen"
        in response.headers["content-disposition"]
    )


def test_saved_image_download_rejects_invalid_base64():
    with pytest.raises(HTTPException, match="invalid base64"):
        update_saved_image(
            "not base64", project_name="Kitchen", diagram_label="cutlist"
        )
