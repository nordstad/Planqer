"""Shared boundaries for data persisted by saved-project routes."""

import base64
import binascii
import json
import re
import unicodedata
from urllib.parse import quote

from fastapi import HTTPException, status
from fastapi.responses import Response


def load_saved_json(
    value: str | None, *, field: str, default: object, expected: type
) -> object:
    if value is None:
        return default
    try:
        decoded = json.loads(value)
    except (json.JSONDecodeError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Saved {field} is not valid JSON",
        ) from exc
    if not isinstance(decoded, expected):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                f"Saved {field} must be a {expected.__name__}, "
                f"not {type(decoded).__name__}"
            ),
        )
    return decoded


def update_saved_image(
    selected_image: str | None, *, project_name: str, diagram_label: str
) -> Response:
    if not selected_image or not selected_image.strip():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No diagram was saved with this {diagram_label}",
        )

    if selected_image.startswith("data:image/svg+xml;base64,"):
        image_data, media_type, extension = _split_data_url(
            selected_image, "image/svg+xml", "svg", diagram_label
        )
    elif selected_image.startswith("data:image/png;base64,"):
        image_data, media_type, extension = _split_data_url(
            selected_image, "image/png", "png", diagram_label
        )
    else:
        image_data, media_type, extension = selected_image, "image/png", "png"

    try:
        image_bytes = base64.b64decode(image_data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Saved {diagram_label} image is invalid base64: {exc}",
        ) from exc
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Saved {diagram_label} image is empty",
        )

    safe_name = _safe_filename(project_name)
    filename = f"{safe_name} - {diagram_label.title()}.{extension}"
    ascii_name = unicodedata.normalize("NFKD", filename).encode(
        "ascii", "ignore"
    ).decode() or f"download.{extension}"
    disposition = (
        f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'
    )
    return Response(
        content=image_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": disposition,
            "Content-Length": str(len(image_bytes)),
        },
    )


def _split_data_url(
    value: str, media_type: str, extension: str, diagram_label: str
) -> tuple[str, str, str]:
    try:
        return value.split(",", 1)[1], media_type, extension
    except IndexError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Saved {diagram_label} image is missing its data payload",
        ) from exc


def _safe_filename(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value)
    normalized = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|]+', " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" .")
    return normalized or "Untitled"
