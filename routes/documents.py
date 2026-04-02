from fastapi import APIRouter , Depends,UploadFile,File,Form,BackgroundTasks
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from config import supabase,logger
import uuid
from services.processor import process_document



router = APIRouter()
security = HTTPBearer()


def get_user_id( credentials : HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    user = supabase.auth.get_user(token)
    return str(user.user.id)

# File Type Detector [pdf,png,jpg,webp]
def detect_file_type(filename: str, content_type:str) -> str:
    ext = filename.split(".")[-1].lower()
    if ext =="pdf" or content_type == "application/pdf":
        return "PDF"
    elif ext in ["png", "jpg", "jpeg", "webp"] or content_type.startswith("image/"):
        return "IMG"
    elif ext == "txt" or content_type == "text/plain":
        return "TXT"
    elif ext == "docx" or content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "DOCX"
    else:
        return None


#Uploading the Notes
@router.post("/upload")
async def upload_notes(
    background_task : BackgroundTasks,
    file:  UploadFile = File(...),
    subject_id: str  = Form(None),
    credentials: HTTPAuthorizationCredentials = Depends(security) 
):
    try:

        logger.info(f"Upload Attempt file: {file.filename} ,user :{user_id} ")
        user_id = get_user_id(credentials)
        file_type = detect_file_type(file.filename , file.content_type)

        if not file_type:
            logger.warning(f"Unsupported file type file:{file.filename}")
            return{
                "success" : False,
                "message" : "Unsuported file type"
            } 
        
        # File size Validation rejects unsuppoprted file immediately before reading the bytes
        file_bytes = await file.read()
        size_limits ={
            "PDF" : 25*1024*1024,
            "IMG" : 10*1024*1024,
            "TXT" : 5*1024*1024,
            "DOCX" : 25*1024*1024,
        }
        if len(file_bytes) > size_limits[file_type]:
            limit_mb = size_limits[file_type]
            logger.warning(f"File size is too large: size{len(file_bytes)}")
            return{
                "success" : False,
                "message" : "File too large. Max size for {file_type} is {limit_mb}MB"
            }
        
        # Generate Unique file path
        file_extension  = file.filename.split(".")[-1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path       = f"{user_id}/{unique_filename}"

       # Upload  to Supabase and save metadata
        supabase.storage.from_("documents") \
                .upload(file_path, file_bytes, {"content-type": file.content_type})
        doc_result = supabase.table("documents").insert({
            "user_id":      user_id,
            "subject_id":   subject_id,
            "title":        file.filename,
            "file_type":    file_type,
            "file_path":    file_path,
            "is_processed": False
        }).execute()

        doc_id = doc_result.data[0]["id"]
        logger.info(f"File saved to storage | user: {user_id} | doc_id: {doc_id} | path: {file_path}")

       # AI working in Background
        background_task.add_task(
            process_document,
            doc_id, user_id, subject_id or "",
            file_bytes, file_type, file.filename
        )

        logger.info(f"Processing queued | doc_id: {doc_id} | file: {file.filename}")
        return {
            "success":      True,
            "message":      "File uploaded successfully. Processing started.",
            "doc_id":       doc_id,
            "title":        file.filename,
            "file_type":    file_type,
            "is_processed": False
        }

    except Exception as e:
        logger.error(f"Upload failed | user: {user_id} | file: {file.filename} | {str(e)}")
        return {"success": False, "message": f"Upload failed: {str(e)}"}

#Get all documents
@router.get("/")
def get_notes(credentials : HTTPAuthorizationCredentials =Depends(security)):
    try:
        user_id = get_user_id(credentials)
        logger.info(f"fetching all notes")
        response = supabase.table("documents").select("*").eq("user_id",user_id)\
                           .order("upload_date", desc=True).execute()
        
        return {
            "success":   True,
            "documents": response.data,
            "count":     len(response.data)
        }
    except Exception as e:
        return {"success": False, "message": f"Failed to fetch documents: {str(e)}"}
    

#Get Notes By Shelf
@router.get("/shelf/{shelf_id}")
def get_notes_by_shelf(
    shelf_id : str,
    credentials : HTTPAuthorizationCredentials = Depends(security)
):
    try :
        user_id = get_user_id(credentials)

        response = supabase.table("documents").select("*").eq("user_id", user_id)\
                           .eq("subject_id" , shelf_id).order("upload_date", desc = True).execute()\
                           
        return {
            "success" :True,
            "documents" : response.data,
            "count"   : len(response.data)
        }
    except Exception as e:
        return{ "success" :False,
               "messege" :f"Failed to fetch documents : {str(e)}"
             }


# Processing Status
@router.get("/{doc_id}/status")
def get_notes_status(
    doc_id:      str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user_id = get_user_id(credentials)
        response  = supabase.table("documents") \
                          .select("id, title, is_processed") \
                          .eq("id", doc_id) \
                          .eq("user_id", user_id) \
                          .execute()

        if not response.data:
            return {"success": False, "message": "Document not found."}

        doc = response.data[0]
        return {
            "success":      True,
            "doc_id":       doc["id"],
            "title":        doc["title"],
            "is_processed": doc["is_processed"]
        }
    except Exception as e:
        return {"success": False, "message": f"Failed to get status: {str(e)}"}


#Delete Notes
@router.delete("/{doc_id}")
def delete_notes(
    doc_id:      str,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user_id  = get_user_id(credentials)
        existing = supabase.table("documents") \
                           .select("id, file_path") \
                           .eq("id", doc_id) \
                           .eq("user_id", user_id) \
                           .execute()

        if not existing.data:
            return {"success": False, "message": "Document not found or no permission."}

        file_path = existing.data[0]["file_path"]

        supabase.storage.from_("documents").remove([file_path])

        supabase.table("documents") \
                .delete() \
                .eq("id", doc_id) \
                .eq("user_id", user_id) \
                .execute()

        return {"success": True, "message": "Document deleted successfully."}

    except Exception as e:
        return {"success": False, "message": f"Failed to delete document: {str(e)}"}


#Assign Shelf id To notes
@router.patch("/{doc_id}/assign")
def assign_to_shelf(
    doc_id:      str,
    shelf_id:    str = Form(...),
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        user_id  = get_user_id(credentials)
        existing = supabase.table("documents") \
                           .select("id") \
                           .eq("id", doc_id) \
                           .eq("user_id", user_id) \
                           .execute()

        if not existing.data:
            return {"success": False, "message": "Document not found or no permission."}

        shelf = supabase.table("subject_shelves") \
                        .select("id") \
                        .eq("id", shelf_id) \
                        .eq("user_id", user_id) \
                        .execute()
        
        if not shelf.data:
            return {"success": False, "message": "Shelf not found or no permission."}

        result = supabase.table("documents") \
                         .update({"subject_id": shelf_id}) \
                         .eq("id", doc_id) \
                         .eq("user_id", user_id) \
                         .execute()

        return {
            "success":  True,
            "message":  "Document assigned to shelf.",
            "document": result.data[0]
        }

    except Exception as e:
        return {"success": False, "message": f"Failed to assign document: {str(e)}"}

    
#TODO: Add logger 


       


        
        
        