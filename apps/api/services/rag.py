"""
RAG Service — Hierarchical Parent-Document retrieval with hybrid search & citation grounding.

Invariants (architecture.md):
  1. Every generated claim carries a citation to a source page and snippet.
  2. If nothing relevant is retrieved, answer is deterministically
     "Not covered in your uploaded notes".
  3. Retrieval is always scoped to notes owned by the requesting user.
  4. Hybrid search: Combines vector similarity with keyword/phrase matching so
     direct textual evidence is never missed.
"""

import logging
import re
import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Chunk, Note, Page
from llm.client import (
    LLMConfig,
    expand_retrieval_queries,
    generate_embedding,
    rerank_passages_with_llm,
)

logger = logging.getLogger("supernotes.rag")

# Semantic cutoff for pure vector candidates with zero keyword overlap
MAX_COSINE_DISTANCE = 0.80

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "did", "do", "does", "doing",
    "down", "during", "each", "few", "for", "from", "further", "had", "has",
    "have", "having", "he", "her", "here", "hers", "him", "his", "how", "i", "if",
    "in", "into", "is", "it", "its", "me", "more", "most", "my", "no", "nor",
    "not", "of", "off", "on", "once", "only", "or", "other", "our", "out", "over",
    "own", "same", "she", "so", "some", "such", "than", "that", "the", "their",
    "theirs", "them", "then", "there", "these", "they", "this", "those", "through",
    "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
    "when", "where", "which", "while", "who", "whom", "why", "with", "you",
    "your", "yours",
    # Question-intent and generic command stopwords
    "define", "definition", "definitions", "tell", "explain", "explanation",
    "describe", "description", "discuss", "give", "show", "overview", "detail",
    "details", "elaborate", "summary", "summarize", "brief", "notes", "material",
}

DEFINITION_MARKERS = [
    "is a", "is an", "are a", "are an", "is defined as", "are defined as",
    "refers to", "can be defined as", "is known as", "denotes", "meaning",
    "definition:", "consists of", "defined as",
]


@dataclass
class RetrievedContext:
    chunk_id: uuid.UUID
    parent_chunk_id: uuid.UUID | None
    note_id: uuid.UUID
    note_title: str
    page_id: uuid.UUID
    page_number: int
    page_image_path: str | None
    bbox_x: float
    bbox_y: float
    bbox_width: float
    bbox_height: float
    child_content: str
    parent_content: str
    distance: float
    score: float  # Hybrid relevance score (0.0 to 1.0+)


def _extract_query_terms_and_phrases(query: str) -> tuple[list[str], list[str]]:
    """Extract significant keywords and 2-word key phrases from student query."""
    cleaned = re.sub(r"[^\w\s]", " ", query.lower())
    words = cleaned.split()
    terms = [w for w in words if w not in STOPWORDS and len(w) > 1]

    phrases = []
    if len(terms) >= 2:
        for i in range(len(terms) - 1):
            phrases.append(f"{terms[i]} {terms[i+1]}")

    return (terms if terms else words), phrases


def _is_broad_question(query: str, terms: list[str]) -> bool:
    """Check if query is an open-ended/broad academic inquiry."""
    q_lower = query.lower()
    intent_pattern = (
        r"\b(explain|describe|what is|what are|overview|discuss|define|tell me about)\b"
    )
    if re.search(intent_pattern, q_lower):
        return True
    return len(terms) <= 3


def _is_definition_question(query: str) -> bool:
    """Check if query specifically seeks definitions or high-level explanations."""
    q_lower = query.lower()
    def_pattern = r"\b(what is|what are|explain|define|definition|describe|meaning of|concept of)\b"
    return bool(re.search(def_pattern, q_lower))


class RAGService:
    async def retrieve_relevant_context(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        query: str,
        top_k: int = 5,
        note_ids: list[uuid.UUID] | None = None,
        folder_id: uuid.UUID | None = None,
        config: LLMConfig | None = None,
    ) -> list[RetrievedContext]:
        """
        Perform tuned hybrid hierarchical retrieval:
          1. Extract keywords and key phrases (ignoring question-intent stopwords).
          2. Perform LLM query expansion for broad questions.
          3. Retrieve keyword and vector candidates across queries with higher candidate limits.
          4. Boost definition-like chunks and apply real reranker with heuristic fallback.
          5. Enrich with parent chunks and log retrieved candidates with detailed scores.
        """
        terms, phrases = _extract_query_terms_and_phrases(query)
        is_broad = _is_broad_question(query, terms)
        is_def_q = _is_definition_question(query)

        # Broad questions pull more candidates from several pages
        effective_top_k = max(top_k, 8) if (is_broad or note_ids or folder_id) else top_k

        # ── 1. Query Expansion via LLM ─────────────────────────────────────
        search_queries = [query]
        expanded = await expand_retrieval_queries(query, config=config)
        if expanded:
            logger.info(f"Query expansion for '{query[:40]}': {expanded}")
            search_queries.extend(expanded[:3])

        # Gather all distinct search terms and phrases across query variants
        all_terms = list(dict.fromkeys(terms))
        all_phrases = list(dict.fromkeys(phrases))
        for eq in expanded[:3]:
            eq_terms, eq_phrases = _extract_query_terms_and_phrases(eq)
            for t in eq_terms:
                if t not in all_terms:
                    all_terms.append(t)
            for p in eq_phrases:
                if p not in all_phrases:
                    all_phrases.append(p)

        # Base filter clauses enforcing strict user ownership and scoping
        where_clauses = [
            Note.owner_id == user_id,
            Chunk.chunk_type == "child",
        ]
        if note_ids:
            where_clauses.append(Note.id.in_(note_ids))
        if folder_id:
            where_clauses.append(Note.folder_id == folder_id)

        candidates: dict[uuid.UUID, dict] = {}

        # ── 2. Keyword Candidate Search ────────────────────────────────────
        kw_limit = 40 if is_broad else 25
        if all_terms:
            kw_filters = [Chunk.content.ilike(f"%{t}%") for t in all_terms[:10]]
            kw_stmt = (
                select(
                    Chunk,
                    Note.title.label("note_title"),
                    Page.id.label("page_id"),
                    Page.page_number,
                    Page.image_path.label("page_image_path"),
                )
                .join(Note, Chunk.note_id == Note.id)
                .join(Page, Chunk.page_id == Page.id)
                .where(*where_clauses, or_(*kw_filters))
                .limit(kw_limit)
            )
            kw_res = await db.execute(kw_stmt)
            for row in kw_res.all():
                chunk, note_title, page_id, page_number, page_image_path = row
                candidates[chunk.id] = {
                    "chunk": chunk,
                    "note_title": note_title,
                    "page_id": page_id,
                    "page_number": page_number,
                    "page_image_path": page_image_path,
                    "distance": None,
                }

        # ── 3. Vector Candidate Search ────────────────────────────────────
        query_vector = await generate_embedding(
            query, task_type="retrieval_query", config=config
        )
        distance_expr = Chunk.embedding.cosine_distance(query_vector)

        vec_limit = 35 if is_broad else 20
        vec_stmt = (
            select(
                Chunk,
                Note.title.label("note_title"),
                Page.id.label("page_id"),
                Page.page_number,
                Page.image_path.label("page_image_path"),
                distance_expr.label("distance"),
            )
            .join(Note, Chunk.note_id == Note.id)
            .join(Page, Chunk.page_id == Page.id)
            .where(*where_clauses, Chunk.embedding.is_not(None))
            .order_by(distance_expr.asc())
            .limit(vec_limit)
        )
        vec_res = await db.execute(vec_stmt)
        for row in vec_res.all():
            chunk, note_title, page_id, page_number, page_image_path, dist = row
            dist_float = float(dist) if dist is not None else None
            if chunk.id not in candidates:
                candidates[chunk.id] = {
                    "chunk": chunk,
                    "note_title": note_title,
                    "page_id": page_id,
                    "page_number": page_number,
                    "page_image_path": page_image_path,
                    "distance": dist_float,
                }
            else:
                existing_dist = candidates[chunk.id]["distance"]
                if existing_dist is None or (dist_float is not None and dist_float < existing_dist):
                    candidates[chunk.id]["distance"] = dist_float

        # ── 4. Hybrid Scoring & Definition Boosting ────────────────────────
        scored_items = []
        for item in candidates.values():
            content_lower = item["chunk"].content.lower()
            term_hits = sum(1 for t in terms if t in content_lower) if terms else 0
            has_phrase = any(p in content_lower for p in phrases) if phrases else False

            # Check for matches against expanded query terms as well
            expanded_hits = sum(1 for t in all_terms if t in content_lower)

            dist = item["distance"]
            vec_score = max(0.0, 1.0 - (dist if dist is not None else 1.0))
            kw_score = (term_hits / len(terms)) if terms else 0.0

            # Composite hybrid score
            hybrid_score = (0.5 * kw_score) + (0.3 * vec_score)
            if has_phrase:
                hybrid_score += 0.5
            if terms and term_hits == len(terms):
                hybrid_score += 0.2
            if expanded_hits > term_hits:
                hybrid_score += 0.1 * min(3, expanded_hits - term_hits)

            # Definition boosting for "explain / what is / define" queries
            if is_def_q:
                has_def_marker = any(m in content_lower for m in DEFINITION_MARKERS)
                if has_def_marker:
                    hybrid_score += 0.45
                # Boost if heading / opener mentions terms followed by definition verb
                first_line = content_lower.split("\n")[0][:100]
                if any(t in first_line for t in terms) and any(
                    m in first_line for m in ["is", "are", "refers", "defined"]
                ):
                    hybrid_score += 0.30

            # Guardrail filter
            is_relevant = (
                term_hits > 0
                or has_phrase
                or expanded_hits >= 2
                or (dist is not None and dist <= MAX_COSINE_DISTANCE)
            )

            if is_relevant:
                scored_items.append((hybrid_score, item))

        scored_items.sort(key=lambda x: x[0], reverse=True)

        # ── 5. Rerank Candidates with LLM (with heuristic fallback) ────────
        top_slice = scored_items[: max(effective_top_k + 4, 12)]
        passages_to_rerank = [(item["chunk"].id, item["chunk"].content) for _, item in top_slice]

        llm_rerank_scores = await rerank_passages_with_llm(
            query=query, passages=passages_to_rerank, config=config
        )

        final_ranked = []
        for h_score, item in top_slice:
            cid = item["chunk"].id
            if cid in llm_rerank_scores:
                # Blend heuristic score with LLM relevance score
                combined_score = (0.4 * h_score) + (0.6 * (llm_rerank_scores[cid] * 1.5))
            else:
                combined_score = h_score
            final_ranked.append((combined_score, item))

        final_ranked.sort(key=lambda x: x[0], reverse=True)
        top_candidates = final_ranked[:effective_top_k]

        # ── 6. Enrich with Parent Chunks ──────────────────────────────────
        contexts: list[RetrievedContext] = []
        for score, item in top_candidates:
            chunk = item["chunk"]
            parent_text = chunk.content
            if chunk.parent_chunk_id:
                p_res = await db.execute(
                    select(Chunk.content).where(Chunk.id == chunk.parent_chunk_id)
                )
                p_row = p_res.scalar_one_or_none()
                if p_row:
                    parent_text = p_row

            dist_val = item["distance"] if item["distance"] is not None else 0.5

            contexts.append(
                RetrievedContext(
                    chunk_id=chunk.id,
                    parent_chunk_id=chunk.parent_chunk_id,
                    note_id=chunk.note_id,
                    note_title=item["note_title"],
                    page_id=item["page_id"],
                    page_number=item["page_number"],
                    page_image_path=item["page_image_path"],
                    bbox_x=0.08,
                    bbox_y=0.15,
                    bbox_width=0.84,
                    bbox_height=0.20,
                    child_content=chunk.content,
                    parent_content=parent_text,
                    distance=float(dist_val),
                    score=round(float(score), 4),
                )
            )

        # ── 7. Detailed Logging of Retrieved Chunks ────────────────────────
        logger.info(
            f"Hybrid RAG retrieval complete: query='{query[:50]}' -> "
            f"{len(contexts)} contexts (effective_top_k={effective_top_k}, is_broad={is_broad}):"
        )
        for rank, c in enumerate(contexts):
            clean_snippet = c.child_content[:85].replace("\n", " ").strip()
            logger.info(
                f"  [Rank #{rank + 1}] Note='{c.note_title}' (p.{c.page_number}) | "
                f"score={c.score:.4f} | dist={c.distance:.4f} | "
                f"snippet='{clean_snippet}...'"
            )

        return contexts
        return contexts


rag_service = RAGService()
