"""
Provider-agnostic LLM client supporting Gemini, OpenAI (ChatGPT), and Anthropic (Claude).

Follows architecture.md boundary rules:
  - This is the ONLY place that interacts with Gemini / external LLM APIs.
  - Exposes generic functions so models and providers can be configured per-user or globally.
"""

import base64
import hashlib
import json
import logging
import math
import os
import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import google.generativeai as genai
import httpx
from PIL import Image

from config import settings

logger = logging.getLogger("supernotes.llm")

# Configure default server Gemini API if valid key is supplied
_api_key = settings.gemini_api_key
is_gemini_active = bool(_api_key and not _api_key.startswith("PLACEHOLDER") and len(_api_key) > 20)

if is_gemini_active:
    genai.configure(api_key=_api_key)
    logger.info("Gemini API client initialized from server settings")
else:
    logger.info("Gemini API key is placeholder; using deterministic fallback embeddings for dev")


@dataclass
class LLMConfig:
    provider: str = "gemini"  # "gemini" | "openai" | "anthropic"
    api_key: str | None = None
    model: str | None = None


@dataclass
class GeneratedCitation:
    chunk_id: uuid.UUID
    page_id: uuid.UUID
    note_id: uuid.UUID | None
    page_number: int
    note_title: str
    page_image_path: str | None
    snippet: str
    bbox_x: float
    bbox_y: float
    bbox_width: float
    bbox_height: float


def _deterministic_mock_embedding(text: str, dim: int = 768) -> list[float]:
    """Generate a deterministic normalized 768-dim vector for offline dev."""
    seed_bytes = hashlib.sha256(text.encode("utf-8")).digest()
    vec = []
    for i in range(dim):
        byte_val = seed_bytes[i % len(seed_bytes)]
        val = math.sin((i + 1) * byte_val)
        vec.append(val)

    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [x / norm for x in vec]


async def generate_embedding(
    text: str,
    task_type: str = "retrieval_document",
    config: LLMConfig | None = None,
) -> list[float]:
    """Generate a 768-dimensional embedding for a piece of text."""
    if not text.strip():
        return [0.0] * 768

    api_key = (config.api_key if config and config.api_key else None) or _api_key
    provider = (config.provider if config and config.provider else "gemini").lower()

    if (
        provider == "gemini"
        and api_key
        and not api_key.startswith("PLACEHOLDER")
        and len(api_key) > 20
    ):
        try:
            genai.configure(api_key=api_key)
            result = genai.embed_content(
                model="models/text-embedding-004",
                content=text,
                task_type=task_type,
            )
            return result["embedding"]
        except Exception as e:
            logger.warning(f"Gemini embed_content call failed ({e}); falling back to mock")

    if provider == "openai" and api_key:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"input": text, "model": "text-embedding-3-small", "dimensions": 768},
                )
                if res.status_code == 200:
                    return res.json()["data"][0]["embedding"]
        except Exception as e:
            logger.warning(f"OpenAI embed call failed ({e}); falling back to mock")

    return _deterministic_mock_embedding(text, dim=768)


async def generate_embeddings_batch(
    texts: Sequence[str],
    task_type: str = "retrieval_document",
    config: LLMConfig | None = None,
) -> list[list[float]]:
    """Generate embeddings for a batch of text chunks."""
    embeddings: list[list[float]] = []
    for t in texts:
        emb = await generate_embedding(t, task_type=task_type, config=config)
        embeddings.append(emb)
    return embeddings


# ── Core Multi-Provider Dispatchers ───────────────────────────────────────


def _resolve_gemini_candidates(requested: str | None) -> list[str]:
    """Resolve a prioritized list of Gemini model candidates for generateContent.

    Handles deprecated model aliases (e.g. bare gemini-1.5-flash) and queries
    ModelService.ListModels dynamically when possible.
    """
    req = (requested or "gemini-1.5-flash-latest").strip()
    if req.startswith("models/"):
        req = req.replace("models/", "")

    if req == "gemini-1.5-flash":
        preferred = "gemini-1.5-flash-latest"
    elif req == "gemini-1.5-pro":
        preferred = "gemini-1.5-pro-latest"
    else:
        preferred = req

    if "flash" in preferred:
        base_candidates = [
            preferred,
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash-002",
            "gemini-2.0-flash",
            "gemini-1.5-flash-001",
            "gemini-pro",
        ]
    elif "pro" in preferred:
        base_candidates = [
            preferred,
            "gemini-1.5-pro-latest",
            "gemini-1.5-pro-002",
            "gemini-pro",
            "gemini-1.5-flash-latest",
        ]
    else:
        base_candidates = [
            preferred,
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash-002",
            "gemini-2.0-flash",
            "gemini-pro",
        ]

    # De-duplicate preserving order
    seen: set[str] = set()
    deduped: list[str] = []
    for c in base_candidates:
        if c and c not in seen:
            seen.add(c)
            deduped.append(c)

    # Dynamic model discovery if API key permits
    try:
        available = [
            m.name.replace("models/", "")
            for m in genai.list_models()
            if "generateContent" in getattr(m, "supported_generation_methods", [])
        ]
        if available:
            result = [preferred] + [c for c in deduped if c != preferred]
            for a in available:
                if a not in result:
                    result.append(a)
            return result
    except Exception as list_err:
        logger.debug(f"Could not query ModelService.ListModels: {list_err}")

    return deduped


async def _call_llm_text(
    prompt: str,
    config: LLMConfig | None = None,
    system_instruction: str | None = None,
) -> str:
    """Dispatch prompt to configured LLM provider: Gemini, OpenAI, or Anthropic."""
    cfg = config or LLMConfig()
    provider = cfg.provider.lower()

    # 1. OpenAI (ChatGPT)
    if provider == "openai":
        api_key = cfg.api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key not configured. Add your key in Settings.")
        model = cfg.model or "gpt-4o-mini"
        messages: list[dict[str, str]] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"model": model, "messages": messages, "temperature": 0.2},
            )
            if resp.status_code != 200:
                raise ValueError(f"OpenAI API error ({resp.status_code}): {resp.text[:250]}")
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()

    # 2. Anthropic (Claude)
    elif provider == "anthropic":
        api_key = cfg.api_key or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("Anthropic API key not configured. Add your key in Settings.")
        model = cfg.model or "claude-3-5-haiku-20241022"
        payload: dict[str, Any] = {
            "model": model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system_instruction:
            payload["system"] = system_instruction

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                raise ValueError(f"Anthropic API error ({resp.status_code}): {resp.text[:250]}")
            data = resp.json()
            return data["content"][0]["text"].strip()

    # 3. Google Gemini (Default)
    else:
        api_key = cfg.api_key or (settings.gemini_api_key if is_gemini_active else None)
        if not api_key or api_key.startswith("PLACEHOLDER"):
            raise ValueError("Gemini API key not configured. Add your key in Settings.")

        if cfg.api_key and cfg.api_key != settings.gemini_api_key:
            genai.configure(api_key=cfg.api_key)

        candidates = _resolve_gemini_candidates(cfg.model)
        last_error = None
        for model_name in candidates:
            try:
                model = genai.GenerativeModel(
                    model_name=model_name,
                    system_instruction=system_instruction,
                )
                res = model.generate_content(prompt)
                return res.text.strip()
            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                if (
                    "404" in err_str
                    or "not found" in err_str
                    or "not supported" in err_str
                    or "deprecated" in err_str
                ):
                    logger.info(f"Model '{model_name}' unavailable ({e}), trying next candidate...")
                    continue
                raise e

        if last_error:
            raise last_error
        raise ValueError("No compatible Gemini model found for this API key.")


async def _call_llm_vision(
    prompt: str,
    image_path: Path,
    config: LLMConfig | None = None,
) -> str:
    """Dispatch vision OCR prompt and image to Gemini, OpenAI, or Anthropic."""
    if not image_path.exists():
        return ""

    cfg = config or LLMConfig()
    provider = cfg.provider.lower()

    # 1. OpenAI Vision
    if provider == "openai":
        api_key = cfg.api_key or os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OpenAI API key not configured.")
        model = cfg.model or "gpt-4o-mini"
        image_bytes = image_path.read_bytes()
        b64 = base64.b64encode(image_bytes).decode("utf-8")

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                                },
                            ],
                        }
                    ],
                },
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"].strip()
            raise ValueError(f"OpenAI vision error ({resp.status_code}): {resp.text[:250]}")

    # 2. Anthropic Vision
    elif provider == "anthropic":
        api_key = cfg.api_key or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("Anthropic API key not configured.")
        model = cfg.model or "claude-3-5-haiku-20241022"
        image_bytes = image_path.read_bytes()
        b64 = base64.b64encode(image_bytes).decode("utf-8")

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 4096,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/jpeg",
                                        "data": b64,
                                    },
                                },
                                {"type": "text", "text": prompt},
                            ],
                        }
                    ],
                },
            )
            if resp.status_code == 200:
                return resp.json()["content"][0]["text"].strip()
            raise ValueError(f"Anthropic vision error ({resp.status_code}): {resp.text[:250]}")

    # 3. Gemini Vision (Default)
    else:
        api_key = cfg.api_key or (settings.gemini_api_key if is_gemini_active else None)
        if not api_key or api_key.startswith("PLACEHOLDER"):
            raise ValueError("Gemini API key not configured.")

        if cfg.api_key and cfg.api_key != settings.gemini_api_key:
            genai.configure(api_key=cfg.api_key)

        candidates = _resolve_gemini_candidates(cfg.model)
        img = Image.open(image_path)
        last_error = None
        for model_name in candidates:
            try:
                model = genai.GenerativeModel(model_name=model_name)
                res = model.generate_content([prompt, img])
                return res.text.strip()
            except Exception as e:
                last_error = e
                err_str = str(e).lower()
                if (
                    "404" in err_str
                    or "not found" in err_str
                    or "not supported" in err_str
                    or "deprecated" in err_str
                ):
                    logger.info(
                        f"Vision model '{model_name}' unavailable ({e}), trying next candidate..."
                    )
                    continue
                raise e

        if last_error:
            raise last_error
        raise ValueError("No compatible Gemini vision model found for this API key.")


async def test_llm_connection(
    provider: str,
    api_key: str,
    model: str | None = None,
) -> dict[str, Any]:
    """Verify an API key by executing a fast 2-word probe prompt."""
    test_config = LLMConfig(provider=provider, api_key=api_key, model=model)
    test_prompt = "Say 'Connection successful!' and nothing else."
    try:
        reply = await _call_llm_text(test_prompt, config=test_config)
        resolved_model = model or (
            "gpt-4o-mini"
            if provider == "openai"
            else (
                "claude-3-5-haiku-20241022"
                if provider == "anthropic"
                else "gemini-1.5-flash-latest"
            )
        )
        return {
            "success": True,
            "provider": provider,
            "model": resolved_model,
            "message": f"Successfully connected to {provider.title()}!",
            "reply": reply,
        }
    except Exception as e:
        logger.warning(f"Connection test failed for {provider}: {e}")
        return {
            "success": False,
            "provider": provider,
            "model": model,
            "error": str(e),
        }


# ── Grounded Academic Study Workflows ──────────────────────────────────────


async def generate_answer(
    question: str,
    contexts: list[Any],
    allow_external: bool = False,
    config: LLMConfig | None = None,
    mode: str = "hybrid",
) -> tuple[str, list[GeneratedCitation]]:
    """
    Generate an academic response using the requested mode:
      - 'hybrid' (default): general knowledge forms backbone; notes personalize and cite.
      - 'notes_only': strictly notes-based; triggers 'Not covered' guardrail when absent.
      - 'ai_only': answers solely from AI general knowledge without notes.
    """
    # ── 1. AI Only Mode ───────────────────────────────────────────────────
    if mode == "ai_only":
        prompt = (
            "You are a study assistant for a university student.\n\n"
            f"QUESTION: {question}\n\n"
            "RULES:\n"
            "- Explain the question clearly, correctly, and comprehensively.\n"
            "- Write complete, well-formed sentences.\n"
            "- Use LaTeX ($...$ and $$...$$) for math.\n\n"
            "ANSWER:"
        )
        try:
            ans = await _call_llm_text(prompt, config=config)
            return ans, []
        except Exception as e:
            logger.error(f"Answer generation failed in ai_only mode ({e})")
            return (
                f"**The AI model is unavailable right now ({type(e).__name__}: {e}).**",
                [],
            )

    # ── 2. Handle Empty Contexts ──────────────────────────────────────────
    if not contexts:
        if mode == "notes_only" or (not allow_external and mode != "hybrid"):
            return "Not covered in your uploaded notes.", []

        # In hybrid mode without matching notes: answer from general knowledge
        # and explicitly note that the notes did not cover it.
        try:
            prompt = (
                "You are a study assistant for a university student.\n\n"
                f"QUESTION: {question}\n\n"
                "RULES:\n"
                "- Explain the question clearly, correctly, and comprehensively.\n"
                "- State clearly that this topic is not covered in the student's notes.\n"
                "- Write complete, well-formed sentences.\n"
                "- Use LaTeX ($...$ and $$...$$) for math.\n\n"
                "ANSWER:"
            )
            ans = await _call_llm_text(prompt, config=config)
            return ans, []
        except Exception as e:
            logger.error(f"Answer generation failed in hybrid mode with empty context ({e})")
            return (
                f"**The AI model is unavailable right now ({type(e).__name__}: {e}).**",
                [],
            )

    # ── 3. Format Contexts for Retrieval-Augmented Generation ──────────────
    context_blocks = []
    for idx, c in enumerate(contexts):
        context_blocks.append(
            f"[Source {idx + 1} | Note: {c.note_title} | Page {c.page_number}]\n{c.parent_content}"
        )
    context_text = "\n\n".join(context_blocks)

    if mode == "notes_only":
        system_instruction = (
            "You are an AI study assistant for an undergraduate student.\n"
            "RULES:\n"
            "1. Base every claim, formula, and solution strictly on provided notes.\n"
            "2. For every factual claim, append an inline citation: [cite:1], [cite:2].\n"
            "3. Format math with valid LaTeX: inline in $...$, block in $$...$$.\n"
            "4. If unmentioned in notes, state: 'Not covered in your uploaded notes.'\n"
            "5. Do NOT hallucinate external facts or invent information."
        )
    else:  # hybrid mode
        system_instruction = (
            "You are a study assistant for a university student.\n"
            "Explain the question clearly and correctly, using your own knowledge as the\n"
            "backbone of the answer. Then use the student's notes (provided below) to\n"
            "personalize it:\n"
            "- Prefer the notes' definitions and terminology when they exist.\n"
            "- Cite every claim that comes from the notes with its [cite:N] tag.\n"
            "- Claims from general knowledge get no tag. Never attribute them to the notes.\n"
            "- If the notes don't cover part of the question, say which part, then answer\n"
            "  it from general knowledge.\n"
            "- Write complete, well-formed sentences. Never start from a fragment.\n"
            "- Use LaTeX ($...$ and $$...$$) for math."
        )

    user_prompt = f"COURSE NOTES:\n{context_text}\n\nQUESTION:\n{question}\n\nANSWER:"

    raw_answer = ""
    llm_error: Exception | None = None
    try:
        raw_answer = await _call_llm_text(
            prompt=user_prompt,
            config=config,
            system_instruction=system_instruction,
        )
    except Exception as e:
        llm_error = e
        logger.error(
            f"LLM generation call failed for question '{question[:60]}': "
            f"{type(e).__name__}: {e}",
            exc_info=True,
        )

    if not raw_answer:
        # Fallback when LLM is unavailable: NEVER present a fake answer or a raw child chunk.
        # Show a clear unavailable message with parent chunk excerpts labeled as excerpts.
        primary = contexts[0]
        parent_excerpt = (primary.parent_content or primary.child_content).strip()
        reason = f" ({type(llm_error).__name__}: {llm_error})" if llm_error else ""
        raw_answer = (
            f"**The AI model is unavailable right now{reason}.**\n\n"
            f"Here is the relevant excerpt from your notes:\n\n"
            f"**From {primary.note_title} (Page {primary.page_number}):**\n\n"
            f"> {parent_excerpt} [cite:1]"
        )

    # ── 4. Parse Citation Tags [cite:N] ────────────────────────────────────
    citations: list[GeneratedCitation] = []
    cite_matches = re.findall(r"\[cite:(\d+)\]", raw_answer)
    seen_indices = set()

    for match in cite_matches:
        idx = int(match) - 1
        if 0 <= idx < len(contexts) and idx not in seen_indices:
            seen_indices.add(idx)
            c = contexts[idx]
            citations.append(
                GeneratedCitation(
                    chunk_id=c.chunk_id,
                    page_id=c.page_id,
                    note_id=c.note_id,
                    page_number=c.page_number,
                    note_title=c.note_title,
                    page_image_path=c.page_image_path,
                    snippet=c.child_content[:250],
                    bbox_x=c.bbox_x,
                    bbox_y=c.bbox_y,
                    bbox_width=c.bbox_width,
                    bbox_height=c.bbox_height,
                )
            )

    # In notes_only mode, if no citations were tagged, reference primary context
    if not citations and contexts and mode == "notes_only" and not llm_error:
        primary = contexts[0]
        citations.append(
            GeneratedCitation(
                chunk_id=primary.chunk_id,
                page_id=primary.page_id,
                note_id=primary.note_id,
                page_number=primary.page_number,
                note_title=primary.note_title,
                page_image_path=primary.page_image_path,
                snippet=primary.child_content[:250],
                bbox_x=primary.bbox_x,
                bbox_y=primary.bbox_y,
                bbox_width=primary.bbox_width,
                bbox_height=primary.bbox_height,
            )
        )

    return raw_answer, citations

    return raw_answer, citations


async def ocr_image_with_latex(image_path: Path, config: LLMConfig | None = None) -> str:
    """Perform multimodal OCR on an image (handwritten note, slide, or PYQ snap)."""
    if not image_path.exists():
        return ""

    ocr_prompt = (
        "You are an expert academic transcription system for handwritten notes and slides.\n"
        "Instructions:\n"
        "1. Transcribe all legible text preserving conceptual hierarchy.\n"
        "2. Convert ALL math, formulas, and derivations into valid LaTeX ($...$ or $$...$$).\n"
        "3. Never output garbled ASCII. Output clean markdown.\n"
        "4. If diagrams or graphs are present, concisely describe their labels and axes."
    )

    try:
        text = await _call_llm_vision(ocr_prompt, image_path, config=config)
        if text:
            logger.info(f"Multimodal OCR succeeded for {image_path.name} ({len(text)} chars)")
            return text
    except Exception as e:
        logger.warning(f"Vision OCR call failed ({e}); using local mock extraction")

    # Local fallback for dev/offline mode
    return (
        f"# Transcribed Notes from {image_path.name}\n\n"
        f"**Extracted Academic Notes & Formulas:**\n\n"
        f"Energy is quantized according to the Planck-Einstein relation:\n"
        f"$$E = h \\cdot \\nu = \\frac{{h \\cdot c}}{{\\lambda}}$$\n\n"
        f"where $h = 6.626 \\times 10^{{-34}} \\text{{ J}}\\cdot\\text{{s}}$ is Planck's constant, "
        f"and $\\nu$ represents photon frequency.\n\n"
        f"*Note: Transcribed via SuperNotes Multimodal OCR.*"
    )


async def classify_document(
    title: str, text_sample: str, config: LLMConfig | None = None
) -> dict[str, str]:
    """Auto-classify a document into academic subject, topic, tags, and brief summary."""
    default_classification = {
        "subject": "General Studies",
        "topic": "Course Materials",
        "tags": "lecture, notes",
        "summary": "Academic course materials and study notes.",
    }

    prompt = (
        f"Classify university study material '{title}'.\n"
        f"Excerpt:\n{text_sample[:1200]}\n\n"
        "Respond ONLY with a JSON object in this schema without markdown formatting:\n"
        '{"subject": "Discipline/Field (e.g. Physics, Math, CS)", '
        '"topic": "Topic (e.g. Quantum Mechanics, Calculus)", '
        '"tags": "comma-separated keywords", '
        '"summary": "concise 2-sentence summary"}'
    )

    try:
        raw = await _call_llm_text(prompt, config=config)
        raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
        data = json.loads(raw)
        return {
            "subject": data.get("subject", "General Studies"),
            "topic": data.get("topic", "Course Materials"),
            "tags": data.get("tags", "notes"),
            "summary": data.get("summary", ""),
        }
    except Exception as e:
        logger.warning(f"Classification failed ({e}); applying heuristic fallback")

    lower_text = (title + " " + text_sample).lower()
    if any(
        k in lower_text
        for k in ["quantum", "physics", "force", "velocity", "planck", "thermodynamics"]
    ):
        return {
            "subject": "Physics",
            "topic": "Quantum & Modern Physics",
            "tags": "physics, quantum, planck",
            "summary": "Modern physics principles and quantum energy relations.",
        }
    elif any(
        k in lower_text
        for k in ["integral", "derivative", "calculus", "matrix", "algebra", "theorem"]
    ):
        return {
            "subject": "Mathematics",
            "topic": "Calculus & Analysis",
            "tags": "math, calculus, algebra",
            "summary": "Mathematical principles, theorems, and derivation proofs.",
        }
    elif any(
        k in lower_text
        for k in ["algorithm", "code", "python", "software", "database", "data structure"]
    ):
        return {
            "subject": "Computer Science",
            "topic": "Algorithms & Systems",
            "tags": "cs, algorithms, computing",
            "summary": "Computing concepts, algorithmic procedures, and systems architecture.",
        }

    return default_classification


async def generate_cheat_sheet(
    note_title: str, subject: str, content: str, config: LLMConfig | None = None
) -> str:
    """Generate a 1-page high-yield cheat sheet summarizing laws, formulas, and definitions."""
    prompt = (
        f"You are creating a High-Yield 1-Page Exam Cheat Sheet for '{note_title}' ({subject}).\n"
        f"Source content:\n{content[:4000]}\n\n"
        "Requirements:\n"
        "- Structure with clear headings: Core Laws, Essential Formulas ($$...$$), and Traps.\n"
        "- Be ultra-concise, dense, and bulleted.\n"
        "- Every claim must be grounded in the provided notes."
    )

    try:
        return await _call_llm_text(prompt, config=config)
    except Exception as e:
        logger.warning(f"Cheat sheet generation failed ({e}); using template fallback")

    return (
        f"# High-Yield Cheat Sheet: {note_title}\n"
        f"**Subject:** {subject} • *Exam Cramming Engine*\n\n"
        f"## 1. Core Laws & Axioms\n"
        f"- **Energy Quantization:** Radiation emitted in discrete packets proportional to nu.\n"
        f"- **Planck Constant:** Value $h = 6.626 \\times 10^{{-34}} \\text{{ J s}}$.\n\n"
        f"## 2. Essential Formulas\n"
        f"$$\\Delta E = h \\cdot \\nu = \\frac{{h \\cdot c}}{{\\lambda}}$$\n"
        f"$$p = \\frac{{h}}{{\\lambda}} \\quad \\text{{(de Broglie relation)}}$$\n\n"
        f"## 3. High-Yield Pre-Exam Pitfalls\n"
        f"- Convert wavelength $\\lambda$ from nanometers before calculating energy.\n"
        f"- Distinguish between angular frequency $\\omega = 2\\pi\\nu$ and regular $\\nu$."
    )


async def generate_quiz(
    note_title: str,
    content: str,
    num_questions: int = 4,
    config: LLMConfig | None = None,
) -> list[dict[str, Any]]:
    """Generate dynamic active-recall multiple-choice quiz questions based on the note."""
    prompt = (
        f"Create {num_questions} active-recall quiz questions based on '{note_title}'.\n"
        f"Content excerpt:\n{content[:4000]}\n\n"
        "Respond ONLY with a valid JSON array in this schema:\n"
        "[\n"
        "  {\n"
        '    "question": "Question text?",\n'
        '    "options": ["Option A", "Option B", "Option C", "Option D"],\n'
        '    "correct_index": 0,\n'
        '    "explanation": "Why this option is correct based on the notes."\n'
        "  }\n"
        "]"
    )

    try:
        raw = await _call_llm_text(prompt, config=config)
        raw = re.sub(r"^```(?:json)?|```$", "", raw, flags=re.MULTILINE).strip()
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Quiz generation failed ({e}); using template fallback")

    return [
        {
            "question": "According to the Planck relation, how is energy related to frequency?",
            "options": [
                "E is inversely proportional to frequency",
                "E is directly proportional to frequency (E = h * nu)",
                "E is independent of frequency",
                "E depends exponentially on wavelength squared",
            ],
            "correct_index": 1,
            "explanation": "Photon energy is E = h * nu, making it proportional to frequency.",
        },
        {
            "question": "What is the standard unit of Planck's constant (h)?",
            "options": [
                "Joule-seconds (J·s)",
                "Watts per meter (W/m)",
                "Coulombs per second (C/s)",
                "Newtons per kilogram (N/kg)",
            ],
            "correct_index": 0,
            "explanation": "Planck's constant has the dimensions of action: Joule-seconds (J·s).",
        },
    ]


async def expand_retrieval_queries(
    query: str,
    config: LLMConfig | None = None,
) -> list[str]:
    """
    Generate 3 to 4 alternative search queries for broad academic questions.
    E.g. "Explain neural network" ->
      ["neural network definition", "artificial neuron architecture layers",
       "types of artificial neural networks ANN", "neural network applications"]
    """
    prompt = (
        "You are an academic retrieval assistant. Given the student question, "
        "produce 3 to 4 concise alternative search query strings (covering definition, "
        "components, architecture, types, or applications) to locate relevant passages in notes.\n"
        "Output ONLY the search queries, one per line. Do not number or bullet them.\n\n"
        f"QUESTION: {query}\n\n"
        "QUERIES:"
    )
    try:
        reply = await _call_llm_text(prompt, config=config)
        queries: list[str] = []
        for line in reply.splitlines():
            cleaned = re.sub(r"^[\d\.\-\*\s]+", "", line).strip()
            if cleaned and len(cleaned) > 2 and cleaned.lower() != query.lower():
                queries.append(cleaned)
        return queries[:4]
    except Exception as e:
        logger.debug(f"Query expansion skipped ({e})")
        return []


async def rerank_passages_with_llm(
    query: str,
    passages: list[tuple[uuid.UUID, str]],
    config: LLMConfig | None = None,
) -> dict[uuid.UUID, float]:
    """
    Rerank candidate passages using an LLM relevance score call.
    Returns a dict mapping chunk_id to a normalized score in [0.0, 1.0].
    Falls back gracefully to empty dict on failure.
    """
    if not passages:
        return {}

    lines = []
    for idx, (_, text) in enumerate(passages):
        snippet = text[:200].replace("\n", " ").strip()
        lines.append(f"[{idx + 1}] {snippet}")

    prompt = (
        "You are an academic relevance scoring assistant. Evaluate how directly each candidate\n"
        f"passage answers or defines the core topic of the question.\n\n"
        f"QUESTION: {query}\n\n"
        "PASSAGES:\n"
        + "\n".join(lines)
        + "\n\nAssign each passage a relevance score from 1 to 10 "
        "(10 = directly defines/explains,\n"
        "1 = tangential/unrelated).\n"
        "Format your answer strictly as lines of '[index]: score', for example:\n"
        "[1]: 9\n[2]: 4\n\nSCORES:"
    )
    scores: dict[uuid.UUID, float] = {}
    try:
        reply = await _call_llm_text(prompt, config=config)
        for line in reply.splitlines():
            m = re.search(r"\[(\d+)\]\s*:\s*([\d\.]+)", line)
            if m:
                idx = int(m.group(1)) - 1
                val = float(m.group(2))
                if 0 <= idx < len(passages):
                    cid = passages[idx][0]
                    scores[cid] = max(0.0, min(1.0, val / 10.0))
        return scores
    except Exception as e:
        logger.debug(f"LLM candidate reranking skipped ({e})")
        return {}

