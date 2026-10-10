import hashlib

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.catalogue import configured_country, get_catalogue
from planqer.catalogue.local import merge_local
from planqer.catalogue.schema import Catalogue
from planqer.database import CatalogueEntry, get_session

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("/", response_model=Catalogue, summary="The instance's product catalogue")
async def read_catalogue(
    request: Request, session: AsyncSession = Depends(get_session)
):
    """Product types, detail vocabularies and the entries for this instance's
    country (`PLANQER_CATALOGUE_COUNTRY`; generic when unset), with the
    instance's own additions, overrides and hidden entries applied.

    Open to everyone: the model flow reads it before sign-in. Served with an
    ETag so clients can cache it and revalidate for the price of a 304.
    """
    entries = (await session.execute(select(CatalogueEntry))).scalars().all()
    catalogue = merge_local(get_catalogue(configured_country()), entries)
    body = catalogue.model_dump_json()
    etag = f'"{hashlib.sha256(body.encode()).hexdigest()[:16]}"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)
