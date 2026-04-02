from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from config import supabase,logger
from fastapi.security import HTTPBearer , HTTPAuthorizationCredentials

router = APIRouter()
security = HTTPBearer()

#  Request Model
class ShelfRequest(BaseModel):
    subject_name: str

    @field_validator("subject_name")
    def sname_valid(cls,v):
        if not v.strip():
            raise ValueError("Subject name cannot be empty")
        if not len(v.strip())< 2:
            raise ValueError("Subject name must be atleast 2 character")
        if len(v.strip()) >25:
            raise ValueError("Subject Name is too long")
        return v.strip()

    
# User Id
def get_user_id(credentials : HTTPAuthorizationCredentials) ->str:
    token = credentials.credentials
    user = supabase.auth.get_user(token)
    return str(user.user.id)

# Getiing the User Created Shelves
@router.get("/")
def get_shelves(credentials : HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_id = get_user_id(credentials)

        logger.info(f"Fetching shelves | user: {user_id}")

        response = supabase.table("subject_shelves").select("*").eq("user_id",user_id)\
                           .order("created_at", desc = False).execute()
        
        logger.info(f"Shelves fetched | user: {user_id} | count: {len(response.data)}")
        return {
            "success" : True,
            "shelves" : response.data,
            "count"   : len(response.data)
        }
    
    except Exception as e:
        logger.error(f"Failed to fetch shelves | {str(e)}")
        return {
        "success" : False,
        "shelves" : f"Failed to load : {str(e)}"
        }


# Creating New Subject Shelves        
@router.post("/")
def create_shelf(req : ShelfRequest,credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_id = get_user_id(credentials)
        logger.info(f"Creating shelf | user: {user_id} | name: {req.subject_name}")

        existing = supabase.table("subject_shelves").select("id").eq("user_id", user_id)\
                           .eq("subject_name", req.subject_name).execute()
        
        if existing.data:
            logger.warning(f"Duplicate shelf name | user: {user_id} | name: {req.subject_name}")
            return{
                "success" : False,
                "message" : f"A shelf named '{req.subject_name}' already exists."
            }
        
        response = supabase.table("subject_shelves") \
                         .insert({
                             "user_id" : user_id,
                             "subject_name" : req.subject_name
                         })\
                         .execute()
        
        logger.info(f"Shelf created | user: {user_id} | name: {req.subject_name} | id: {response.data[0]['id']}")
        return {
            "success" : True,
            "message" : "Shelf created successfully",
            "shelf"   : response.data[0]
        }
        
    except Exception as e:
        logger.error(f"Failed to create shelf | user: {user_id} | {str(e)}")
        return {
            "success" : False,
            "message" : f"Failed to create shelf: {str(e)}"
        }


# Renaming the Subject Shelves
@router.put("/{shelf_id}")
def rename_shelf(shelf_id : str ,req: ShelfRequest , credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_id = get_user_id(credentials)
        logger.info(f"Renaming shelf | user: {user_id} | shelf: {shelf_id} | new name: {req.subject_name}")


        existing = supabase.table("subject_shelves").select("id").eq("id", shelf_id)\
                            .eq("user_id", user_id).execute()
        
        if not existing.data:
            logger.warning(f"Shelf not found {user_id}: {shelf_id}")
            return {
                "success" :False,
                "message" : "shelf not found "
            }
        
        response = supabase.table("subject_shelves").update({"subject_name" : req.subject_name})\
                         .eq("id" , shelf_id).eq("user_id", user_id).execute()
        
        logger.info(f"Shelf renamed | user: {user_id} | shelf: {shelf_id} | new name: {req.subject_name}")
        return {
            "success" :True,
            "message" : "Shelf renamed successfully",
            "shelf" : response.data
        }
    
    except Exception  as e:
        logger.error(f"Failed to rename Shelf{shelf_id}:{str(e)}")
        return {
            "success" : False,
            "message" : f"Failed to rename shelf:{str(e)}"
        }
    

# Deleting shelves
@router.delete("/{shelf_id}")
def delete_shelf(shelf_id :str , credentials : HTTPAuthorizationCredentials = Depends(security)):
    try:
        user_id = get_user_id(credentials)
        logger.info(f"Deleting shelf | user: {user_id} | shelf: {shelf_id}")

        existing = supabase.table("subject_shelves").select("id").eq("id", shelf_id)\
                           .eq("user_id", user_id).execute()
        
        if not existing.data:
            logger.warning(f"Shelf not found or no permission | user: {user_id} | shelf: {shelf_id}")
            return {
                "success" :False,
                "message" :"Shelf not found"
            }
        
        supabase.table("subject_shelves").delete().eq("id", shelf_id)\
                .eq("user_id", user_id).execute()
        
        logger.info(f"Shelf deleted | user: {user_id} | shelf: {shelf_id}")
        return {
            "success" : True,
            "message" : "Shelf deleted. Documents in this shelf have been unassigned but not deleted."
        }
    except Exception as e:
         logger.error(f"Failed to delete shelf | shelf: {shelf_id} | {str(e)}")
         return {
             "success" : False,
             "message" : f"Failed to delete shelf: {str(e)}"
         }



