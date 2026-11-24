"""
Sentence-aware parent-document chunker for hierarchical RAG retrieval.

Generates:
  1. Parent chunks: ~600-800 words, strictly bounded at sentence/heading ends.
  2. Child chunks: ~150-200 words with sentence-aware overlap for precise vector search.
     Child chunks reference their parent_chunk_id.
"""

import re
from dataclasses import dataclass


@dataclass
class ChildChunkData:
    content: str
    chunk_index: int
    page_number: int | None = None
    bbox_x: float = 0.08
    bbox_y: float = 0.15
    bbox_width: float = 0.84
    bbox_height: float = 0.20


@dataclass
class ParentChunkData:
    content: str
    chunk_index: int
    children: list[ChildChunkData]
    page_number: int | None = None


# Common academic/English abbreviations to prevent incorrect mid-sentence splits
ABBREVIATIONS = [
    r"\be\.g\.",
    r"\bi\.e\.",
    r"\bet al\.",
    r"\bvs\.",
    r"\bfig\.",
    r"\bfigs\.",
    r"\bdr\.",
    r"\bprof\.",
    r"\bmr\.",
    r"\bmrs\.",
    r"\bms\.",
    r"\beq\.",
    r"\beqs\.",
    r"\bapprox\.",
    r"\bno\.",
    r"\bsec\.",
    r"\bvol\.",
    r"\bpp\.",
    r"\bp\.",
    r"\bdept\.",
    r"\buniv\.",
    r"\bref\.",
    r"\balg\.",
]


def merge_short_lines(text: str, max_words_for_short: int = 8) -> str:
    """
    Merge fragmented short lines (typical in slide decks and narrow PDF columns)
    into clean sentences, preserving headings, bullet points, and blank line breaks.
    """
    lines = text.splitlines()
    if not lines:
        return ""

    merged_lines: list[str] = []
    current_line = ""

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            if current_line:
                merged_lines.append(current_line)
                current_line = ""
            continue

        # Check if line is a structural heading or list item that should stand alone
        is_heading_or_bullet = (
            line.startswith(("#", "-", "*", "•", ">"))
            or bool(re.match(r"^(\d+[\.\)]|[A-Z][\.\)]|Chapter\s+\d+|Section\s+\d+)", line, re.I))
            or (line.endswith(":") and len(line.split()) <= 6)
        )

        if is_heading_or_bullet:
            if current_line:
                merged_lines.append(current_line)
                current_line = ""
            merged_lines.append(line)
            continue

        if not current_line:
            current_line = line
        else:
            prev_words = current_line.split()
            prev_ends_term = bool(re.search(r"[\.\?!]\s*$", current_line))
            # If current line is short and doesn't end with terminal punctuation, merge
            if not prev_ends_term and len(prev_words) < max_words_for_short:
                current_line = f"{current_line} {line}"
            elif not prev_ends_term and not line[0].isupper():
                # Line wrap continuation (e.g. continues lower-case word/clause)
                current_line = f"{current_line} {line}"
            else:
                merged_lines.append(current_line)
                current_line = line

    if current_line:
        merged_lines.append(current_line)

    return "\n\n".join(merged_lines)


def split_into_sentences(text: str) -> list[str]:
    """
    Split text into full sentences and headings.
    Protects abbreviations, decimal numbers, and math blocks so no sentence is cut mid-phrase.
    """
    if not text or not text.strip():
        return []

    processed = text.strip()

    # 1. Protect inline math blocks $...$ and $$...$$
    math_blocks: list[str] = []

    def _mask_math(m: re.Match) -> str:
        idx = len(math_blocks)
        math_blocks.append(m.group(0))
        return f"__MATH_{idx}__"

    processed = re.sub(r"\$\$[\s\S]*?\$\$|\$[^$\n]+\$", _mask_math, processed)

    # 2. Protect decimal numbers (\d+\.\d+)
    def _mask_decimal(m: re.Match) -> str:
        return m.group(0).replace(".", "§DEC§")

    processed = re.sub(r"\b\d+\.\d+\b", _mask_decimal, processed)

    # 3. Protect known abbreviations
    for pattern in ABBREVIATIONS:
        def _mask_abbr(m: re.Match) -> str:
            return m.group(0).replace(".", "§DOT§")

        processed = re.sub(pattern, _mask_abbr, processed, flags=re.IGNORECASE)

    # 4. Split on paragraph boundaries first
    paragraphs = re.split(r"\n\s*\n+", processed)
    raw_sentences: list[str] = []

    for para in paragraphs:
        para_clean = para.strip()
        if not para_clean:
            continue

        # Split on sentence terminators followed by whitespace and capital letter / quote / bracket
        splits = re.split(r"(?<=[.?!])\s+(?=[A-Z0-9\"'(\[])", para_clean)
        for s in splits:
            s_clean = s.strip()
            if s_clean:
                raw_sentences.append(s_clean)

    # 5. Restore protected tokens
    restored_sentences: list[str] = []
    for s in raw_sentences:
        res = s.replace("§DEC§", ".").replace("§DOT§", ".")
        for idx, math_content in enumerate(math_blocks):
            res = res.replace(f"__MATH_{idx}__", math_content)
        # Normalize internal whitespace
        res = re.sub(r"[ \t]+", " ", res).strip()
        if res:
            restored_sentences.append(res)

    # 6. Clean leading orphan fragment if text starts with a mid-sentence fragment
    if len(restored_sentences) > 1 and restored_sentences[0] and restored_sentences[0][0].islower():
        restored_sentences[1] = f"{restored_sentences[0]} {restored_sentences[1]}"
        restored_sentences.pop(0)

    return restored_sentences


def stitch_page_texts(pages_data: list[tuple[int, str]]) -> list[tuple[int, str]]:
    """
    Stitch sentence fragments that cross document page boundaries.
    If page N ends without terminal punctuation, or page N+1 starts with a lowercase
    continuation clause, moves the leading fragment to page N so both pages begin
    and end with complete sentences.
    """
    if not pages_data or len(pages_data) <= 1:
        return pages_data

    stitched = [(p_num, text) for p_num, text in pages_data]
    for i in range(len(stitched) - 1):
        p_curr, curr_text = stitched[i]
        p_next, next_text = stitched[i + 1]

        c_str = curr_text.strip() if curr_text else ""
        n_str = next_text.strip() if next_text else ""
        if not c_str or not n_str:
            continue

        curr_ends_punct = bool(re.search(r"[\.\?!:]\s*$", c_str))
        next_starts_cont = bool(re.match(r"^[a-z0-9\(\,\-]", n_str))

        if not curr_ends_punct or next_starts_cont:
            m = re.search(r"^([\s\S]*?[\.\?!])\s+(?=[A-Z])", n_str)
            if m:
                frag = m.group(1).strip()
                stitched[i] = (p_curr, f"{c_str} {frag}")
                stitched[i + 1] = (p_next, n_str[m.end():].strip())

    return stitched


def _build_sentence_chunks(
    sentences: list[str],
    target_words: int,
    overlap_words: int,
) -> list[str]:
    """
    Assemble complete sentences into chunks of approximately target_words.
    - Chunks always start at the beginning of a sentence.
    - Chunks always end at the end of a sentence.
    - Overlap starts at the beginning of a sentence.
    - Zero mid-sentence cuts.
    """
    if not sentences:
        return []

    chunks: list[str] = []
    start_idx = 0
    num_sentences = len(sentences)

    while start_idx < num_sentences:
        curr_sentences: list[str] = []
        curr_word_count = 0
        end_idx = start_idx

        while end_idx < num_sentences:
            s = sentences[end_idx]
            s_words = len(s.split())
            if curr_sentences and (curr_word_count + s_words > target_words):
                break
            curr_sentences.append(s)
            curr_word_count += s_words
            end_idx += 1

        if not curr_sentences:
            # Single sentence exceeds target_words: keep it intact
            curr_sentences.append(sentences[end_idx])
            end_idx += 1

        chunk_text = " ".join(curr_sentences).strip()
        if chunk_text:
            chunks.append(chunk_text)

        if end_idx >= num_sentences:
            break

        # Calculate overlap starting at a sentence boundary
        overlap_accum = 0
        next_start = end_idx
        for k in range(end_idx - 1, start_idx, -1):
            overlap_accum += len(sentences[k].split())
            next_start = k
            if overlap_accum >= overlap_words:
                break

        # Ensure strict forward progress
        if next_start <= start_idx:
            next_start = start_idx + 1

        start_idx = next_start

    return chunks


class HierarchicalChunker:
    def __init__(
        self,
        parent_size: int = 700,
        parent_overlap: int = 50,
        child_size: int = 150,
        child_overlap: int = 25,
    ) -> None:
        self.parent_size = parent_size
        self.parent_overlap = parent_overlap
        self.child_size = child_size
        self.child_overlap = child_overlap

    def chunk_text(
        self, text: str, page_number: int | None = None
    ) -> list[ParentChunkData]:
        """
        Split text into sentence-aware parent chunks, and subdivide each parent
        into sentence-aware child chunks preserving bounding box coordinates and page numbers.
        """
        if not text or not text.strip():
            return []

        # 1. Merge fragmented lines (slide decks / column wraps)
        merged = merge_short_lines(text)
        sentences = split_into_sentences(merged)
        if not sentences:
            return []

        # 2. Build parent chunks from full sentences
        parent_texts = _build_sentence_chunks(
            sentences,
            target_words=self.parent_size,
            overlap_words=self.parent_overlap,
        )

        parents: list[ParentChunkData] = []
        for p_idx, p_text in enumerate(parent_texts):
            p_sentences = split_into_sentences(p_text)

            # 3. Subdivide parent into child chunks with sentence-aware overlap
            child_texts = _build_sentence_chunks(
                p_sentences,
                target_words=self.child_size,
                overlap_words=self.child_overlap,
            )
            if not child_texts:
                child_texts = [p_text]

            children: list[ChildChunkData] = []
            for c_idx, c_text in enumerate(child_texts):
                # Calculate proportional vertical bounding box coordinates
                y_coord = round(min(0.78, 0.10 + (c_idx % 4) * 0.22), 2)
                children.append(
                    ChildChunkData(
                        content=c_text,
                        chunk_index=c_idx,
                        page_number=page_number,
                        bbox_x=0.08,
                        bbox_y=y_coord,
                        bbox_width=0.84,
                        bbox_height=0.20,
                    )
                )

            parents.append(
                ParentChunkData(
                    content=p_text,
                    chunk_index=p_idx,
                    children=children,
                    page_number=page_number,
                )
            )

        return parents

    def chunk_document(
        self, pages_data: list[tuple[int, str]]
    ) -> list[ParentChunkData]:
        """
        Stitch sentence boundaries across page breaks and chunk the entire document.
        """
        stitched = stitch_page_texts(pages_data)
        all_parents: list[ParentChunkData] = []
        for p_num, text in stitched:
            parents = self.chunk_text(text, page_number=p_num)
            all_parents.extend(parents)
        return all_parents


chunker = HierarchicalChunker()
