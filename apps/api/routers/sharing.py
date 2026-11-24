"""
Sharing router — Collaborative study links and direct peer share grants.

Endpoints:
- POST /api/v1/share/links: Generate public read-only study link.
- GET  /api/v1/share/public/{token}: View shared note, pages, or chat session without auth.
- POST /api/v1/share/grants: Direct role-based sharing by email (Viewer / Editor).
- GET  /api/v1/share/grants: List active share grants.
"""

import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import Chat, Citation, Message, Note, Page, ShareGrant, ShareLink, User
from db.session import get_db
from deps import CurrentUser
from schemas.chat import CitationResponse, MessageResponse
from schemas.notes import NoteResponse, PageResponse
from schemas.sharing import (
    CreateShareGrantRequest,
    CreateShareLinkRequest,
    SharedResourceResponse,
    ShareGrantResponse,
    ShareLinkResponse,
)

router = APIRouter()


@router.post(
    "/links",
    response_model=ShareLinkResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create or retrieve a shareable read-only link for a note or chat",
)
async def create_or_get_share_link(
    req: CreateShareLinkRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ShareLinkResponse:
    """Generate a unique URL token that classmates can view without an account."""
    # 1. Enforce ownership
    if req.resource_type == "note":
        stmt = select(Note).where(Note.id == req.resource_id, Note.owner_id == user.id)
        res = await db.execute(stmt)
        if not res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "resource_not_found", "message": "Note not found or access denied"},
            )
    elif req.resource_type == "chat":
        stmt = select(Chat).where(Chat.id == req.resource_id, Chat.owner_id == user.id)
        res = await db.execute(stmt)
        if not res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "resource_not_found", "message": "Chat not found or access denied"},
            )

    # 2. Check if active link already exists
    existing_stmt = select(ShareLink).where(
        ShareLink.resource_id == req.resource_id,
        ShareLink.created_by == user.id,
        ShareLink.is_active.is_(True),
    )
    existing_res = await db.execute(existing_stmt)
    link = existing_res.scalar_one_or_none()

    if not link:
        token = secrets.token_urlsafe(24)
        link = ShareLink(
            id=uuid.uuid4(),
            resource_type=req.resource_type,
            resource_id=req.resource_id,
            created_by=user.id,
            share_token=token,
            is_active=True,
        )
        db.add(link)
        await db.commit()
        await db.refresh(link)

    return ShareLinkResponse(
        share_token=link.share_token,
        share_url=f"/share/{link.share_token}",
        resource_type=link.resource_type,
        resource_id=link.resource_id,
        created_at=link.created_at,
    )


@router.get(
    "/public/{token}",
    response_model=SharedResourceResponse,
    summary="Access a shared study document or chat transcript via public token",
)
async def get_public_shared_resource(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> SharedResourceResponse:
    """Unauthenticated endpoint allowing classmates to view shared course notes or chats."""
    stmt = (
        select(ShareLink)
        .where(ShareLink.share_token == token, ShareLink.is_active.is_(True))
        .options(selectinload(ShareLink.creator))
    )
    res = await db.execute(stmt)
    link = res.scalar_one_or_none()

    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "invalid_share_link",
                "message": "This share link has expired or is invalid.",
            },
        )

    creator_name = link.creator.display_name or "Classmate"

    # Note resource
    if link.resource_type == "note":
        note_stmt = (
            select(Note)
            .where(Note.id == link.resource_id)
            .options(selectinload(Note.pages))
        )
        note_res = await db.execute(note_stmt)
        note = note_res.scalar_one_or_none()
        if not note:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "note_deleted", "message": "The shared note has been deleted."},
            )

        sorted_pages = sorted(note.pages, key=lambda p: p.page_number)
        return SharedResourceResponse(
            resource_type="note",
            resource_id=note.id,
            title=note.title,
            subject=note.subject,
            creator_name=creator_name,
            note=NoteResponse.model_validate(note),
            pages=[PageResponse.model_validate(p) for p in sorted_pages],
            chat_messages=[],
            created_at=link.created_at,
        )

    # Chat session resource
    elif link.resource_type == "chat":
        chat_stmt = select(Chat).where(Chat.id == link.resource_id)
        chat_res = await db.execute(chat_stmt)
        chat = chat_res.scalar_one_or_none()
        if not chat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "chat_deleted", "message": "The shared chat has been deleted."},
            )

        messages_stmt = (
            select(Message)
            .where(Message.chat_id == chat.id)
            .options(
                selectinload(Message.citations).selectinload(Citation.page).selectinload(Page.note)
            )
            .order_by(Message.created_at.asc())
        )
        msg_res = await db.execute(messages_stmt)
        raw_msgs = msg_res.scalars().all()

        formatted_messages = []
        for m in raw_msgs:
            cites = [
                CitationResponse(
                    id=c.id,
                    message_id=c.message_id,
                    chunk_id=c.chunk_id,
                    page_id=c.page_id,
                    note_id=c.page.note_id if c.page else None,
                    page_number=c.page.page_number if c.page else None,
                    note_title=c.page.note.title if (c.page and c.page.note) else None,
                    page_image_path=c.page.image_path if c.page else None,
                    snippet=c.snippet,
                    bbox_x=c.bbox_x,
                    bbox_y=c.bbox_y,
                    bbox_width=c.bbox_width,
                    bbox_height=c.bbox_height,
                    created_at=c.created_at,
                )
                for c in m.citations
            ]
            formatted_messages.append(
                MessageResponse(
                    id=m.id,
                    chat_id=m.chat_id,
                    role=m.role,
                    content=m.content,
                    citations=cites,
                    created_at=m.created_at,
                )
            )

        return SharedResourceResponse(
            resource_type="chat",
            resource_id=chat.id,
            title=chat.title,
            subject="Course Discussion",
            creator_name=creator_name,
            note=None,
            pages=[],
            chat_messages=formatted_messages,
            created_at=link.created_at,
        )

    raise HTTPException(status_code=400, detail="Unsupported resource type")


@router.post(
    "/grants",
    response_model=ShareGrantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Grant direct viewer or editor access to a classmate by email",
)
async def create_share_grant(
    req: CreateShareGrantRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ShareGrantResponse:
    """Share a note, folder, or chat directly with another registered student."""
    # Find grantee
    grantee_stmt = select(User).where(User.email == req.grantee_email)
    grantee_res = await db.execute(grantee_stmt)
    grantee = grantee_res.scalar_one_or_none()

    if not grantee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "student_not_found",
                "message": f"No student account found with email '{req.grantee_email}'.",
            },
        )

    grant = ShareGrant(
        id=uuid.uuid4(),
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        grantor_id=user.id,
        grantee_id=grantee.id,
        role=req.role,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)

    return ShareGrantResponse(
        id=grant.id,
        resource_type=grant.resource_type,
        resource_id=grant.resource_id,
        grantee_email=grantee.email,
        role=grant.role,
        created_at=grant.created_at,
    )
