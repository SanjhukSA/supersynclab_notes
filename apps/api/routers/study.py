"""
Study workflows router — high-yield cheat sheets and active-recall quizzes.

Enables undergrads to generate:
- 1-page exam cramming cheat sheets with LaTeX formulas and core laws.
- Self-testing active recall quizzes grounded in note chunks.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import Chunk, Note
from db.session import get_db
from deps import ActiveLLMConfig, CurrentUser
from llm.client import generate_cheat_sheet, generate_quiz
from schemas.study import (
    CheatSheetResponse,
    QuizQuestion,
    QuizResponse,
    SynthesisRequest,
)

router = APIRouter()


@router.post(
    "/synthesize/cheatsheet",
    response_model=CheatSheetResponse,
    summary="Generate cross-document high-yield cheat sheet for multiple notes or a folder",
)
async def synthesize_cheatsheet(
    req: SynthesisRequest,
    user: CurrentUser,
    llm_config: ActiveLLMConfig,
    db: AsyncSession = Depends(get_db),
) -> CheatSheetResponse:
    """Synthesize an integrated 1-page exam cheat sheet across multiple notes or a folder."""
    where_clauses = [Note.owner_id == user.id]
    if req.note_ids:
        where_clauses.append(Note.id.in_(req.note_ids))
    elif req.folder_id:
        where_clauses.append(Note.folder_id == req.folder_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "missing_scope", "message": "Specify note_ids or folder_id."},
        )

    stmt = select(Note).where(*where_clauses).options(selectinload(Note.chunks))
    result = await db.execute(stmt)
    matched_notes = result.scalars().all()

    if not matched_notes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "no_notes_found", "message": "No matching notes found for synthesis."},
        )

    all_chunks_text: list[str] = []
    source_titles: list[str] = []
    subject_candidates: list[str] = []
    for n in matched_notes:
        source_titles.append(n.title)
        if n.subject:
            subject_candidates.append(n.subject)
        if n.chunks:
            sorted_chunks = sorted(
                n.chunks, key=lambda c: (c.page_id or UUID(int=0), c.chunk_index)
            )
            note_content = "\n".join(c.content for c in sorted_chunks[:6])
            all_chunks_text.append(
                f"--- Note: {n.title} ({n.subject or 'General'}) ---\n{note_content}"
            )
        else:
            all_chunks_text.append(f"--- Note: {n.title} ---\n{n.summary or n.title}")

    combined_content = "\n\n".join(all_chunks_text)
    synth_title = req.title or f"Course Synthesis ({len(matched_notes)} Notes)"
    synth_subject = subject_candidates[0] if subject_candidates else "Course Synthesis"

    markdown = await generate_cheat_sheet(
        note_title=synth_title,
        subject=synth_subject,
        content=combined_content,
        config=llm_config,
    )

    return CheatSheetResponse(
        note_id=matched_notes[0].id if len(matched_notes) == 1 else None,
        title=synth_title,
        subject=synth_subject,
        markdown=markdown,
        source_note_titles=source_titles,
    )


@router.post(
    "/synthesize/quiz",
    response_model=QuizResponse,
    summary="Generate cross-document active-recall quiz across multiple notes or a folder",
)
async def synthesize_quiz(
    req: SynthesisRequest,
    user: CurrentUser,
    llm_config: ActiveLLMConfig,
    db: AsyncSession = Depends(get_db),
) -> QuizResponse:
    """Generate dynamic active-recall multiple choice questions across multiple notes."""
    where_clauses = [Note.owner_id == user.id]
    if req.note_ids:
        where_clauses.append(Note.id.in_(req.note_ids))
    elif req.folder_id:
        where_clauses.append(Note.folder_id == req.folder_id)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "missing_scope", "message": "Specify note_ids or folder_id."},
        )

    stmt = select(Note).where(*where_clauses).options(selectinload(Note.chunks))
    result = await db.execute(stmt)
    matched_notes = result.scalars().all()

    if not matched_notes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "no_notes_found", "message": "No matching notes found for synthesis."},
        )

    all_chunks_text = []
    source_titles = []
    for n in matched_notes:
        source_titles.append(n.title)
        if n.chunks:
            sorted_chunks = sorted(
                n.chunks, key=lambda c: (c.page_id or UUID(int=0), c.chunk_index)
            )
            note_content = "\n".join(c.content for c in sorted_chunks[:6])
            all_chunks_text.append(f"--- Note: {n.title} ---\n{note_content}")
        else:
            all_chunks_text.append(f"--- Note: {n.title} ---\n{n.summary or n.title}")

    combined_content = "\n\n".join(all_chunks_text)
    synth_title = req.title or f"Synthesized Practice Exam ({len(matched_notes)} Notes)"

    raw_questions = await generate_quiz(
        note_title=synth_title,
        content=combined_content,
        num_questions=min(6, max(4, len(matched_notes) * 2)),
        config=llm_config,
    )

    parsed_questions: list[QuizQuestion] = []
    for item in raw_questions:
        parsed_questions.append(
            QuizQuestion(
                question=item.get("question", "Exam Concept Question"),
                options=item.get("options", ["Option A", "Option B"]),
                correct_index=item.get("correct_index", 0),
                explanation=item.get("explanation", "Grounded in synthesized course concepts."),
                page_reference=item.get("page_reference"),
                source_note_title=item.get("source_note_title"),
            )
        )

    return QuizResponse(
        note_id=matched_notes[0].id if len(matched_notes) == 1 else None,
        note_title=synth_title,
        questions=parsed_questions,
        source_note_titles=source_titles,
    )


@router.post(
    "/{note_id}/cheatsheet",
    response_model=CheatSheetResponse,
    summary="Generate high-yield 1-page exam cheat sheet",
)
async def get_note_cheatsheet(
    note_id: UUID,
    user: CurrentUser,
    llm_config: ActiveLLMConfig,
    db: AsyncSession = Depends(get_db),
) -> CheatSheetResponse:
    """
    Generate an ultra-dense, 1-page high-yield cheat sheet for this note.
    Summarizes core laws, essential LaTeX formulas, and exam traps.
    """
    stmt = (
        select(Note)
        .where(Note.id == note_id, Note.owner_id == user.id)
        .options(selectinload(Note.chunks))
    )
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "note_not_found", "message": "Note not found or access denied"},
        )

    # Gather text from chunks or note title
    if note.chunks:
        # Use chunk texts sorted by chunk index
        sorted_chunks = sorted(note.chunks, key=lambda c: (c.page_id or UUID(int=0), c.chunk_index))
        content = "\n\n".join(c.content for c in sorted_chunks[:15])
    else:
        content = note.title

    markdown = await generate_cheat_sheet(
        note_title=note.title,
        subject=note.subject or "General Studies",
        content=content,
        config=llm_config,
    )

    return CheatSheetResponse(
        note_id=note.id,
        title=note.title,
        subject=note.subject or "General Studies",
        markdown=markdown,
        source_note_titles=[note.title],
    )


@router.post(
    "/{note_id}/quiz",
    response_model=QuizResponse,
    summary="Generate active-recall quiz grounded in note chunks",
)
async def get_note_quiz(
    note_id: UUID,
    user: CurrentUser,
    llm_config: ActiveLLMConfig,
    db: AsyncSession = Depends(get_db),
) -> QuizResponse:
    """
    Generate dynamic active-recall multiple choice questions grounded in note concepts.
    Includes instant explanations and answers.
    """
    stmt = (
        select(Note)
        .where(Note.id == note_id, Note.owner_id == user.id)
        .options(selectinload(Note.chunks).selectinload(Chunk.page))
    )
    result = await db.execute(stmt)
    note = result.scalar_one_or_none()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "note_not_found", "message": "Note not found or access denied"},
        )

    if note.chunks:
        sorted_chunks = sorted(note.chunks, key=lambda c: (c.page_id or UUID(int=0), c.chunk_index))
        content = "\n\n".join(c.content for c in sorted_chunks[:15])
    else:
        content = note.title

    raw_questions = await generate_quiz(
        note_title=note.title,
        content=content,
        num_questions=4,
        config=llm_config,
    )

    parsed_questions: list[QuizQuestion] = []
    for item in raw_questions:
        parsed_questions.append(
            QuizQuestion(
                question=item.get("question", "Exam Concept Question"),
                options=item.get("options", ["Option A", "Option B"]),
                correct_index=item.get("correct_index", 0),
                explanation=item.get("explanation", "Grounded in note concepts."),
                page_reference=item.get("page_reference"),
            )
        )

    return QuizResponse(
        note_id=note.id,
        note_title=note.title,
        questions=parsed_questions,
        source_note_titles=[note.title],
    )
