"""FlamSanct API — FastAPI entry point."""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client

from api.routers import auth, admin, daily_logs, workouts, stoic


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize Supabase client on startup."""
    app.state.supabase = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    yield


app = FastAPI(
    title="FlamSanct API",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_supabase() -> Client:
    """Retrieve the Supabase service-role client from app state."""
    return app.state.supabase


# Mount routers
app.include_router(auth.router, prefix="/v1")
app.include_router(admin.router, prefix="/v1")
app.include_router(daily_logs.router, prefix="/v1")
app.include_router(workouts.router, prefix="/v1")
app.include_router(stoic.router, prefix="/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
