import json
from typing import Any
from app.core.config import SHARED_MOCKS_DIR


def load_mock(name: str, default: Any = None) -> Any:
    """
    تحميل أي ملف Mock من فولدر shared/mocks بأمان تام
    (حتى لو كان الملف غير موجود أو حجمه 0 بايت لا يسبب أي خطأ).
    """
    filename = name if name.endswith(".json") else f"{name}.json"
    path = SHARED_MOCKS_DIR / filename
    if not path.exists():
        return default if default is not None else {}
    try:
        raw = path.read_text(encoding="utf-8").strip()
        if not raw:
            return default if default is not None else {}
        return json.loads(raw)
    except Exception:
        return default if default is not None else {}


def save_mock(name: str, data: Any) -> bool:
    """حفظ أو تحديث بيانات في فولدر shared/mocks عند الحاجة."""
    try:
        SHARED_MOCKS_DIR.mkdir(parents=True, exist_ok=True)
        filename = name if name.endswith(".json") else f"{name}.json"
        path = SHARED_MOCKS_DIR / filename
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return True
    except Exception:
        return False


get_mock = load_mock
read_mock = load_mock
