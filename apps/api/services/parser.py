"""
Document Parser service — extracts text, runs cost-aware multimodal OCR, and renders page images.

Invariants:
  - Digital PDFs with text are parsed with PyMuPDF with zero external Vision API calls.
  - Handwritten pages, low-density scans, and photo uploads are routed through
    OpenCV image cleaning and Gemini Multimodal OCR with LaTeX reconstruction.
  - Page images are rendered at 150 DPI and saved to disk for the split-screen viewer.
"""

import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF

from llm.client import ocr_image_with_latex
from services.image_processor import image_processor
from services.storage import storage_service


@dataclass
class ParsedPage:
    page_number: int
    text_content: str
    image_rel_path: str | None


class DocumentParser:
    async def parse_document(
        self, file_path: str, file_type: str, note_id: uuid.UUID
    ) -> list[ParsedPage]:
        """
        Extract text and render page images for a document.

        Args:
            file_path: Relative path to original file in storage.
            file_type: 'PDF', 'IMG', or 'TXT'.
            note_id: The UUID of the note.

        Returns:
            List of ParsedPage objects.
        """
        abs_path = storage_service.get_absolute_path(file_path)
        if not abs_path.exists():
            raise FileNotFoundError(f"Source file not found at {abs_path}")

        if file_type == "PDF":
            return await self._parse_pdf(abs_path, note_id)
        elif file_type == "TXT":
            return self._parse_txt(abs_path)
        elif file_type == "IMG":
            return await self._parse_img(abs_path, note_id)
        elif file_type == "DOCX":
            return self._parse_docx(abs_path, note_id)
        elif file_type == "PPTX":
            return self._parse_pptx(abs_path, note_id)
        else:
            return []

    async def _parse_pdf(self, abs_path: Path, note_id: uuid.UUID) -> list[ParsedPage]:
        """
        Parse PDF:
        - Native digital text pages are extracted via PyMuPDF with 0 external API calls.
        - Low-density scanned pages are preprocessed with OpenCV and transcribed via Gemini Vision.
        """
        pages: list[ParsedPage] = []
        doc = fitz.open(abs_path)

        # Target directory on disk for rendered page images: storage/pages/{note_id}/
        pages_rel_dir = Path("pages") / str(note_id)
        pages_abs_dir = storage_service.get_absolute_path(str(pages_rel_dir))
        pages_abs_dir.mkdir(parents=True, exist_ok=True)

        for page_index in range(len(doc)):
            page_num = page_index + 1
            page = doc[page_index]

            # 1. Render 150 DPI page image for split-screen viewer
            pix = page.get_pixmap(dpi=150)
            img_filename = f"page_{page_num}.png"
            img_rel_path = f"pages/{note_id}/{img_filename}"
            img_abs_path = pages_abs_dir / img_filename
            pix.save(str(img_abs_path))

            # 2. Extract digital text
            text = page.get_text("text").strip()

            # 3. Cost-aware routing: if page has very little or no digital text,
            # it is likely a scanned photo or handwritten notebook page
            if len(text) < 40:
                # Preprocess with OpenCV to remove shadows and enhance ink
                cleaned_img = image_processor.clean_image_for_ocr(img_abs_path)
                ocr_text = await ocr_image_with_latex(cleaned_img)
                if ocr_text:
                    text = ocr_text

            pages.append(
                ParsedPage(
                    page_number=page_num,
                    text_content=text,
                    image_rel_path=img_rel_path,
                )
            )

        doc.close()
        return pages

    def _parse_txt(self, abs_path: Path) -> list[ParsedPage]:
        """Read text file using multiple fallback encodings."""
        content = ""
        for encoding in ["utf-8", "utf-16", "latin-1", "ascii"]:
            try:
                content = abs_path.read_text(encoding=encoding)
                break
            except (UnicodeDecodeError, LookupError):
                continue

        return [
            ParsedPage(
                page_number=1,
                text_content=content.strip(),
                image_rel_path=None,
            )
        ]

    async def _parse_img(self, abs_path: Path, note_id: uuid.UUID) -> list[ParsedPage]:
        """
        Process single image (photo of handwritten note, board snap, or PYQ problem sheet):
        1. Copy to page directory storage/pages/{note_id}/page_1.png
        2. Clean and deskew with OpenCV.
        3. Transcribe formulas and academic hierarchy with Gemini Multimodal OCR.
        """
        pages_rel_dir = Path("pages") / str(note_id)
        pages_abs_dir = storage_service.get_absolute_path(str(pages_rel_dir))
        pages_abs_dir.mkdir(parents=True, exist_ok=True)

        dest_abs_path = pages_abs_dir / "page_1.png"
        shutil.copyfile(str(abs_path), str(dest_abs_path))
        img_rel_path = f"pages/{note_id}/page_1.png"

        # Preprocess with OpenCV
        cleaned_path = image_processor.clean_image_for_ocr(dest_abs_path)

        # Transcribe with Multimodal OCR & LaTeX reconstruction
        text_content = await ocr_image_with_latex(cleaned_path)

        return [
            ParsedPage(
                page_number=1,
                text_content=text_content,
                image_rel_path=img_rel_path,
            )
        ]

    def _parse_docx(self, abs_path: Path, note_id: uuid.UUID) -> list[ParsedPage]:
        """
        Parse Word document (.docx):
        - Extracts text from paragraphs and tables.
        - Chunks content into logical pages (~380 words per page).
        - Generates 150 DPI page scan images using PyMuPDF for the split-screen viewer.
        """
        import docx

        doc = docx.Document(str(abs_path))
        raw_items: list[str] = []

        for p in doc.paragraphs:
            text = p.text.strip()
            if text:
                raw_items.append(text)

        for table in doc.tables:
            for row in table.rows:
                row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_cells:
                    raw_items.append(" | ".join(row_cells))

        if not raw_items:
            raw_items = ["(Empty Document)"]

        # Chunk into logical pages (~380 words per page)
        pages_content: list[str] = []
        current_page_words: list[str] = []
        current_word_count = 0

        for item in raw_items:
            words = item.split()
            count = len(words)
            if current_word_count + count > 380 and current_page_words:
                pages_content.append("\n\n".join(current_page_words))
                current_page_words = [item]
                current_word_count = count
            else:
                current_page_words.append(item)
                current_word_count += count

        if current_page_words:
            pages_content.append("\n\n".join(current_page_words))

        pages_rel_dir = Path("pages") / str(note_id)
        pages_abs_dir = storage_service.get_absolute_path(str(pages_rel_dir))
        pages_abs_dir.mkdir(parents=True, exist_ok=True)

        parsed_pages: list[ParsedPage] = []
        total_pages = len(pages_content)

        for idx, page_text in enumerate(pages_content):
            page_num = idx + 1
            img_filename = f"page_{page_num}.png"
            img_rel_path = f"pages/{note_id}/{img_filename}"
            img_abs_path = pages_abs_dir / img_filename

            # Render 150 DPI page preview via PyMuPDF
            pdf_doc = fitz.open()
            page = pdf_doc.new_page(width=595, height=842)  # A4 portrait

            page.draw_rect(
                fitz.Rect(0, 0, 595, 842),
                color=(0.91, 0.88, 0.82),
                fill=(0.99, 0.98, 0.96),
            )
            page.insert_text(
                (50, 45),
                f"SuperNotes Document Ledger • Page {page_num} of {total_pages}",
                fontsize=9,
                fontname="helv",
                color=(0.48, 0.45, 0.40),
            )
            page.draw_line((50, 55), (545, 55), color=(0.85, 0.82, 0.75), width=0.75)

            text_rect = fitz.Rect(50, 75, 545, 780)
            page.insert_textbox(
                text_rect,
                page_text,
                fontsize=11,
                fontname="times-roman",
                color=(0.17, 0.16, 0.14),
            )
            page.insert_text(
                (275, 810),
                f"— {page_num} —",
                fontsize=9,
                fontname="helv",
                color=(0.55, 0.52, 0.47),
            )

            pix = page.get_pixmap(dpi=150)
            pix.save(str(img_abs_path))
            pdf_doc.close()

            parsed_pages.append(
                ParsedPage(
                    page_number=page_num,
                    text_content=page_text,
                    image_rel_path=img_rel_path,
                )
            )

        return parsed_pages

    def _parse_pptx(self, abs_path: Path, note_id: uuid.UUID) -> list[ParsedPage]:
        """
        Parse PowerPoint slide deck (.pptx):
        - Maps each slide to a page.
        - Extracts slide titles, shape text frames, and speaker notes.
        - Renders 150 DPI 16:9 slide scans using PyMuPDF for the split-screen viewer.
        """
        import pptx

        prs = pptx.Presentation(str(abs_path))
        pages_rel_dir = Path("pages") / str(note_id)
        pages_abs_dir = storage_service.get_absolute_path(str(pages_rel_dir))
        pages_abs_dir.mkdir(parents=True, exist_ok=True)

        parsed_pages: list[ParsedPage] = []
        total_slides = len(prs.slides)
        if total_slides == 0:
            return []

        for slide_idx, slide in enumerate(prs.slides):
            page_num = slide_idx + 1
            title_text = ""
            if (
                slide.shapes.title
                and hasattr(slide.shapes.title, "text")
                and slide.shapes.title.text
            ):
                title_text = slide.shapes.title.text.strip()

            bullet_items: list[str] = []
            for shape in slide.shapes:
                if shape == slide.shapes.title:
                    continue
                if shape.has_text_frame:
                    for p in shape.text_frame.paragraphs:
                        text = p.text.strip()
                        if text:
                            bullet_items.append(text)
                elif shape.has_table:
                    for row in shape.table.rows:
                        row_vals = [
                            cell.text.strip() for cell in row.cells if cell.text.strip()
                        ]
                        if row_vals:
                            bullet_items.append(" | ".join(row_vals))

            notes_text = ""
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes_text = slide.notes_slide.notes_text_frame.text.strip()

            content_blocks: list[str] = []
            if title_text:
                content_blocks.append(f"Title: {title_text}")
            if bullet_items:
                content_blocks.append("\n".join(f"• {item}" for item in bullet_items))
            if notes_text:
                content_blocks.append(f"Speaker Notes: {notes_text}")

            full_slide_text = "\n\n".join(content_blocks).strip()
            if not full_slide_text:
                full_slide_text = f"Slide {page_num}"

            img_filename = f"page_{page_num}.png"
            img_rel_path = f"pages/{note_id}/{img_filename}"
            img_abs_path = pages_abs_dir / img_filename

            pdf_doc = fitz.open()
            page = pdf_doc.new_page(width=960, height=540)  # 16:9 landscape

            page.draw_rect(
                fitz.Rect(0, 0, 960, 540),
                color=(0.90, 0.87, 0.81),
                fill=(0.99, 0.98, 0.96),
            )
            page.insert_text(
                (55, 45),
                f"SLIDE {page_num} OF {total_slides}",
                fontsize=10,
                fontname="helv",
                color=(0.48, 0.45, 0.40),
            )

            display_title = title_text or f"Slide {page_num}"
            if len(display_title) > 65:
                display_title = display_title[:62] + "..."
            page.insert_text(
                (55, 80),
                display_title,
                fontsize=20,
                fontname="times-bold",
                color=(0.17, 0.16, 0.14),
            )
            page.draw_line((55, 95), (905, 95), color=(0.85, 0.82, 0.75), width=1.2)

            body_formatted = "\n\n".join(
                f"• {b}" if not b.startswith("•") else b for b in bullet_items
            )
            if not body_formatted and notes_text:
                body_formatted = f"[Notes: {notes_text}]"

            content_rect = fitz.Rect(55, 115, 905, 490)
            page.insert_textbox(
                content_rect,
                body_formatted,
                fontsize=15,
                fontname="helv",
                color=(0.22, 0.20, 0.18),
            )
            page.insert_text(
                (55, 518),
                "SuperNotes Presentation Ledger",
                fontsize=9,
                fontname="helv",
                color=(0.60, 0.57, 0.52),
            )

            pix = page.get_pixmap(dpi=150)
            pix.save(str(img_abs_path))
            pdf_doc.close()

            parsed_pages.append(
                ParsedPage(
                    page_number=page_num,
                    text_content=full_slide_text,
                    image_rel_path=img_rel_path,
                )
            )

        return parsed_pages


document_parser = DocumentParser()
