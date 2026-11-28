import json
import os
from pathlib import Path
from typing import Any, Dict
from dotenv import load_dotenv

load_dotenv()

# جذر المشروع المشترك (tamkeen-AI)
BASE_DIR = Path(__file__).resolve().parents[3]
SHARED_MOCKS_DIR = BASE_DIR / "shared" / "mocks"
DATA_DIR = BASE_DIR / "backend" / "data"
DB_PATH = Path(os.getenv("DATABASE_PATH", str(DATA_DIR / "tamkeen.db")))
RUNTIME_LLM_CONFIG_PATH = DATA_DIR / "llm_config.json"

JWT_SECRET = os.getenv("JWT_SECRET", "tamkeen-jahez-secret-key-change-in-prod-2026")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "168"))
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "*").split(",")
    if o.strip()
]


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR


def get_runtime_llm_config() -> Dict[str, Any]:
    if RUNTIME_LLM_CONFIG_PATH.exists():
        try:
            raw = RUNTIME_LLM_CONFIG_PATH.read_text(encoding="utf-8").strip()
            if raw:
                data = json.loads(raw)
                if isinstance(data, dict):
                    return data
        except Exception:
            pass
    return {"provider": "auto"}


def save_runtime_llm_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    ensure_data_dir()
    current = get_runtime_llm_config()
    merged = {**current, **{k: v for k, v in cfg.items() if v is not None}}
    RUNTIME_LLM_CONFIG_PATH.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return merged
