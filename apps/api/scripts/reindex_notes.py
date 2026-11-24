"""
Re-index existing notes with sentence-aware chunk boundaries.

Usage:
    python apps/api/scripts/reindex_notes.py [--note-id NOTE_ID]
"""

import argparse
import asyncio
import logging
import sys
import uuid
from pathlib import Path

# Add apps/api to sys.path so modules import correctly when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select  # noqa: E402

from db.models import Chunk, Note, Page  # noqa: E402
from db.session import async_session_factory  # noqa: E402
from llm.client import generate_embedding  # noqa: E402
from services.chunker import chunker, stitch_page_texts  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("supernotes.reindex")


async def reindex_note(note_id: uuid.UUID, session) -> int:
    """Re-chunk and re-embed all pages of a specific note."""
    note_stmt = select(Note).where(Note.id == note_id)
    note_res = await session.execute(note_stmt)
    note = note_res.scalar_one_or_none()
    if not note:
        logger.error(f"Note {note_id} not found.")
        return 0

    # 1. Delete existing chunks for this note
    await session.execute(delete(Chunk).where(Chunk.note_id == note_id))
    await session.flush()

    # 2. Fetch pages in order and stitch cross-page sentence splits
    page_stmt = select(Page).where(Page.note_id == note_id).order_by(Page.page_number.asc())
    page_res = await session.execute(page_stmt)
    pages = page_res.scalars().all()

    pages_data = [(p.page_number, p.text_content or "") for p in pages]
    stitched_pages = stitch_page_texts(pages_data)
    page_id_map = {p.page_number: p.id for p in pages}

    total_chunks = 0
    for p_num, text in stitched_pages:
        if not text.strip():
            continue

        page_id = page_id_map.get(p_num)
        parents = chunker.chunk_text(text, page_number=p_num)
        for parent_data in parents:
            parent_chunk = Chunk(
                note_id=note.id,
                page_id=page_id,
                parent_chunk_id=None,
                content=parent_data.content,
                chunk_index=parent_data.chunk_index,
                chunk_type="parent",
                embedding=None,
            )
            session.add(parent_chunk)
            await session.flush()

            for child_data in parent_data.children:
                emb = await generate_embedding(child_data.content)
                child_chunk = Chunk(
                    note_id=note.id,
                    page_id=page_id,
                    parent_chunk_id=parent_chunk.id,
                    content=child_data.content,
                    chunk_index=child_data.chunk_index,
                    chunk_type="child",
                    embedding=emb,
                )
                session.add(child_chunk)
                total_chunks += 1

    await session.commit()
    logger.info(
        f"Re-indexed Note '{note.title}' ({note.id}): {total_chunks} "
        f"sentence-aware chunks across {len(pages)} pages."
    )
    return total_chunks


async def reindex_all_notes(target_note_id: uuid.UUID | None = None) -> None:
    """Re-index all notes (or a specific note) in the database."""
    async with async_session_factory() as session:
        if target_note_id:
            await reindex_note(target_note_id, session)
            return

        stmt = select(Note).where(Note.status == "ready")
        res = await session.execute(stmt)
        notes = res.scalars().all()
        logger.info(f"Starting sentence-aware re-indexing for {len(notes)} note(s)...")

        total_all_chunks = 0
        for note in notes:
            chunks_count = await reindex_note(note.id, session)
            total_all_chunks += chunks_count

        logger.info(
            f"Re-indexing complete: {len(notes)} note(s) processed, "
            f"{total_all_chunks} total chunks."
        )


def main():
    parser = argparse.ArgumentParser(
        description="Re-index notes with sentence-aware chunk boundaries"
    )
    parser.add_argument("--note-id", type=str, help="Specific Note UUID to re-index")
    args = parser.parse_args()

    target_id = uuid.UUID(args.note_id) if args.note_id else None
    asyncio.run(reindex_all_notes(target_id))


if __name__ == "__main__":
    main()
