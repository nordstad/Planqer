import hashlib

from fastapi import APIRouter, Request, Response

from planqer.catalogue import configured_country, get_catalogue
from planqer.catalogue.schema import Catalogue

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("/", response_model=Catalogue, summary="The instance's product catalogue")
async def read_catalogue(request: Request):
    """Product types, detail vocabularies and the entries for this instance's
    country (`PLANQER_CATALOGUE_COUNTRY`; generic when unset).

    Open to everyone: the model flow reads it before sign-in. Served with an
    ETag so clients can cache it and revalidate for the price of a 304.
    """
    catalogue = get_catalogue(configured_country())
    body = catalogue.model_dump_json()
    etag = f'"{hashlib.sha256(body.encode()).hexdigest()[:16]}"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)
