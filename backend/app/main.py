import importlib
from contextlib import asynccontextmanager
from typing import List, Tuple
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import CORS_ORIGINS
from app.core.db import init_db, refresh_demo_seed
from app.core.llm import get_llm_status


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    refresh_demo_seed()
    yield


app = FastAPI(
    title="منصة جاهز (تمكين AI) — AI Interview & CV Platform API",
    version="1.0.0",
    description="الواجهة الخلفية الموحدة لجميع أعضاء الفريق (1 إلى 7)",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# خريطة جميع موديولات الفريق الـ 8:
# يربط تلقائياً كل موديول يحتوي على router جاهز، ويتجاهل بأمان أي ملف router.py لا يزال قيد الإنشاء (0 bytes)!
TEAM_MODULES: List[Tuple[str, List[str], str]] = [
    ("app.modules.auth.router", ["/api/auth"], "Member 1 - Auth & Dashboard"),
    ("app.modules.jobs.router", ["/api/jobs"], "Member 2 - Jobs"),
    ("app.modules.research.router", ["/api/research"], "Member 2 - Company Research"),
    ("app.modules.interview.router", ["/api/interview"], "Member 3 - Interview Engine"),
    ("app.modules.room.router", ["/api/room"], "Member 4 - Avatar & Room"),
    ("app.modules.behavior.router", ["/api/behavior"], "Member 5 - Behavior Analytics"),
    ("app.modules.report.router", ["/api/report", "/api/reports"], "Member 6 - Report & Study"),
    ("app.modules.cv.router", ["/api/cv"], "Member 7 - CV Studio"),
]

MOUNTED_MODULES: List[str] = []

for mod_path, prefixes, label in TEAM_MODULES:
    try:
        mod = importlib.import_module(mod_path)
        mod_router = getattr(mod, "router", None)
        if mod_router is not None:
            for pfx in prefixes:
                app.include_router(mod_router, prefix=pfx)
            MOUNTED_MODULES.append(label)
    except Exception:
        # إذا كان الموديول فارغاً أو قيد التطوير لدى عضو آخر، لا يوقف السيرفر الرئيسي
        pass


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "tamkeen-ai-backend",
        "mountedModules": MOUNTED_MODULES,
        "llm": get_llm_status(),
    }
