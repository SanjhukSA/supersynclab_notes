from fastapi.security import HTTPAuthorizationCredentials,HTTPBearer
from fastapi import APIRouter, Depends,UploadFile,File,Form
from pydantic import BaseModel, field_validator
from groq import Groq
from config import supabase , index ,get_user_namespace,GROQ_API_KEY,logger


router = APIRouter()
security = HTTPBearer()
groq_client = Groq(api_key= GROQ_API_KEY)

def get_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    token = credentials.credentials
    user  = supabase.auth.get_user(token)
    return str(user.user.id)

class AskRequest(BaseModel):
    question:         str
    subject_id:       str  = None
    top_k:            int  = 5
    use_general:      bool = True

    @field_validator("question")
    def question_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Question cannot be empty")
        if len(v.strip()) < 7:   #Short queries give poor embeddings
            raise ValueError("Please provide more detail")
        if len(v.strip()) > 1000:
            raise ValueError("Question too long")
        return v.strip()
    
def retrieve_context(user_id:str, question:str , subject_id :str , top_k :int):
    from services.embeddings import get_embedding

    namespace = get_user_namespace(user_id)
    query_vector = get_embedding(question)

    query_params ={
        "vector" : query_vector,
        "top_k" : top_k,
        "include_metadata" : True,
        "namespace" : namespace,
    }

    if subject_id:
        query_params["filter"] = {"subject_id" : {"eq" : subject_id}}

    response = index.query(**query_params)

    if not response.matches:
        return [], False
     
    SIMILARITY_THRESHOLD = 0.35  #for all_minilm_l6_v2 ----- change according to testing.
    relevant = [ m for m in response.matches if m.score >= SIMILARITY_THRESHOLD] 

    if not relevant and response.macthes:
        relevant = response.matches[:2]
    
    context_chunks = []

    for match in relevant:
        context_chunks.append({
            "text":      match.metadata.get("text", ""),
            "doc_title": match.metadata.get("doc_title", "Unknown"),
            "doc_id":    match.metadata.get("doc_id", ""),
            "score":     round(match.score, 4)
        })
    return context_chunks, True




def build_prompt(question: str, context_chunks: list, has_context: bool, use_general: bool) -> str:

    if has_context:
        context_text = "\n\n".join([
            f"[From: {chunk['doc_title']}]\n{chunk['text']}"
            for chunk in context_chunks
        ])

        return f"""You are a helpful academic assistant for a student. 
Your job is to answer the student's question using their personal notes.

INSTRUCTIONS:
- Answer primarily from the provided notes
- If the notes partially cover the topic, use them and supplement with your knowledge
- Always mention which document the information came from
- Be clear, concise, and academic in tone
- If something is not in the notes, say so explicitly before adding general knowledge

STUDENT'S NOTES (retrieved relevant sections):
{context_text}

STUDENT'S QUESTION:
{question}

ANSWER:"""

    elif use_general:
        return f"""You are a helpful academic assistant for a student.
The student asked a question but their personal notes don't contain relevant information on this topic.

INSTRUCTIONS:
- Answer using your general academic knowledge
- Be clear and helpful
- Start your answer by saying: "This topic wasn't found in your notes, but here's what I know:"
- Keep the answer academic and accurate

STUDENT'S QUESTION:
{question}

ANSWER:"""

    else:
        return None
    

    # Step 1 — retrieve relevant notes
    # Step 2 — build prompt
    # Step 3 — handle case where no context and general not allowed
    # Step 4 — call Groq
    # Step 5 — build sources list
    #TODO: split the ask funtion into smaller ones

@router.post("/")
def ask(
    req:         AskRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user_id = get_user_id(credentials)

        
        context_chunks, has_context = retrieve_context(
            user_id, req.question, req.subject_id, req.top_k
        )

       
        prompt = build_prompt(req.question, context_chunks, has_context, req.use_general)

        
        if prompt is None:
            return {
                "success":     True,
                "answer":      "I couldn't find anything related to this topic in your notes. Try uploading more study materials or enable general knowledge mode.",
                "sources":     [],
                "from_notes":  False,
                "from_general": False
            }


        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role":    "system",
                    "content": "You are a helpful, accurate academic assistant. Always be honest about what comes from the student's notes vs your general knowledge."
                },
                {
                    "role":    "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=1000,
        )

        answer = response.choices[0].message.content

        sources = list({
            chunk["doc_title"]: chunk
            for chunk in context_chunks
        }.values()) if has_context else []

        return {
            "success":      True,
            "question":     req.question,
            "answer":       answer,
            "sources":      sources,
            "from_notes":   has_context,
            "from_general": not has_context and req.use_general,
            "chunks_used":  len(context_chunks)
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Failed to get answer: {str(e)}"
        }

#ask from Uploaded Question Paper
@router.post("/document")
async def ask_from_document(
    file:        UploadFile = File(...),
    subject_id:  str        = Form(None),
    use_general: bool       = Form(True),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user_id = get_user_id(credentials)

        ext = file.filename.split(".")[-1].lower()
        if ext not in ["pdf", "txt", "docx"]:
            return {
                "success": False,
                "message": "Only PDF, TXT question papers are supported." 
            }

        file_bytes = await file.read()

        max_sizeQuestion_paper = 25 *1024*1024
        if len(file_bytes) > max_sizeQuestion_paper:
            return {
                "success": False,
                "message": "Question paper too large. Max 25MB"
            }

        from services.processor import extract_text
        questions_text = extract_text(file_bytes, ext.upper())

        if not questions_text.strip():
            return {
                "success": False,
                "message": "Could not extract text from the uploaded file."
            }

        context_chunks, has_context = retrieve_context(
            user_id, questions_text[:500], subject_id, top_k=8
        )

        prompt = f"""You are a helpful academic assistant.
A student has uploaded a question paper. Answer each question using their personal notes.

INSTRUCTIONS:
- Answer each question clearly and separately
- Number your answers to match the questions
- Use the provided notes as your primary source
- If a question is not covered in the notes say so and provide a general answer
- Be concise but complete

STUDENT'S NOTES:
{chr(10).join([f"[From: {c['doc_title']}]: {c['text']}" for c in context_chunks]) if has_context else "No relevant notes found."}

QUESTION PAPER:
{questions_text[:3000]}

ANSWERS:"""

        response = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role":    "system",
                    "content": "You are an academic assistant helping a student answer exam questions from their study notes."
                },
                {
                    "role":    "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        return {
            "success":    True,
            "filename":   file.filename,
            "answers":    response.choices[0].message.content,
            "sources":    list({c["doc_title"] for c in context_chunks}),
            "from_notes": has_context
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"An Unknown Error Has occured: {str(e)}"
        }



# TODO: cache embeddings for repeated questions
# TODO: add rate limiting per user
# TODO: track which sources are most used
# TODO: add DOCX Support 
#TODO: Add logger 