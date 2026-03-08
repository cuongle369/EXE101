from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import ai, groups, tasks

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="AI Task Manager API",
    description="API Backend cho AI Task Manager – Phân công việc thông minh bằng AI",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS – cho phép frontend gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(groups.router)
app.include_router(tasks.router)
app.include_router(ai.router)


@app.get("/")
def root():
    return {
        "message": "AI Task Manager API",
        "docs": "/docs",
        "version": "1.0.0",
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}
