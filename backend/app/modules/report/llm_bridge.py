import inspect
import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
import httpx

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
RUNTIME_CFG_FILE = DATA_DIR / "report_llm_config.json"


def get_runtime_llm_config() -> Dict[str, Any]:
    try:
        import app.core.config as core_cfg  # type: ignore

        fn = getattr(core_cfg, "get_runtime_llm_config", None)
        if callable(fn):
            res = fn()
            if isinstance(res, dict):
                return res
    except Exception:
        pass

    if RUNTIME_CFG_FILE.exists():
        try:
            raw = RUNTIME_CFG_FILE.read_text(encoding="utf-8").strip()
            if raw:
                return json.loads(raw)
        except Exception:
            pass
    return {"provider": "auto"}


def save_runtime_llm_config(cfg: Dict[str, Any]) -> None:
    try:
        import app.core.config as core_cfg  # type: ignore

        fn = getattr(core_cfg, "save_runtime_llm_config", None)
        if callable(fn):
            fn(cfg)
    except Exception:
        pass

    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        current = get_runtime_llm_config()
        merged = {**current, **{k: v for k, v in cfg.items() if v is not None}}
        RUNTIME_CFG_FILE.write_text(
            json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        pass


def _resolve_provider() -> Optional[Dict[str, str]]:
    rt = get_runtime_llm_config()
    rt_key = (rt.get("apiKey") or "").strip()
    if rt_key:
        prov = (rt.get("provider") or "auto").lower()
        if prov == "gemini" or (prov == "auto" and rt_key.startswith("AIza")):
            return {
                "provider": "gemini",
                "api_key": rt_key,
                "base_url": "https://generativelanguage.googleapis.com",
                "model": rt.get("model") or "gemini-2.0-flash",
            }
        if prov == "groq" or (prov == "auto" and rt_key.startswith("gsk_")):
            return {
                "provider": "groq",
                "api_key": rt_key,
                "base_url": rt.get("baseUrl") or "https://api.groq.com/openai/v1",
                "model": rt.get("model") or "llama-3.3-70b-versatile",
            }
        return {
            "provider": prov if prov != "auto" else "openai",
            "api_key": rt_key,
            "base_url": rt.get("baseUrl") or "https://api.openai.com/v1",
            "model": rt.get("model") or "gpt-4o-mini",
        }

    if os.getenv("GEMINI_API_KEY"):
        return {
            "provider": "gemini",
            "api_key": os.environ["GEMINI_API_KEY"].strip(),
            "base_url": "https://generativelanguage.googleapis.com",
            "model": os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
        }
    if os.getenv("GROQ_API_KEY"):
        return {
            "provider": "groq",
            "api_key": os.environ["GROQ_API_KEY"].strip(),
            "base_url": "https://api.groq.com/openai/v1",
            "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        }
    if os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY"):
        key = (os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY") or "").strip()
        return {
            "provider": "openai",
            "api_key": key,
            "base_url": os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
            "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
        }
    return None


def get_llm_status() -> Dict[str, Any]:
    try:
        import app.core.llm as core_llm  # type: ignore

        fn = getattr(core_llm, "get_llm_status", None)
        if callable(fn):
            res = fn()
            if isinstance(res, dict):
                return res
    except Exception:
        pass

    cfg = _resolve_provider()
    if not cfg:
        return {
            "active": False,
            "provider": "محرك التقييم الديناميكي الذكي المدمج (أضف مفتاح Gemini/Groq لتفعيل LLM خارجي)",
            "model": "dynamic-rubric-engine",
        }
    return {"active": True, "provider": cfg["provider"], "model": cfg["model"]}


def _extract_json_dict(raw: str) -> Optional[Dict[str, Any]]:
    if not raw or "{" not in raw:
        return None
    s = raw.find("{")
    e = raw.rfind("}")
    if s == -1 or e == -1 or e <= s:
        return None
    try:
        obj = json.loads(raw[s : e + 1])
        return obj if isinstance(obj, dict) else None
    except Exception:
        return None


async def call_llm_json(prompt: str, temperature: float = 0.3) -> Optional[Dict[str, Any]]:
    """
    1) يحاول أولاً استخدام app.core.llm المشترك مع باقي الفريق أياً كان اسم الدالة فيه.
    2) إن كان app.core.llm فارغاً أو غير مهيأ بعد، يستخدم العميل المدمج مباشرة بأمان.
    """
    try:
        import app.core.llm as core_llm  # type: ignore

        for fn_name in ("generate_json", "call_llm_json", "ask_json", "ask_llm", "call_llm", "chat", "generate"):
            fn = getattr(core_llm, fn_name, None)
            if callable(fn):
                res = fn(prompt) if fn_name not in ("generate_json", "call_llm_json") else fn(prompt, temperature=temperature)
                if inspect.isawaitable(res):
                    res = await res
                if isinstance(res, dict):
                    return res
                if isinstance(res, str):
                    parsed = _extract_json_dict(res)
                    if parsed:
                        return parsed
    except Exception:
        pass

    cfg = _resolve_provider()
    if not cfg:
        return None

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            if cfg["provider"] == "gemini":
                url = f"{cfg['base_url']}/v1beta/models/{cfg['model']}:generateContent?key={cfg['api_key']}"
                r = await client.post(
                    url,
                    json={
                        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                        "generationConfig": {
                            "temperature": temperature,
                            "responseMimeType": "application/json",
                        },
                    },
                )
                if r.status_code != 200:
                    return None
                text = (
                    r.json()
                    .get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )
                return _extract_json_dict(text)

            url = f"{cfg['base_url'].rstrip('/')}/chat/completions"
            r = await client.post(
                url,
                headers={"Authorization": f"Bearer {cfg['api_key']}"},
                json={
                    "model": cfg["model"],
                    "temperature": temperature,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {
                            "role": "system",
                            "content": "أنت خبير تقييم مقابلات عمل باللغة العربية. التزم بإرجاع JSON صالح فقط.",
                        },
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            if r.status_code != 200:
                return None
            content = r.json().get("choices", [{}])[0].get("message", {}).get("content", "")
            return _extract_json_dict(content)
    except Exception:
        return None
