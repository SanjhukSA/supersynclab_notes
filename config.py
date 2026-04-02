from dotenv import load_dotenv
import os
from  supabase import create_client,Client
from pinecone import Pinecone
import logging

logging.basicConfig( 
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

logger = logging.getLogger("Super-Notes")

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
PINECONE_INDEX = os.getenv("PINECONE_INDEX")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

try:
    supabase: Client = create_client(SUPABASE_URL,SUPABASE_KEY)
except Exception as e:
    raise ConnectionError(f"Failed to connect to Supabase: {e}")


try:
    pinecone = Pinecone(api_key=PINECONE_API_KEY)
    index    = pinecone.Index(PINECONE_INDEX)
except Exception as e:
    raise ConnectionError(f"Failed to connect to Pinecone:{e}")



#FOR PINECONE   
def get_user_namespace(user_id : str) ->str:
    return f"User_{user_id}"


logger.info("Supabase connected")
logger.info("Pinecone connected")
logger.info(f"Using Pinecone index: {PINECONE_INDEX}")