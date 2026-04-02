from fastapi import APIRouter, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator
from config import supabase, index, get_user_namespace,logger

router   = APIRouter()
security = HTTPBearer()

def get_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    token = credentials.credentials
    user  = supabase.auth.get_user(token)
    return str(user.user.id)

#  Request model
class SearchRequest(BaseModel):
    query:      str
    subject_id: str = None
    top_k:      int = 5

    @field_validator("query")
    def query_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Search query cannot be empty")
        if len(v.strip()) < 3:
            raise ValueError("Search query must be at least 3 characters")
        if len(v.strip()) > 500:
            raise ValueError("Search query too long")
        return v.strip()

    @field_validator("top_k")
    def top_k_valid(cls, v):
        if v < 1:
            raise ValueError("top_k must be at least 1")
        if v > 20:
            raise ValueError("top_k cannot exceed 20")
        return v

#  POST search 
@router.post("/")
def search(
    req:         SearchRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user_id   = get_user_id(credentials)
        namespace = get_user_namespace(user_id)

        # Step 1 — embed the query
        from services.embeddings import get_embedding
        query_vector = get_embedding(req.query)

        # Step 2 — build filter
        filter_dict = {}
        if req.subject_id:
            filter_dict = {"subject_id": {"$eq": req.subject_id}}

        # Step 3 — query Pinecone
        query_params = {
            "vector":           query_vector,
            "top_k":            req.top_k,
            "include_metadata": True,
            "namespace":        namespace,
        }
        if filter_dict:
            query_params["filter"] = filter_dict

        response = index.query(**query_params)

        # Step 4 — handle no results
        if not response.matches:
            return {
                "success": True,
                "results": [],
                "count":   0,
                "message": "No results found. Try different keywords or upload more documents."
            }

        # Step 5 — format results
        formatted = []
        for match in response.matches:
            formatted.append({
                "score":      round(match.score, 4),
                "text":       match.metadata.get("text", ""),
                "doc_title":  match.metadata.get("doc_title", "Unknown"),
                "doc_id":     match.metadata.get("doc_id", ""),
                "subject_id": match.metadata.get("subject_id", ""),
                "chunk_id":   match.id,
            })

        # Step 6 — sort by score
        formatted.sort(key=lambda x: x["score"], reverse=True)

        return {
            "success": True,
            "query":   req.query,
            "results": formatted,
            "count":   len(formatted)
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"Search failed: {str(e)}"
        }
    


#TODO: Add logger 