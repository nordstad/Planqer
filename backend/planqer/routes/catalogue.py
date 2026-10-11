import hashlib
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.catalogue import get_catalogue, resolve_country
from planqer.catalogue.local import merge_local
from planqer.catalogue.schema import Catalogue
from planqer.catalogue.search import ProductResult, search_products
from planqer.database import CatalogueEntry, get_session

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


async def effective_catalogue(
    session: AsyncSession, country: str | None = None
) -> Catalogue:
    entries = (await session.execute(select(CatalogueEntry))).scalars().all()
    return merge_local(get_catalogue(resolve_country(country)), entries)


@router.get("/", response_model=Catalogue, summary="The instance's product catalogue")
async def read_catalogue(
    request: Request,
    country: str | None = Query(
        default=None,
        max_length=10,
        description="SE, NO or generic. Absent: the instance default.",
    ),
    session: AsyncSession = Depends(get_session),
):
    """Product types, detail vocabularies and the entries for the requested
    country (`SE`, `NO` or `generic`; by default the instance default,
    `PLANQER_CATALOGUE_COUNTRY`, or generic when unset), with the
    instance's own additions, overrides and hidden entries applied.

    Open to everyone: the model flow reads it before sign-in. Served with an
    ETag so clients can cache it and revalidate for the price of a 304.
    """
    catalogue = await effective_catalogue(session, country)
    body = catalogue.model_dump_json()
    etag = f'"{hashlib.sha256(body.encode()).hexdigest()[:16]}"'
    headers = {"ETag": etag, "Cache-Control": "no-cache"}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers=headers)
    return Response(content=body, media_type="application/json", headers=headers)


@router.get(
    "/products",
    response_model=list[ProductResult],
    summary="Search the instance's products by name, grade or size",
)
async def search_catalogue(
    q: str = Query(
        default="",
        max_length=100,
        description="e.g. 'regel c24', '45x95', 'plywood 15'",
    ),
    kind: Literal["board", "sheet"] | None = None,
    id: str | None = Query(
        default=None, max_length=80, description="Exactly this product id"
    ),
    limit: int = Query(default=20, ge=1, le=50),
    lang: Literal["en", "sv", "nb"] = "en",
    country: str | None = Query(default=None, max_length=10),
    session: AsyncSession = Depends(get_session),
):
    """Searches the same catalogue `GET /catalogue/` serves, local additions
    included and hidden entries left out. Open to everyone, like the catalogue."""
    return search_products(
        await effective_catalogue(session, country),
        q,
        kind=kind,
        limit=limit,
        lang=lang,
    )
