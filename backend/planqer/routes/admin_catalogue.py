from datetime import datetime

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from planqer.auth import get_current_admin_user
from planqer.catalogue import resolve_country
from planqer.catalogue.local import (
    AdminItem,
    NewProduct,
    ProductDetails,
    StoredChange,
    Suggestion,
    list_items,
    set_entry_hidden,
)
from planqer.catalogue.local import (
    add_entry as plan_add,
)
from planqer.catalogue.local import (
    reset_entry as plan_reset,
)
from planqer.catalogue.local import (
    suggest_entry as plan_suggest,
)
from planqer.catalogue.local import (
    update_entry as plan_update,
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


async def _entries(session: AsyncSession) -> list[CatalogueEntry]:
    return list((await session.execute(select(CatalogueEntry))).scalars().all())


async def _keep(
    session: AsyncSession, entries: list[CatalogueEntry], change: StoredChange
) -> None:
    entry = next((e for e in entries if e.product_id == change.product_id), None)
    if entry is None:
        entry = CatalogueEntry(product_id=change.product_id)
    else:
        entry.updated_at = datetime.now()
    entry.hidden = change.hidden
    entry.data = change.data
    session.add(entry)
    await session.commit()


@router.get(
    "", response_model=list[AdminItem], summary="Every catalogue entry with its state"
)
async def list_entries(
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    return list_items(view, await _entries(session))


@router.post("", response_model=AdminItem, status_code=status.HTTP_201_CREATED)
async def add_entry(
    body: NewProduct,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    entries = await _entries(session)
    item, change = plan_add(body, view, entries)
    await _keep(session, entries, change)
    return item


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
    entries = await _entries(session)
    item, change = plan_update(product_id, body, view, entries)
    await _keep(session, entries, change)
    return item


async def _set_hidden(
    session: AsyncSession, product_id: str, hidden: bool, view: str | None
) -> AdminItem:
    entries = await _entries(session)
    item, change = set_entry_hidden(product_id, hidden, view, entries)
    await _keep(session, entries, change)
    return item


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
    return plan_suggest(
        product_id,
        view,
        await _entries(session),
        source=source,
        country=country,
    )


@router.delete("/{product_id:path}", status_code=status.HTTP_204_NO_CONTENT)
async def reset_entry(
    product_id: str,
    admin_user: User = Depends(get_current_admin_user),
    session: AsyncSession = Depends(get_session),
    view: str | None = Depends(_view),
):
    """Delete a local addition, or revert a built-in to its shipped data and
    show it again."""
    entries = await _entries(session)
    plan_reset(product_id, view, entries)
    entry = next((e for e in entries if e.product_id == product_id), None)
    if entry is not None:
        await session.delete(entry)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
