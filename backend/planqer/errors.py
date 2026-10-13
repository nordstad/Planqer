class PlanqerError(Exception):
    """A calculation failed for a reason the caller should see.

    Plain Python so the core runs without FastAPI (in the browser). The HTTP
    layer turns it into the same status and `{"detail": ...}` body that an
    `HTTPException` produced before; see `planqer.api`.
    """

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail

    def __str__(self) -> str:
        # Matches str(HTTPException), which the async task API stores verbatim.
        return f"{self.status_code}: {self.detail}"
