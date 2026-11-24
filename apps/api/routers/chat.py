"""
Chat router — conversations, RAG-grounded messaging, and citation tracking.

All endpoints require authentication (Clerk session token).
Retrieval and conversation data are strictly scoped to the authenticated user.
"""

import base64
import logging
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import Chat, Citation, Message, Page
from db.session import get_db
from deps import ActiveLLMConfig, CurrentUser
from llm.client import generate_answer, ocr_image_with_latex
from schemas.chat import (
    ChatDetailResponse,
    ChatListResponse,
    ChatResponse,
    CitationResponse,
    CreateChatRequest,
    MessageResponse,
    SendMessageRequest,
    SendMessageResponse,
)
from services.rag import rag_service
from services.storage import storage_service

logger = logging.getLogger("supernotes.chat")

router = APIRouter()


@router.post(
    "",
    response_model=ChatResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new study chat session",
)
async def create_chat(
    user: CurrentUser,
    req: CreateChatRequest | None = None,
    db: AsyncSession = Depends(get_db),
) -> ChatResponse:
    """Create a new chat conversation for the authenticated user."""
    chat = Chat(
        id=uuid.uuid4(),
        owner_id=user.id,
        title=(req.title if req and req.title else "New Chat"),
    )
    db.add(chat)
    await db.commit()
    await db.refresh(chat)
    return ChatResponse.model_validate(chat)


@router.get(
    "",
    response_model=ChatListResponse,
    summary="List all chat sessions owned by the current user",
)
async def list_chats(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ChatListResponse:
    """Retrieve all chats for the authenticated user, newest first."""
    stmt = select(Chat).where(Chat.owner_id == user.id).order_by(desc(Chat.updated_at))
    result = await db.execute(stmt)
    chats = result.scalars().all()
    return ChatListResponse(
        data=[ChatResponse.model_validate(c) for c in chats],
        count=len(chats),
    )


@router.get(
    "/{chat_id}",
    response_model=ChatDetailResponse,
    summary="Get chat history with messages and citations",
)
async def get_chat(
    chat_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> ChatDetailResponse:
    """Retrieve chat session and its full message history with citations."""
    chat_stmt = select(Chat).where(Chat.id == chat_id, Chat.owner_id == user.id)
    chat_res = await db.execute(chat_stmt)
    chat = chat_res.scalar_one_or_none()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "chat_not_found", "message": "Chat not found or access denied"},
        )

    # Load messages with citations, pages, and notes
    messages_stmt = (
        select(Message)
        .where(Message.chat_id == chat_id)
        .options(
            selectinload(Message.citations).selectinload(Citation.page).selectinload(Page.note)
        )
        .order_by(Message.created_at.asc())
    )
    msg_res = await db.execute(messages_stmt)
    messages = msg_res.scalars().all()

    formatted_messages: list[MessageResponse] = []
    for m in messages:
        cites: list[CitationResponse] = []
        for c in m.citations:
            cites.append(
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
            )

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

    return ChatDetailResponse(
        data=ChatResponse.model_validate(chat),
        messages=formatted_messages,
    )


@router.post(
    "/{chat_id}/messages",
    response_model=SendMessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a question to the AI study assistant",
)
async def send_message(
    chat_id: UUID,
    req: SendMessageRequest,
    user: CurrentUser,
    llm_config: ActiveLLMConfig,
    db: AsyncSession = Depends(get_db),
) -> SendMessageResponse:
    """
    RAG Endpoint:
      1. Verify chat ownership.
      2. Record user question.
      3. Retrieve matching parent-document chunks scoped to user notes.
      4. If nothing relevant is found, return "Not covered in your uploaded notes."
      5. Generate grounded answer with citations.
      6. Record assistant message and citations in PostgreSQL.
    """
    chat_stmt = select(Chat).where(Chat.id == chat_id, Chat.owner_id == user.id)
    chat_res = await db.execute(chat_stmt)
    chat = chat_res.scalar_one_or_none()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "chat_not_found", "message": "Chat not found or access denied"},
        )

    # Process attached image snap / PYQ if present
    augmented_query = req.content
    if req.image_data:
        try:
            encoded_data = req.image_data
            if "," in encoded_data:
                encoded_data = encoded_data.split(",", 1)[1]
            raw_bytes = base64.b64decode(encoded_data)
            snap_rel_dir = Path("chat_snaps")
            snap_abs_dir = storage_service.get_absolute_path(str(snap_rel_dir))
            snap_abs_dir.mkdir(parents=True, exist_ok=True)
            snap_path = snap_abs_dir / f"{uuid.uuid4()}.png"
            snap_path.write_bytes(raw_bytes)

            ocr_res = await ocr_image_with_latex(snap_path, config=llm_config)
            if ocr_res:
                augmented_query = (
                    f"{req.content}\n\n[Transcribed Exam Snap / Handwritten Formula]:\n{ocr_res}"
                )
        except Exception as ocr_err:
            logger.warning(f"Failed to process chat image attachment: {ocr_err}")

    # 1. Save user question
    display_content = req.content
    if req.image_data:
        display_content = f"📷 [Attached Problem Snap]\n{req.content}"

    user_msg = Message(
        id=uuid.uuid4(),
        chat_id=chat_id,
        role="user",
        content=display_content,
    )
    db.add(user_msg)
    await db.flush()

    # 2. Retrieve relevant context scoped to user's notes and optional study desk scope
    mode = req.mode
    if not req.allow_external and "mode" not in req.model_fields_set:
        mode = "notes_only"
    contexts = []
    if mode != "ai_only":
        top_k = 8 if (req.note_ids or req.folder_id) else 5
        contexts = await rag_service.retrieve_relevant_context(
            db=db,
            user_id=user.id,
            query=augmented_query,
            top_k=top_k,
            note_ids=req.note_ids,
            folder_id=req.folder_id,
            config=llm_config,
        )

    # 3. Generate grounded answer
    answer_text, gen_citations = await generate_answer(
        question=augmented_query,
        contexts=contexts,
        allow_external=(mode != "notes_only"),
        config=llm_config,
        mode=mode,
    )

    # 4. Save assistant answer
    assistant_msg = Message(
        id=uuid.uuid4(),
        chat_id=chat_id,
        role="assistant",
        content=answer_text,
    )
    db.add(assistant_msg)
    await db.flush()

    # 5. Persist citations
    saved_citations: list[CitationResponse] = []
    for gc in gen_citations:
        citation_obj = Citation(
            id=uuid.uuid4(),
            message_id=assistant_msg.id,
            chunk_id=gc.chunk_id,
            page_id=gc.page_id,
            bbox_x=gc.bbox_x,
            bbox_y=gc.bbox_y,
            bbox_width=gc.bbox_width,
            bbox_height=gc.bbox_height,
            snippet=gc.snippet,
        )
        db.add(citation_obj)
        await db.flush()

        saved_citations.append(
            CitationResponse(
                id=citation_obj.id,
                message_id=assistant_msg.id,
                chunk_id=gc.chunk_id,
                page_id=gc.page_id,
                note_id=gc.note_id,
                page_number=gc.page_number,
                note_title=gc.note_title,
                page_image_path=gc.page_image_path,
                snippet=gc.snippet,
                bbox_x=gc.bbox_x,
                bbox_y=gc.bbox_y,
                bbox_width=gc.bbox_width,
                bbox_height=gc.bbox_height,
                created_at=citation_obj.created_at,
            )
        )

    # Update chat title if it's new
    if chat.title == "New Chat":
        chat.title = req.content[:35] + ("…" if len(req.content) > 35 else "")

    await db.commit()

    return SendMessageResponse(
        chat_id=chat_id,
        message=MessageResponse(
            id=assistant_msg.id,
            chat_id=chat_id,
            role="assistant",
            content=answer_text,
            citations=saved_citations,
            created_at=assistant_msg.created_at,
        ),
    )


@router.delete(
    "/{chat_id}",
    summary="Delete a chat session",
)
async def delete_chat(
    chat_id: UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> dict[str, dict[str, str | bool]]:
    """Delete a chat session and cascade to its messages and citations."""
    chat_stmt = select(Chat).where(Chat.id == chat_id, Chat.owner_id == user.id)
    chat_res = await db.execute(chat_stmt)
    chat = chat_res.scalar_one_or_none()

    if not chat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "chat_not_found", "message": "Chat not found or access denied"},
        )

    await db.delete(chat)
    await db.commit()
    return {"data": {"deleted": True, "id": str(chat_id)}}
