"""
Ingestion Service — orchestrates parsing, page rendering, chunking, and embedding.

Transitions note status: pending -> processing -> ready (or failed).
Invariants:
  - Digital PDFs use PyMuPDF without external API calls.
  - Page images are rendered at 150 DPI and saved to disk for viewer.
  - Chunks use parent-document hierarchy with 768-dim embeddings in pgvector.
"""

import logging
import uuid

from sqlalchemy import delete, select

from db.models import Chunk, Note, Page, UserSettings
from db.session import async_session_factory
from llm.client import LLMConfig, classify_document, generate_embedding
from services.chunker import chunker, stitch_page_texts
from services.parser import document_parser

logger = logging.getLogger("supernotes.ingestion")


class IngestionService:
    async def process_note(self, note_id: uuid.UUID) -> bool:
        """Process a single note through the ingestion pipeline."""
        logger.info(f"Starting ingestion for note {note_id}")

        async with async_session_factory() as db:
            # 1. Fetch note
            res = await db.execute(select(Note).where(Note.id == note_id))
            note = res.scalar_one_or_none()

            if not note:
                logger.error(f"Note {note_id} not found for ingestion")
                return False

            # Lookup owner's configured API key if available
            user_config = None
            try:
                s_res = await db.execute(
                    select(UserSettings).where(UserSettings.user_id == note.owner_id)
                )
                u_setting = s_res.scalar_one_or_none()
                if u_setting:
                    user_config = LLMConfig(
                        provider=u_setting.llm_provider or "gemini",
                        api_key=u_setting.gemini_api_key or u_setting.openai_api_key,
                        model=u_setting.llm_model,
                    )
            except Exception as e:
                logger.debug(f"Could not load UserSettings for note {note_id}: {e}")

            try:
                # 2. Mark status as processing
                note.status = "processing"
                await db.commit()

                # 3. Parse document and render page images (with OpenCV and OCR if needed)
                parsed_pages = await document_parser.parse_document(
                    file_path=note.file_path,
                    file_type=note.file_type,
                    note_id=note.id,
                )

                # 4. Remove any existing pages/chunks (allows safe retries)
                await db.execute(delete(Chunk).where(Chunk.note_id == note.id))
                await db.execute(delete(Page).where(Page.note_id == note.id))
                await db.flush()

                # 5. Insert pages & hierarchical chunks (with cross-page sentence stitching)
                pages_data = [(p.page_number, p.text_content or "") for p in parsed_pages]
                stitched_pages = stitch_page_texts(pages_data)
                stitched_map = {p_num: text for p_num, text in stitched_pages}

                total_chunks = 0
                for p in parsed_pages:
                    content_to_chunk = stitched_map.get(p.page_number, p.text_content)
                    page = Page(
                        note_id=note.id,
                        page_number=p.page_number,
                        image_path=p.image_rel_path,
                        text_content=content_to_chunk,
                    )
                    db.add(page)
                    await db.flush()

                    if content_to_chunk:
                        parents = chunker.chunk_text(
                            content_to_chunk, page_number=p.page_number
                        )
                        for parent_data in parents:
                            parent_chunk = Chunk(
                                note_id=note.id,
                                page_id=page.id,
                                parent_chunk_id=None,
                                content=parent_data.content,
                                chunk_index=parent_data.chunk_index,
                                chunk_type="parent",
                                embedding=None,  # parent holds context; search hits children
                            )
                            db.add(parent_chunk)
                            await db.flush()

                            # Compute embeddings for child chunks
                            for child_data in parent_data.children:
                                emb = await generate_embedding(
                                    child_data.content, config=user_config
                                )
                                child_chunk = Chunk(
                                    note_id=note.id,
                                    page_id=page.id,
                                    parent_chunk_id=parent_chunk.id,
                                    content=child_data.content,
                                    chunk_index=child_data.chunk_index,
                                    chunk_type="child",
                                    embedding=emb,
                                )
                                db.add(child_chunk)
                                total_chunks += 1

                # 6. Auto-classify document into academic subject, topic, and summary
                combined_text = "\n\n".join(
                    [p.text_content for p in parsed_pages if p.text_content]
                )
                if combined_text and (not note.subject or note.subject == "General Studies"):
                    try:
                        classification = await classify_document(
                            note.title, combined_text, config=user_config
                        )
                        note.subject = classification.get(
                            "subject", note.subject or "General Studies"
                        )
                        note.topic = classification.get("topic", note.topic)
                        note.tags = classification.get("tags", note.tags)
                        note.summary = classification.get("summary", note.summary)
                    except Exception as class_err:
                        logger.warning(f"Classification failed for {note.id}: {class_err}")

                # 7. Mark note as ready
                note.page_count = len(parsed_pages)
                note.status = "ready"
                await db.commit()
                logger.info(
                    f"Note {note_id} processed: {len(parsed_pages)} pages, "
                    f"{total_chunks} chunks, subject: {note.subject}"
                )
                return True

            except Exception as e:
                logger.exception(f"Ingestion failed for note {note_id}: {e}")
                await db.rollback()

                # Mark note as failed in a clean transaction
                try:
                    res_err = await db.execute(select(Note).where(Note.id == note_id))
                    note_err = res_err.scalar_one_or_none()
                    if note_err:
                        note_err.status = "failed"
                        await db.commit()
                except Exception as inner_e:
                    logger.error(f"Failed to record note failure status: {inner_e}")

                return False


ingestion_service = IngestionService()
