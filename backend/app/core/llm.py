import json
import os
from typing import Any, Dict, List, Optional, Union
import httpx
from app.core.config import get_runtime_llm_config

DEFAULT_SYSTEM_PROMPT = (
    "أنت مساعد ذكاء اصطناعي خبير في التوظيف والمقابلات التقنية والسلوكية في منصة جاهز (تمكين AI). "
    "أجب بدقة واحترافية باللغة العربية السليمة والواضحة."
)


def resolve_llm_provider() -> Optional[Dict[str, str]]:
    """تحديد مزود الـ LLM النشط من الإعدادات اللحظية أو متغيرات البيئة (.env)."""
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
        if prov == "openrouter" or (prov == "auto" and rt_key.startswith("sk-or-")):
            return {
                "provider": "openrouter",
                "api_key": rt_key,
                "base_url": rt.get("baseUrl") or "https://openrouter.ai/api/v1",
                "model": rt.get("model") or "openai/gpt-4o-mini",
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
    if os.getenv("OPENROUTER_API_KEY"):
        return {
            "provider": "openrouter",
            "api_key": os.environ["OPENROUTER_API_KEY"].strip(),
            "base_url": "https://openrouter.ai/api/v1",
            "model": os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini"),
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
    cfg = resolve_llm_provider()
    if not cfg:
        return {
            "active": False,
            "provider": "المحرك الذكي المحلي (أضف GEMINI_API_KEY أو GROQ_API_KEY في .env لتفعيل السحابة)",
            "model": "local-fallback",
        }
    return {"active": True, "provider": cfg["provider"], "model": cfg["model"]}


def _extract_json(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    s_obj, e_obj = text.find("{"), text.rfind("}")
    if s_obj != -1 and e_obj != -1 and e_obj > s_obj:
        try:
            parsed = json.loads(text[s_obj : e_obj + 1])
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return None


async def generate_text(
    prompt: str,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    temperature: float = 0.5,
    json_mode: bool = False,
) -> Optional[str]:
    """
    العميل المشترك لجميع أعضاء الفريق (عضو 2، 3، 6، 7) لتوليد النصوص أو الـ JSON عبر أي مزود LLM.
    """
    cfg = resolve_llm_provider()
    if not cfg:
        return None

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            if cfg["provider"] == "gemini":
                url = f"{cfg['base_url']}/v1beta/models/{cfg['model']}:generateContent?key={cfg['api_key']}"
                gen_cfg: Dict[str, Any] = {"temperature": temperature}
                if json_mode:
                    gen_cfg["responseMimeType"] = "application/json"
                full_prompt = f"{system_prompt}\n\n{prompt}" if system_prompt else prompt
                resp = await client.post(
                    url,
                    json={
                        "contents": [{"role": "user", "parts": [{"text": full_prompt}]}],
                        "generationConfig": gen_cfg,
                    },
                )
                if resp.status_code != 200:
                    return None
                return (
                    resp.json()
                    .get("candidates", [{}])[0]
                    .get("content", {})
                    .get("parts", [{}])[0]
                    .get("text", "")
                )

            url = f"{cfg['base_url'].rstrip('/')}/chat/completions"
            payload: Dict[str, Any] = {
                "model": cfg["model"],
                "temperature": temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {cfg['api_key']}"},
                json=payload,
            )
            if resp.status_code != 200:
                return None
            return resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception:
        return None


async def generate_json(
    prompt: str,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    temperature: float = 0.3,
) -> Optional[Dict[str, Any]]:
    """استدعاء موحد يرجع قاموس JSON جاهزاً لباقي الموديولات."""
    raw = await generate_text(
        prompt=prompt,
        system_prompt=f"{system_prompt} أرجع النتيجة بصيغة JSON صالح فقط.",
        temperature=temperature,
        json_mode=True,
    )
    return _extract_json(raw or "")


async def chat(
    messages: List[Dict[str, str]],
    temperature: float = 0.5,
) -> Optional[str]:
    """دعم المحادثات المتسلسلة (مفيد لمحرك المقابلة لدى عضو 3)."""
    if not messages:
        return None
    sys_msgs = [m["content"] for m in messages if m.get("role") == "system"]
    convo = "\n".join(
        f"{m.get('role', 'user').upper()}: {m.get('content', '')}"
        for m in messages
        if m.get("role") != "system"
    )
    return await generate_text(
        prompt=convo,
        system_prompt="\n".join(sys_msgs) if sys_msgs else DEFAULT_SYSTEM_PROMPT,
        temperature=temperature,
    )


# أسماء مختصرة للتوافق مع جميع أعضاء الفريق
call_llm_json = generate_json
ask_json = generate_json
ask_llm = generate_text
call_llm = generate_text
generate = generate_text
