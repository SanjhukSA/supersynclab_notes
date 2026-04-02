from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from routes import auth, shelves ,documents,search,ask


security = HTTPBearer()

app = FastAPI(
    title = "Super-Notes",
    description = "Ai-Powered Personal Notes Management System",
    version ="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins =[
        "http://localhost:",
    ],
    allow_credentials = True,
    allow_methods =["*"],
    allow_headers = ["*"],
)

app.include_router(auth.router , prefix="/auth", tags =["Auth"])
app.include_router(shelves.router, prefix="/shelves", tags=["Shelves"])
app.include_router(documents.router, prefix="/documents", tags =["Documents"])
app.include_router(search.router, prefix="/search", tags =["Search"])
app.include_router(ask.router, prefix="/ask", tags=["Ask"])


@app.get("/", tags=["Health"])
def root():
    return{
        "status"  :"running",
        "app"     : "SuperNotes",
        "version" : "1.0.0",
        "docs"    :"/docs"
    } 