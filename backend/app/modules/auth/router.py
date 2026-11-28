import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
import httpx

from app.core.config import (
    GOOGLE_CLIENT_ID,
    get_runtime_llm_config,
    save_runtime_llm_config,
)
from app.core.db import (
    get_db,
    hash_password,
    init_db,
    make_id,
    utc_now_iso,
    verify_password,
)
from app.core.llm import get_llm_status
from app.modules.auth.security import (
    create_access_token,
    get_current_user,
    get_optional_user,
    serialize_user,
)

# الراوتر الرسمي لـ (عضو 1 — الحسابات، قاعدة البيانات، الداشبورد، وصفحة التقدم)
router = APIRouter(tags=["Member 1 - Auth, Dashboard & Progress"])


@router.post("/register")
async def register_user(request: Request) -> Dict[str, Any]:
    init_db()
    body = await request.json()
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    headline = (body.get("headline") or "خريج مستعد لسوق العمل").strip()
    target_field = (body.get("targetField") or "تطوير البرمجيات").strip()
    experience_level = (body.get("experienceLevel") or "Fresh Graduate").strip()

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="يرجى إدخال الاسم الكامل (حرفين على الأقل).")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="يرجى إدخال بريد إلكتروني صحيح.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="كلمة المرور يجب ألا تقل عن 6 أحرف.")

    now = utc_now_iso()
    user_id = make_id("usr")

    with get_db() as conn:
        exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if exists:
            raise HTTPException(
                status_code=409,
                detail="هذا البريد الإلكتروني مسجل بالفعل — يمكنك تسجيل الدخول مباشرة.",
            )

        conn.execute(
            """
            INSERT INTO users (
                id, name, email, password_hash, auth_provider, headline, target_field, experience_level, created_at, last_login_at
            ) VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                name,
                email,
                hash_password(password),
                headline,
                target_field,
                experience_level,
                now,
                now,
            ),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    user_dict = serialize_user(row)
    token = create_access_token(user_dict["id"], user_dict["email"])
    return {"token": token, "user": user_dict}


@router.post("/login")
async def login_user(request: Request) -> Dict[str, Any]:
    init_db()
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    if not email or not password:
        raise HTTPException(status_code=400, detail="يرجى إدخال البريد الإلكتروني وكلمة المرور.")

    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="البريد الإلكتروني أو كلمة المرور غير صحيحة.")
        if row["auth_provider"] == "google" and not row["password_hash"]:
            raise HTTPException(
                status_code=400,
                detail="هذا الحساب مسجل عبر Google — يرجى استخدام زر الدخول بحساب Google.",
            )
        if not verify_password(password, row["password_hash"] or ""):
            raise HTTPException(status_code=401, detail="البريد الإلكتروني أو كلمة المرور غير صحيحة.")

        now = utc_now_iso()
        conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, row["id"]))
        updated = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()

    user_dict = serialize_user(updated)
    token = create_access_token(user_dict["id"], user_dict["email"])
    return {"token": token, "user": user_dict}


@router.post("/google")
async def google_login(request: Request) -> Dict[str, Any]:
    """
    تسجيل الدخول بحساب Google:
    1) إذا أرسل الفرونت credential (Google ID Token حقيقي من GSI)، يتحقق منه رسمياً عبر Google OAuth2 TokenInfo.
    2) يدعم أيضاً التدفق التفاعلي السريع لبيئات التطوير والعرض بدون تعقيد مفاتيح Cloud Console.
    """
    init_db()
    body = await request.json()
    credential = (body.get("credential") or body.get("idToken") or "").strip()

    email = ""
    name = ""
    picture = None
    google_sub = None

    if credential:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": credential},
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="رمز مصادقة Google غير صالح.")
            gdata = resp.json()
            if GOOGLE_CLIENT_ID and gdata.get("aud") != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=401, detail="معرف عميل Google غير مطابق.")
            email = (gdata.get("email") or "").strip().lower()
            name = (gdata.get("name") or email.split("@")[0]).strip()
            picture = gdata.get("picture")
            google_sub = gdata.get("sub")
    else:
        email = (body.get("email") or "").strip().lower()
        name = (body.get("name") or "").strip()
        picture = body.get("avatarUrl") or body.get("picture")
        google_sub = body.get("googleSub") or f"google_{email}"

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="بيانات حساب Google غير مكتملة (البريد مطلوب).")
    if not name:
        name = email.split("@")[0]

    now = utc_now_iso()
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET last_login_at = ?,
                    google_sub = COALESCE(google_sub, ?),
                    avatar_url = COALESCE(?, avatar_url)
                WHERE id = ?
                """,
                (now, google_sub, picture, existing["id"]),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (existing["id"],)).fetchone()
        else:
            user_id = make_id("usr")
            conn.execute(
                """
                INSERT INTO users (
                    id, name, email, password_hash, auth_provider, google_sub, avatar_url,
                    headline, target_field, experience_level, created_at, last_login_at
                ) VALUES (?, ?, ?, NULL, 'google', ?, ?, ?, ?, 'Fresh Graduate', ?, ?)
                """,
                (
                    user_id,
                    name,
                    email,
                    google_sub,
                    picture,
                    body.get("headline") or "مرشح عبر حساب Google",
                    body.get("targetField") or "تطوير البرمجيات",
                    now,
                    now,
                ),
            )
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    user_dict = serialize_user(row)
    token = create_access_token(user_dict["id"], user_dict["email"])
    return {
        "token": token,
        "user": user_dict,
        "googleClientConfigured": bool(GOOGLE_CLIENT_ID),
    }


@router.get("/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    return {"user": user, "googleClientId": GOOGLE_CLIENT_ID}


@router.patch("/profile")
async def update_profile(
    request: Request, user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    body = await request.json()
    name = (body.get("name") or user["name"]).strip()
    headline = (body.get("headline") if body.get("headline") is not None else user["headline"]).strip()
    target_field = (
        body.get("targetField") if body.get("targetField") is not None else user["targetField"]
    ).strip()
    experience_level = (
        body.get("experienceLevel")
        if body.get("experienceLevel") is not None
        else user["experienceLevel"]
    ).strip()

    with get_db() as conn:
        conn.execute(
            """
            UPDATE users
            SET name = ?, headline = ?, target_field = ?, experience_level = ?
            WHERE id = ?
            """,
            (name, headline, target_field, experience_level, user["id"]),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return {"user": serialize_user(row)}


@router.get("/dashboard")
async def get_dashboard_data(
    user: Dict[str, Any] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """بيانات شاشة الداشبورد الكاملة: الوظائف، المحاولات، التقارير، الـ CVs، وإحصائيات قاعدة البيانات."""
    uid = user["id"]
    with get_db() as conn:
        job_rows = conn.execute(
            "SELECT * FROM jobs WHERE user_id = ? ORDER BY updated_at DESC", (uid,)
        ).fetchall()

        rep_rows = conn.execute(
            """
            SELECT * FROM reports
            WHERE user_id = ? OR user_id IS NULL
            ORDER BY created_at DESC
            """,
            (uid,),
        ).fetchall()

        cv_rows = conn.execute(
            "SELECT * FROM cvs WHERE user_id = ? ORDER BY updated_at DESC", (uid,)
        ).fetchall()

        db_stats = {
            "users": conn.execute("SELECT COUNT(*) FROM users").fetchone()[0],
            "jobs": conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0],
            "interviews": conn.execute("SELECT COUNT(*) FROM interviews").fetchone()[0],
            "reports": conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0],
            "cvs": conn.execute("SELECT COUNT(*) FROM cvs").fetchone()[0],
        }

    # تجميع المحاولات لكل وظيفة لحساب التطور وأعلى درجة
    reports_by_job: Dict[str, List[Any]] = {}
    for r in rep_rows:
        jid = r["job_id"] or f"{r['company_name']}::{r['job_title']}"
        reports_by_job.setdefault(jid, []).append(r)

    jobs_out: List[Dict[str, Any]] = []
    for j in job_rows:
        j_reps = sorted(
            reports_by_job.get(j["id"], []),
            key=lambda x: (x["attempt_number"], x["created_at"]),
        )
        scores = [r["overall_score_100"] for r in j_reps]
        first_score = scores[0] if scores else None
        latest_score = scores[-1] if scores else None
        best_score = max(scores) if scores else None
        delta = (
            (latest_score - first_score)
            if (first_score is not None and latest_score is not None and len(scores) > 1)
            else 0
        )
        latest_rep = j_reps[-1] if j_reps else None

        jobs_out.append(
            {
                "id": j["id"],
                "companyName": j["company_name"],
                "jobTitle": j["job_title"],
                "jobLevel": j["job_level"],
                "jobDescription": j["job_description"],
                "status": j["status"],
                "attemptsCount": len(j_reps),
                "firstScore": first_score,
                "latestScore": latest_score,
                "bestScore": best_score,
                "improvementDelta": delta,
                "latestReportId": latest_rep["id"] if latest_rep else None,
                "readinessVerdict": latest_rep["readiness_verdict"] if latest_rep else "not_started",
                "createdAt": j["created_at"],
                "updatedAt": j["updated_at"],
            }
        )

    attempts_out: List[Dict[str, Any]] = []
    # حساب الفارق لكل محاولة مقارنة بالمحاولة السابقة لنفس الوظيفة
    chronological_all = sorted(rep_rows, key=lambda x: x["created_at"])
    prev_by_job_key: Dict[str, int] = {}
    delta_by_rep_id: Dict[str, Optional[int]] = {}
    for r in chronological_all:
        jkey = r["job_id"] or f"{r['company_name']}::{r['job_title']}"
        prev_val = prev_by_job_key.get(jkey)
        delta_by_rep_id[r["id"]] = (
            r["overall_score_100"] - prev_val if prev_val is not None else None
        )
        prev_by_job_key[jkey] = r["overall_score_100"]

    for r in rep_rows:
        cats = {}
        try:
            cats = json.loads(r["category_scores_json"] or "{}")
        except Exception:
            pass
        attempts_out.append(
            {
                "reportId": r["id"],
                "interviewId": r["interview_id"],
                "jobId": r["job_id"],
                "companyName": r["company_name"],
                "jobTitle": r["job_title"],
                "jobLevel": r["job_level"],
                "attemptNumber": r["attempt_number"],
                "mode": r["mode"],
                "overallScore100": r["overall_score_100"],
                "averageScore10": r["average_score_10"],
                "readinessVerdict": r["readiness_verdict"],
                "readinessLabel": r["readiness_label"],
                "strengthsCount": r["strengths_count"],
                "weaknessesCount": r["weaknesses_count"],
                "deltaFromPrevious": delta_by_rep_id.get(r["id"]),
                "categoryScores": cats,
                "createdAt": r["created_at"],
            }
        )

    cvs_out = []
    for c in cv_rows:
        missing = []
        try:
            missing = json.loads(c["missing_keywords_json"] or "[]")
        except Exception:
            pass
        cvs_out.append(
            {
                "id": c["id"],
                "jobId": c["job_id"],
                "title": c["title"],
                "atsScore": c["ats_score"],
                "jobMatchScore": c["job_match_score"],
                "missingKeywords": missing,
                "updatedAt": c["updated_at"],
            }
        )

    all_scores = [a["overallScore100"] for a in attempts_out]
    summary = {
        "totalJobs": len(jobs_out),
        "readyJobs": sum(1 for j in jobs_out if j["status"] == "ready" or j["readinessVerdict"] == "ready"),
        "totalAttempts": len(attempts_out),
        "bestScore": max(all_scores) if all_scores else 0,
        "averageScore": round(sum(all_scores) / len(all_scores)) if all_scores else 0,
        "totalCvs": len(cvs_out),
        "bestAtsScore": max((c["atsScore"] for c in cvs_out), default=0),
    }

    return {
        "user": user,
        "summary": summary,
        "jobs": jobs_out,
        "attempts": attempts_out,
        "cvs": cvs_out,
        "dbStats": db_stats,
        "llmStatus": get_llm_status(),
    }


@router.post("/jobs")
async def create_job_entry(
    request: Request, user: Dict[str, Any] = Depends(get_optional_user)
) -> Dict[str, Any]:
    body = await request.json()
    company_name = (body.get("companyName") or "").strip()
    job_title = (body.get("jobTitle") or "").strip()
    job_level = (body.get("jobLevel") or "Fresh Graduate").strip()
    job_description = (body.get("jobDescription") or "").strip()

    if not company_name or not job_title:
        raise HTTPException(status_code=400, detail="اسم الشركة والمسمى الوظيفي مطلوبان.")

    now = utc_now_iso()
    job_id = make_id("job")
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO jobs (id, user_id, company_name, job_title, job_level, job_description, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'preparing', ?, ?)
            """,
            (
                job_id,
                user["id"],
                company_name,
                job_title,
                job_level,
                job_description,
                now,
                now,
            ),
        )
    return {
        "job": {
            "id": job_id,
            "companyName": company_name,
            "jobTitle": job_title,
            "jobLevel": job_level,
            "jobDescription": job_description,
            "status": "preparing",
            "createdAt": now,
        }
    }


@router.patch("/jobs/{job_id}")
async def update_job_entry(
    job_id: str, request: Request, user: Dict[str, Any] = Depends(get_optional_user)
) -> Dict[str, Any]:
    body = await request.json()
    now = utc_now_iso()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM jobs WHERE id = ? AND user_id = ?", (job_id, user["id"])
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="الوظيفة غير موجودة.")
        new_status = (body.get("status") or existing["status"]).strip()
        new_company = (body.get("companyName") or existing["company_name"]).strip()
        new_title = (body.get("jobTitle") or existing["job_title"]).strip()
        new_level = (body.get("jobLevel") or existing["job_level"]).strip()
        new_jd = (
            body.get("jobDescription")
            if body.get("jobDescription") is not None
            else existing["job_description"]
        )
        conn.execute(
            """
            UPDATE jobs
            SET status = ?, company_name = ?, job_title = ?, job_level = ?, job_description = ?, updated_at = ?
            WHERE id = ?
            """,
            (new_status, new_company, new_title, new_level, new_jd, now, job_id),
        )
    return {"ok": True}


@router.delete("/jobs/{job_id}")
async def delete_job_entry(
    job_id: str, user: Dict[str, Any] = Depends(get_optional_user)
) -> Dict[str, Any]:
    with get_db() as conn:
        cur = conn.execute("DELETE FROM jobs WHERE id = ? AND user_id = ?", (job_id, user["id"]))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="الوظيفة غير موجودة.")
    return {"ok": True}


@router.post("/attempts")
async def record_attempt_entry(
    request: Request, user: Dict[str, Any] = Depends(get_optional_user)
) -> Dict[str, Any]:
    """تسجيل محاولة جديدة ديناميكياً لتحديث منحنى التقدم والداشبورد."""
    body = await request.json()
    job_id = body.get("jobId")
    score100 = max(0, min(100, int(body.get("overallScore100") or 70)))
    mode = body.get("mode") or "weakness_retake"
    hr_s = max(0, min(100, int(body.get("hrScore") or score100)))
    beh_s = max(0, min(100, int(body.get("behavioralScore") or score100)))
    tech_s = max(0, min(100, int(body.get("technicalScore") or score100)))
    conf_s = max(0, min(100, int(body.get("confidenceScore") or score100)))
    cats = {
        "hr": hr_s,
        "behavioral": beh_s,
        "technical": tech_s,
        "behaviorConfidence": conf_s,
    }

    now = utc_now_iso()
    with get_db() as conn:
        job_row = None
        if job_id:
            job_row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        comp = (
            job_row["company_name"]
            if job_row
            else (body.get("companyName") or "شركة مستهدفة")
        )
        title = (
            job_row["job_title"]
            if job_row
            else (body.get("jobTitle") or "وظيفة مستهدفة")
        )
        level = job_row["job_level"] if job_row else "Fresh Graduate"

        prev_rows = conn.execute(
            """
            SELECT id, attempt_number FROM reports
            WHERE (job_id = ? AND ? IS NOT NULL) OR (company_name = ? AND job_title = ?)
            ORDER BY attempt_number DESC, created_at DESC LIMIT 1
            """,
            (job_id, job_id, comp, title),
        ).fetchone()

        attempt_num = (prev_rows["attempt_number"] + 1) if prev_rows else 1
        parent_rep_id = prev_rows["id"] if prev_rows else None

        verdict = (
            "ready"
            if score100 >= 75
            else ("almost_ready" if score100 >= 60 else "needs_practice")
        )
        v_label = (
            "اتمكنت! جاهز للتقديم والمقابلة الحقيقية"
            if verdict == "ready"
            else (
                "قريب جداً من التمكن — راجع نقاط الضعف وأعد المحاولة"
                if verdict == "almost_ready"
                else "يحتاج مذاكرة وتدريب إضافي قبل التقديم"
            )
        )

        intv_id = make_id("intv")
        rep_id = make_id("rep")
        avg10 = round(score100 / 10, 1)

        conn.execute(
            """
            INSERT INTO interviews (
                id, user_id, job_id, attempt_number, mode, status, overall_score, category_scores_json, duration_minutes, created_at
            ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, 14, ?)
            """,
            (
                intv_id,
                user["id"],
                job_id,
                attempt_num,
                mode,
                score100,
                json.dumps(cats, ensure_ascii=False),
                now,
            ),
        )

        report_payload = {
            "id": rep_id,
            "interviewId": intv_id,
            "candidateName": user["name"],
            "createdAt": now,
            "attemptNumber": attempt_num,
            "mode": mode,
            "parentReportId": parent_rep_id,
            "jobContext": {
                "jobId": job_id,
                "companyName": comp,
                "jobTitle": title,
                "jobLevel": level,
                "jobDescription": job_row["job_description"] if job_row else "",
            },
            "overallScore100": score100,
            "averageScore10": avg10,
            "stars": round(score100 / 20, 1),
            "readinessVerdict": verdict,
            "readinessLabel": v_label,
            "executiveSummary": f"سجلت في المحاولة #{attempt_num} لوظيفة {title} بشركة {comp} درجة {score100}%.",
            "categoryScores": cats,
            "strengths": [],
            "weaknesses": [],
            "questionEvaluations": [],
            "behaviorDataSource": "estimated",
        }

        conn.execute(
            """
            INSERT INTO reports (
                id, user_id, job_id, interview_id, parent_report_id, company_name, job_title, job_level,
                attempt_number, mode, overall_score_100, average_score_10, readiness_verdict, readiness_label,
                strengths_count, weaknesses_count, category_scores_json, report_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rep_id,
                user["id"],
                job_id,
                intv_id,
                parent_rep_id,
                comp,
                title,
                level,
                attempt_num,
                mode,
                score100,
                avg10,
                verdict,
                v_label,
                3 if score100 >= 75 else 1,
                0 if score100 >= 75 else 2,
                json.dumps(cats, ensure_ascii=False),
                json.dumps(report_payload, ensure_ascii=False),
                now,
                now,
            ),
        )

        if job_id:
            new_job_status = "ready" if verdict == "ready" else "practicing"
            conn.execute(
                "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?",
                (new_job_status, now, job_id),
            )

    return {"ok": True, "reportId": rep_id, "attemptNumber": attempt_num}


@router.get("/progress")
async def get_progress_analytics(
    jobId: Optional[str] = Query(default=None),
    user: Dict[str, Any] = Depends(get_optional_user),
) -> Dict[str, Any]:
    """بيانات صفحة التقدم (ProgressPage): مقارنة الدرجات بين المحاولات وتطور المحاور."""
    uid = user["id"]
    with get_db() as conn:
        job_rows = conn.execute(
            "SELECT * FROM jobs WHERE user_id = ? ORDER BY updated_at DESC", (uid,)
        ).fetchall()

        if jobId:
            rep_rows = conn.execute(
                """
                SELECT * FROM reports
                WHERE (user_id = ? OR user_id IS NULL) AND job_id = ?
                ORDER BY created_at ASC
                """,
                (uid, jobId),
            ).fetchall()
        else:
            rep_rows = conn.execute(
                """
                SELECT * FROM reports
                WHERE user_id = ? OR user_id IS NULL
                ORDER BY created_at ASC
                """,
                (uid,),
            ).fetchall()

    timeline: List[Dict[str, Any]] = []
    prev_by_job: Dict[str, int] = {}

    for idx, r in enumerate(rep_rows):
        cats = {}
        try:
            cats = json.loads(r["category_scores_json"] or "{}")
        except Exception:
            pass
        jkey = r["job_id"] or f"{r['company_name']}::{r['job_title']}"
        prev_score = prev_by_job.get(jkey)
        delta = r["overall_score_100"] - prev_score if prev_score is not None else 0
        prev_by_job[jkey] = r["overall_score_100"]

        timeline.append(
            {
                "index": idx + 1,
                "reportId": r["id"],
                "jobId": r["job_id"],
                "companyName": r["company_name"],
                "jobTitle": r["job_title"],
                "attemptNumber": r["attempt_number"],
                "mode": r["mode"],
                "overallScore100": r["overall_score_100"],
                "averageScore10": r["average_score_10"],
                "deltaFromPrevious": delta,
                "hasPrevious": prev_score is not None,
                "hr": cats.get("hr") or r["overall_score_100"],
                "behavioral": cats.get("behavioral") or r["overall_score_100"],
                "technical": cats.get("technical") or r["overall_score_100"],
                "confidence": cats.get("behaviorConfidence") or r["overall_score_100"],
                "readinessVerdict": r["readiness_verdict"],
                "readinessLabel": r["readiness_label"],
                "createdAt": r["created_at"],
            }
        )

    # تطور كل وظيفة على حدة (من أول محاولة لآخر محاولة)
    by_job: Dict[str, List[Dict[str, Any]]] = {}
    for item in timeline:
        key = item["jobId"] or f"{item['companyName']}::{item['jobTitle']}"
        by_job.setdefault(key, []).append(item)

    job_progressions: List[Dict[str, Any]] = []
    for key, items in by_job.items():
        first_s = items[0]["overallScore100"]
        latest_s = items[-1]["overallScore100"]
        best_s = max(x["overallScore100"] for x in items)
        job_progressions.append(
            {
                "jobKey": key,
                "jobId": items[0]["jobId"],
                "companyName": items[0]["companyName"],
                "jobTitle": items[0]["jobTitle"],
                "attemptsCount": len(items),
                "firstScore": first_s,
                "latestScore": latest_s,
                "bestScore": best_s,
                "netImprovement": latest_s - first_s,
                "readinessVerdict": items[-1]["readinessVerdict"],
                "attempts": items,
            }
        )

    # مقارنة أول محاولة بآخر محاولة على مستوى المحاور الأربعة
    category_growth = None
    if len(timeline) >= 2:
        first_item = timeline[0]
        last_item = timeline[-1]
        category_growth = {
            "overall": {"first": first_item["overallScore100"], "latest": last_item["overallScore100"]},
            "technical": {"first": first_item["technical"], "latest": last_item["technical"]},
            "behavioral": {"first": first_item["behavioral"], "latest": last_item["behavioral"]},
            "hr": {"first": first_item["hr"], "latest": last_item["hr"]},
            "confidence": {"first": first_item["confidence"], "latest": last_item["confidence"]},
        }
    elif len(timeline) == 1:
        only = timeline[0]
        category_growth = {
            "overall": {"first": only["overallScore100"], "latest": only["overallScore100"]},
            "technical": {"first": only["technical"], "latest": only["technical"]},
            "behavioral": {"first": only["behavioral"], "latest": only["behavioral"]},
            "hr": {"first": only["hr"], "latest": only["hr"]},
            "confidence": {"first": only["confidence"], "latest": only["confidence"]},
        }

    jobs_filter_list = [
        {
            "id": j["id"],
            "companyName": j["company_name"],
            "jobTitle": j["job_title"],
        }
        for j in job_rows
    ]

    total_gain = (
        timeline[-1]["overallScore100"] - timeline[0]["overallScore100"]
        if len(timeline) >= 2
        else 0
    )

    return {
        "user": user,
        "selectedJobId": jobId,
        "jobs": jobs_filter_list,
        "timeline": timeline,
        "jobProgressions": job_progressions,
        "categoryGrowth": category_growth,
        "kpis": {
            "totalAttempts": len(timeline),
            "firstScore": timeline[0]["overallScore100"] if timeline else 0,
            "latestScore": timeline[-1]["overallScore100"] if timeline else 0,
            "bestScore": max((x["overallScore100"] for x in timeline), default=0),
            "totalGain": total_gain,
        },
    }


@router.get("/llm")
async def get_shared_llm_info() -> Dict[str, Any]:
    cfg = get_runtime_llm_config()
    return {
        "status": get_llm_status(),
        "config": {
            "provider": cfg.get("provider", "auto"),
            "baseUrl": cfg.get("baseUrl", ""),
            "model": cfg.get("model", ""),
            "hasSavedKey": bool(cfg.get("apiKey")),
        },
    }


@router.post("/llm")
async def update_shared_llm_info(request: Request) -> Dict[str, Any]:
    body = await request.json()
    save_runtime_llm_config(
        {
            "provider": (body.get("provider") or "auto").strip(),
            "apiKey": (body.get("apiKey") or "").strip() or None,
            "baseUrl": (body.get("baseUrl") or "").strip() or None,
            "model": (body.get("model") or "").strip() or None,
        }
    )
    return {"ok": True, "status": get_llm_status()}
