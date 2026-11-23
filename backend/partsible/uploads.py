from typing import Protocol


class UploadedFile(Protocol):
    """The part of an uploaded file the cutlist readers use.

    Starlette's `UploadFile` satisfies it, so the server can pass uploads
    straight through without the core importing FastAPI.
    """

    filename: str | None
    size: int | None

    async def read(self) -> bytes: ...
