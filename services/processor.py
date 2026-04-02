import io
import platform
import pdfplumber
import pytesseract
from PIL import Image
from config import supabase, index, get_user_namespace
from services.embeddings import chunk_text, get_embeddings_batch

# ── Tesseract path (Windows only) ─────────────────────────────────────
if platform.system() == "Windows":
    pytesseract.pytesseract.tesseract_cmd = \
        r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ── Text extraction dispatcher ────────────────────────────────────────
def extract_text(file_bytes: bytes, file_type: str) -> str:
    try:
        if file_type == "PDF":
            return extract_from_pdf(file_bytes)
        elif file_type == "IMG":
            return extract_from_image(file_bytes)
        elif file_type == "TXT":
            return extract_from_txt(file_bytes)
        else:
            return ""
    except Exception as e:
        print(f"Text extraction error: {e}")
        return ""

# ── PDF extractor ─────────────────────────────────────────────────────
def extract_from_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages):
            try:
                page_text = page.extract_text()
                if page_text and page_text.strip():
                    text_parts.append(page_text)
                else:
                    print(f"Page {page_num + 1} has no extractable text")
            except Exception as e:
                print(f"Failed to extract page {page_num + 1}: {e}")
                continue
    return "\n\n".join(text_parts)

# ── Image extractor ───────────────────────────────────────────────────
def extract_from_image(file_bytes: bytes) -> str:
    try:
        image = Image.open(io.BytesIO(file_bytes))
        if image.mode not in ["RGB", "L"]:
            image = image.convert("RGB")
        image = image.convert("L")
        text  = pytesseract.image_to_string(image, config="--psm 3")
        return text.strip()
    except Exception as e:
        print(f"Image OCR error: {e}")
        return ""

# ── TXT extractor ─────────────────────────────────────────────────────
def extract_from_txt(file_bytes: bytes) -> str:
    encodings = ["utf-8", "utf-16", "latin-1", "ascii"]
    for encoding in encodings:
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return file_bytes.decode("utf-8", errors="ignore")



# ── Main processing pipeline ──────────────────────────────────────────
def process_document(
    doc_id:     str,
    user_id:    str,
    subject_id: str,
    file_bytes: bytes,
    file_type:  str,
    doc_title:  str
):
    print(f" Processing: {doc_title}")
    try:
        # Step 1 — extract text
        text = extract_text(file_bytes, file_type)
        if not text.strip():
            print(f"⚠️ No text extracted from {doc_title}")
            supabase.table("documents") \
                    .update({"is_processed": True}) \
                    .eq("id", doc_id).execute()
            return
        print(f"Text extracted — {len(text.split())} words")

        # Step 2 — chunk text
        chunks = chunk_text(text)
        if not chunks:
            print(f"No chunks generated from {doc_title}")
            supabase.table("documents") \
                    .update({"is_processed": True}) \
                    .eq("id", doc_id).execute()
            return
        print(f"Text chunked — {len(chunks)} chunks")

        # Step 3 — generate embeddings
        embeddings = get_embeddings_batch(chunks)
        print(f" Embeddings generated — {len(embeddings)} vectors")

        # Step 4 — build Pinecone vectors
        namespace = get_user_namespace(user_id)
        vectors   = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            vectors.append({
                "id":     f"{doc_id}_chunk_{i}",
                "values": embedding,
                "metadata": {
                    "text":        chunk,
                    "doc_id":      doc_id,
                    "doc_title":   doc_title,
                    "user_id":     user_id,
                    "subject_id":  subject_id or "",
                    "chunk_index": i
                }
            })

        # Step 5 — upsert to Pinecone in batches
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            index.upsert(vectors=batch, namespace=namespace)
            print(f" Upserted batch {i // batch_size + 1}")

        # Step 6 — mark as processed
        supabase.table("documents") \
                .update({"is_processed": True}) \
                .eq("id", doc_id).execute()

        print(f" Done: {doc_title} — {len(vectors)} vectors stored")

    except Exception as e:
        print(f" Processing failed for {doc_title}: {e}")
        try:
            supabase.table("documents") \
                    .update({"is_processed": True}) \
                    .eq("id", doc_id).execute()
        except:
            pass




#TODO: Add logger 