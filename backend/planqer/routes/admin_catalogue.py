from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_admin_user
from planqer.catalogue import get_catalogue, resolve_country
from planqer.catalogue.local import (
    AdminItem,
    NewProduct,
    ProductDetails,
    Suggestion,
    admin_items,
    build_product,
    build_suggestion,
)
from planqer.database import CatalogueEntry, User, get_session

router = APIRouter(prefix="/admin/catalogue", tags=["admin"])


def _view(
    catalogue: str | None = Query(
        default=None,
        max_length=10,
        description="The catalogue being edited: SE, NO or generic. "
        "Absent: the instance default.",
    ),
) -> str | None:
    return resolve_country(catalogue)


def _rejected(error: Exception) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error))


async def _entries(session: AsyncSession) -> list[CatalogueEntry]:
    return list((await session.execute(select(CatalogueEntry))).scalars().all())


async def _entry(session: AsyncSession, product_id: str) -> CatalogueEntry | None:
    return (
        await session.execute(
            select(CatalogueEntry).where(CatalogueEntry.product_id == product_id)
        )
    ).scalar_one_or_none()


async def _item(session: AsyncSession, product_id: str, view: str | None) -> AdminItem:
    base = get_catalogue(view)
    for item in admin_items(base, await _entries(session)):
        if item.product.id == product_id:
            return item
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Catalogue entry not found")


@router.get(
    "", response_model=list[AdminItem], summary="Every catalogue entry with its state"
)
async def list_entries(
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    base = get_catalogue(view)
    return admin_items(base, await _entries(session))


@router.post("", response_model=AdminItem, status_code=status.HTTP_201_CREATED)
async def add_entry(
    body: NewProduct,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    try:
        product = build_product(
            body.type,
            body.thickness,
            body.width,
            ProductDetails(**body.model_dump(exclude={"type", "thickness", "width"})),
            country=view or "local",
        )
    except ValueError as error:
        raise _rejected(error) from error

    # Built-ins are `<country>:<type>:<size>`, local entries `local:<type>:<size>`:
    # the same product under another prefix is still the same product.
    built_in = {p.id.split(":", 1)[1] for p in get_catalogue(view).products}
    if product.id.split(":", 1)[1] in built_in:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="This product is already built in; edit it instead",
        )
    if await _entry(session, product.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="This product already exists; edit it instead",
        )
    session.add(CatalogueEntry(product_id=product.id, data=product.model_dump_json()))
    await session.commit()
    return AdminItem(product=product, origin="local", hidden=False)


@router.put("/{product_id:path}", response_model=AdminItem)
async def update_entry(
    product_id: str,
    body: ProductDetails,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    """Change a product's lengths, formats, details and sources. For a built-in
    this stores an override; the data file stays as shipped."""
    current = await _item(session, product_id, view)
    try:
        product = build_product(
            current.product.type,
            current.product.thickness,
            current.product.width,
            body,
            product_id=product_id,
            country=current.product.country,
        )
    except ValueError as error:
        raise _rejected(error) from error

    entry = await _entry(session, product_id)
    if entry is None:
        entry = CatalogueEntry(product_id=product_id)
    entry.data = product.model_dump_json()
    entry.updated_at = datetime.now()
    session.add(entry)
    await session.commit()
    origin = "local" if current.origin == "local" else "modified"
    return AdminItem(product=product, origin=origin, hidden=entry.hidden)


async def _set_hidden(
    session: AsyncSession, product_id: str, hidden: bool, view: str | None
) -> AdminItem:
    current = await _item(session, product_id, view)
    entry = await _entry(session, product_id)
    if entry is None:
        entry = CatalogueEntry(product_id=product_id)
    entry.hidden = hidden
    entry.updated_at = datetime.now()
    session.add(entry)
    await session.commit()
    return current.model_copy(update={"hidden": hidden})


@router.post("/{product_id:path}/hide", response_model=AdminItem)
async def hide_entry(
    product_id: str,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    return await _set_hidden(session, product_id, True, view)


@router.post("/{product_id:path}/restore", response_model=AdminItem)
async def restore_entry(
    product_id: str,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    return await _set_hidden(session, product_id, False, view)


@router.get("/{product_id:path}/suggestion", response_model=Suggestion)
async def suggest_entry(
    product_id: str,
    source: str | None = Query(default=None, max_length=500),
    country: str | None = Query(default=None, max_length=2),
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    """A pre-filled GitHub issue for this product. Only builds the link; nothing
    is sent anywhere until the admin opens it."""
    item = await _item(session, product_id, view)
    try:
        return build_suggestion(item.product, source=source, country=country)
    except ValueError as error:
        raise _rejected(error) from error


@router.delete("/{product_id:path}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_entry(
    product_id: str,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    """Delete a local addition, or revert a built-in to its shipped data and
    show it again."""
    await _item(session, product_id, view)
    entry = await _entry(session, product_id)
    if entry is not None:
        await session.delete(entry)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
