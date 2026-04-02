from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, field_validator
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import supabase,logger
import string

security = HTTPBearer()
router = APIRouter()

# Request models 
class AuthRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    def password_strength(cls,v):
        special_chars = set(string.punctuation)
        if len(v) < 8:
            raise ValueError("Password must be atleast 8 characters") 
        if not any(c.isupper() for c in v ):
            raise ValueError("Password must contain atleast one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain atleast one number")
        if not any(c in special_chars for c in v):
            raise ValueError("Password must contain atleast one special character")
        return v
        

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class UpdatePasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    def password_strength(cls,v):
        special_chars = set(string.punctuation)
        if len(v) < 8:
            raise ValueError("Password must be atleast 8 characters") 
        if not any(c.isupper() for c in v ):
            raise ValueError("Password must contain atleast one uppercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain atleast one number")
        if not any(c in special_chars for c in v):
            raise ValueError("Password must contain atleast one special character")
        return v
    

# Register 
@router.post("/register")
def register(req: AuthRequest):
    try:
        
        logger.info(f"Registration attempt :{req.email}")

        response = supabase.auth.sign_up({
            "email": req.email,
            "password": req.password,
        })

        if response.user is None:
            logger.warning(f"Registration failed:{req.email}")
            return {
                "success": False,
                "message": "Registration failed.",
            }
        logger.info(f"Registration Successfull:{req.email}")
        return {
            "success": True,
            "message": "Registration successful. Please check your email for confirmation.",
            "user_id": str(response.user.id),
            "email":   response.user.email
        }

    except Exception as e:
        logger.error(f"Unable to register:{str(e)}")
        return {
            "success": False,
            "message": f"Registration error: {str(e)}"
        }

#  Login 
@router.post("/login")
def login(req: AuthRequest):
    try:
        logger.info(f"Login Attempt :{req.email}")

        response = supabase.auth.sign_in_with_password({
            "email":    req.email,
            "password": req.password
        })
        logger.info(f"Login Successfull")
        return {
            "success":      True,
            "access_token": response.session.access_token,
            "token_type":   "bearer",
            "user_id":      str(response.user.id),
            "email":        response.user.email
        }

    except Exception as e:
        logger.warning(f"Login Failed :{str(e)}")
        return {
            "success": False,
            "message": "Invalid email or password."
        }

# Get current user 
@router.get("/me")
def get_current_user(credentials : HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        user  = supabase.auth.get_user(token)
        
        logger.info(f"Token Verified:{user.user.email}")
        return {
            "success": True,
            "user_id": str(user.user.id),
            "email":   user.user.email
        }

    except Exception as e:
        logger.warning(f"Invalid :{str(e)}")
        return {
            "success": False,
            "message": "Invalid token."
        }

# Forgot password 
@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    try:

        logger.info(f"Password reset requested: {req.email}")
        supabase.auth.reset_password_for_email(req.email)

        return {
            "success": True,
            "message": "A password reset link has been sent to that email."
        }

    except Exception as e:
        logger.error(f"Password reset failed: {req.email} | {str(e)}")
        return {
            "success": False,
            "message": f"Failed: {str(e)}"
        }

# Update password 
@router.post("/update-password")
def update_password(req: UpdatePasswordRequest, credentials : HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials

        user = supabase.auth.get_user(token)
        if not user.user:
            logger.warning("Update password failed ")
            return {"success": False, "message": "Invalid token."}

        # Update password via admin
        supabase.auth.admin.update_user_by_id(
            str(user.user.id),
            {"password": req.new_password}
        )
        logger.info(f"Password updated: {user.user.email}")
        return {
            "success": True,
            "message": "Password successfully updated."
        }

    except Exception as e:
        logger.error(f"Password update failed: {str(e)}")
        return {
            "success": False,
            "message": f"Failed to update password: {str(e)}"
        }
    
