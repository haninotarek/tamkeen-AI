import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from typing import Any, Dict, Optional
from fastapi import Header, HTTPException

from app.core.config import JWT_EXPIRE_HOURS, JWT_SECRET
from app.core.db import get_db, init_db


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("ascii"))


def create_access_token(user_id: str, email: str) -> str:
    """إنشاء JWT موقع بـ HMAC-SHA256 بدون الحاجة لمكتبات C خارجية معقدة."""
    header = {"alg": "HS256", "typ": "JWT"}
    exp = int((datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)).timestamp())
    payload = {
        "sub": user_id,
        "email": email,
        "exp": exp,
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    h_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_b64}.{p_b64}".encode("ascii")
    sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{h_b64}.{p_b64}.{_b64url_encode(sig)}"


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None
        h_b64, p_b64, sig_b64 = parts
        signing_input = f"{h_b64}.{p_b64}".encode("ascii")
        expected_sig = hmac.new(JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
        if not hmac.compare_digest(_b64url_encode(expected_sig), sig_b64):
            return None
        payload = json.loads(_b64url_decode(p_b64).decode("utf-8"))
        if payload.get("exp", 0) < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload
    except Exception:
        return None


def serialize_user(row: Any) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "authProvider": row["auth_provider"],
        "avatarUrl": row["avatar_url"],
        "headline": row["headline"] or "",
        "targetField": row["target_field"] or "",
        "experienceLevel": row["experience_level"] or "Fresh Graduate",
        "createdAt": row["created_at"],
        "lastLoginAt": row["last_login_at"],
    }


def get_current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    init_db()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="يرجى تسجيل الدخول أولاً للوصول إلى حسابك.")
    token = authorization.split(" ", 1)[1].strip()
    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى.")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (payload["sub"],)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="الحساب غير موجود.")
        return serialize_user(row)


def get_optional_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    """يُرجع المستخدم المسجل أو الحساب التجريبي الافتراضي لتسهيل تجربة الفريق."""
    init_db()
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        payload = decode_access_token(token)
        if payload and payload.get("sub"):
            with get_db() as conn:
                row = conn.execute("SELECT * FROM users WHERE id = ?", (payload["sub"],)).fetchone()
                if row:
                    return serialize_user(row)

    with get_db() as conn:
        fallback = conn.execute("SELECT * FROM users ORDER BY created_at ASC LIMIT 1").fetchone()
        if fallback:
            return serialize_user(fallback)
    raise HTTPException(status_code=401, detail="لا يوجد مستخدم مسجل حالياً.")
