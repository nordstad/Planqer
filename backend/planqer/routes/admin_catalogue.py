from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_admin_user
from planqer.catalogue import configured_country, get_catalogue
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


async def _item(session: AsyncSession, product_id: str) -> AdminItem:
    base = get_catalogue(configured_country())
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
):
    base = get_catalogue(configured_country())
    return admin_items(base, await _entries(session))


@router.post("", response_model=AdminItem, status_code=status.HTTP_201_CREATED)
async def add_entry(
    body: NewProduct,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    try:
        product = build_product(
            body.type,
            body.thickness,
            body.width,
            ProductDetails(**body.model_dump(exclude={"type", "thickness", "width"})),
        )
    except ValueError as error:
        raise _rejected(error) from error

    built_in = {p.id for p in get_catalogue(configured_country()).products}
    taken = await _entry(session, product.id)
    if taken or product.id in built_in:
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
):
    """Change a product's lengths, formats, details and sources. For a built-in
    this stores an override; the data file stays as shipped."""
    current = await _item(session, product_id)
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
    session: AsyncSession, product_id: str, hidden: bool
) -> AdminItem:
    current = await _item(session, product_id)
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
):
    return await _set_hidden(session, product_id, True)


@router.post("/{product_id:path}/restore", response_model=AdminItem)
async def restore_entry(
    product_id: str,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    return await _set_hidden(session, product_id, False)


@router.get("/{product_id:path}/suggestion", response_model=Suggestion)
async def suggest_entry(
    product_id: str,
    source: str | None = Query(default=None, max_length=500),
    country: str | None = Query(default=None, max_length=2),
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """A pre-filled GitHub issue for this product. Only builds the link; nothing
    is sent anywhere until the admin opens it."""
    item = await _item(session, product_id)
    try:
        return build_suggestion(item.product, source=source, country=country)
    except ValueError as error:
        raise _rejected(error) from error


@router.delete("/{product_id:path}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_entry(
    product_id: str,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete a local addition, or revert a built-in to its shipped data and
    show it again."""
    await _item(session, product_id)
    entry = await _entry(session, product_id)
    if entry is not None:
        await session.delete(entry)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
