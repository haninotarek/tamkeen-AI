from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
import sqlite3
from typing import Any, Dict, Generator, List, Optional
import uuid

from app.core.config import DB_PATH, ensure_data_dir
from app.core.mocks import load_mock


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def hash_password(password: str, salt: Optional[str] = None) -> str:
    s = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), s.encode("utf-8"), 120_000)
    return f"pbkdf2_sha256${s}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash or "$" not in stored_hash:
        return False
    try:
        _, salt, expected_hex = stored_hash.split("$", 2)
        candidate = hash_password(password, salt)
        return hmac.compare_digest(candidate, stored_hash)
    except Exception:
        return False


@contextmanager
def get_db() -> Generator[sqlite3.Connection, None, None]:
    ensure_data_dir()
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


_DEMO_REFRESH_DONE = False


def init_db() -> None:
    """إنشاء الجداول الخمسة الرسمية للمنصة: المستخدمين، الوظايف، المقابلات، التقارير، الـ CVs."""
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                auth_provider TEXT NOT NULL DEFAULT 'email',
                google_sub TEXT,
                avatar_url TEXT,
                headline TEXT DEFAULT 'خريج مستعد لسوق العمل',
                target_field TEXT DEFAULT 'تطوير البرمجيات',
                experience_level TEXT DEFAULT 'Fresh Graduate',
                created_at TEXT NOT NULL,
                last_login_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                company_name TEXT NOT NULL,
                job_title TEXT NOT NULL,
                job_level TEXT NOT NULL DEFAULT 'Fresh Graduate',
                job_description TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'practicing',
                company_brief_json TEXT DEFAULT '{}',
                question_bank_json TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS interviews (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                job_id TEXT,
                attempt_number INTEGER NOT NULL DEFAULT 1,
                mode TEXT NOT NULL DEFAULT 'full',
                status TEXT NOT NULL DEFAULT 'completed',
                overall_score INTEGER NOT NULL DEFAULT 0,
                category_scores_json TEXT DEFAULT '{}',
                transcript_json TEXT DEFAULT '[]',
                behavior_metrics_json TEXT DEFAULT '{}',
                duration_minutes INTEGER DEFAULT 15,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                job_id TEXT,
                interview_id TEXT,
                parent_report_id TEXT,
                company_name TEXT DEFAULT '',
                job_title TEXT DEFAULT '',
                job_level TEXT DEFAULT 'Fresh Graduate',
                attempt_number INTEGER NOT NULL DEFAULT 1,
                mode TEXT NOT NULL DEFAULT 'full',
                overall_score_100 INTEGER NOT NULL DEFAULT 0,
                average_score_10 REAL NOT NULL DEFAULT 0.0,
                readiness_verdict TEXT DEFAULT 'needs_practice',
                readiness_label TEXT DEFAULT '',
                strengths_count INTEGER DEFAULT 0,
                weaknesses_count INTEGER DEFAULT 0,
                category_scores_json TEXT DEFAULT '{}',
                report_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS cvs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                job_id TEXT,
                title TEXT NOT NULL,
                ats_score INTEGER NOT NULL DEFAULT 0,
                job_match_score INTEGER NOT NULL DEFAULT 0,
                missing_keywords_json TEXT DEFAULT '[]',
                cv_data_json TEXT DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(user_id);
            CREATE INDEX IF NOT EXISTS idx_interviews_user ON interviews(user_id);
            CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
            CREATE INDEX IF NOT EXISTS idx_cvs_user ON cvs(user_id);
            """
        )

        # زرع بيانات حساب تجريبي غني بالمحاولات المتعددة عند أول تشغيل فقط
        count_row = conn.execute("SELECT COUNT(*) AS cnt FROM users").fetchone()
        if count_row and count_row["cnt"] == 0:
            _seed_initial_data(conn)

    global _DEMO_REFRESH_DONE
    if not _DEMO_REFRESH_DONE:
        _DEMO_REFRESH_DONE = True
        try:
            _refresh_demo_seed()
        except Exception:
            pass


def _seed_initial_data(conn: sqlite3.Connection) -> None:
    user_id = "usr_hazem_01"
    conn.execute(
        """
        INSERT INTO users (
            id, name, email, password_hash, auth_provider, headline, target_field, experience_level, created_at, last_login_at
        ) VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            "حازم أحمد",
            "hazem@tamkeen.ai",
            hash_password("123456"),
            "مهندس برمجيات متكامل (Full-Stack Developer)",
            "تطوير البرمجيات والذكاء الاصطناعي",
            "Fresh Graduate",
            "2026-11-18T09:00:00+00:00",
            utc_now_iso(),
        ),
    )

    jobs_seed = [
        (
            "job_fawry_01",
            user_id,
            "شركة فوري (Fawry)",
            "مهندس واجهات أمامية (Frontend React Developer)",
            "Fresh Graduate",
            "بناء وتطوير واجهات دفع إلكتروني سريعة وآمنة باستخدام React و Vite وتحسين الأداء والتعامل مع REST APIs.",
            "ready",
            "2026-11-19T10:00:00+00:00",
        ),
        (
            "job_vois_02",
            user_id,
            "فودافون مصر (_VOIS)",
            "Backend Python FastAPI Engineer",
            "Junior",
            "تصميم وبناء خدمات مصغرة وقواعد بيانات عالية الكفاءة باستخدام Python و FastAPI و SQL.",
            "practicing",
            "2026-11-21T12:00:00+00:00",
        ),
        (
            "job_instabug_03",
            user_id,
            "إنستابج (Instabug)",
            "Full-Stack Software Engineer",
            "Fresh Graduate",
            "تطوير لوحات تحكم تحليلية فورية للأخطاء والأداء باستخدام React و Python.",
            "preparing",
            "2026-11-25T15:00:00+00:00",
        ),
    ]
    for j in jobs_seed:
        conn.execute(
            """
            INSERT INTO jobs (id, user_id, company_name, job_title, job_level, job_description, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*j, j[7]),
        )

    # محاولات متعددة توضح تطور الدرجات عبر المحاولات لصفحة التقدم (ProgressPage) والداشبورد
    attempts_seed = [
        # وظيفة فوري: 3 محاولات متدرجة التحسن (54% -> 71% -> 89%)
        (
            "intv_fawry_try1",
            "rep_fawry_try1",
            None,
            "job_fawry_01",
            "شركة فوري (Fawry)",
            "مهندس واجهات أمامية (Frontend React Developer)",
            1,
            "full",
            54,
            5.4,
            "needs_practice",
            "يحتاج مذاكرة وتدريب إضافي قبل التقديم",
            2,
            3,
            {"hr": 72, "behavioral": 62, "technical": 41, "behaviorConfidence": 58},
            18,
            "2026-11-20T14:00:00+00:00",
        ),
        (
            "intv_fawry_try2",
            "rep_seed_fawry_01",
            "rep_fawry_try1",
            "job_fawry_01",
            "شركة فوري (Fawry)",
            "مهندس واجهات أمامية (Frontend React Developer)",
            2,
            "weakness_retake",
            69,
            6.9,
            "almost_ready",
            "قريب جداً من التمكن — راجع نقاط الضعف وأعد المحاولة",
            3,
            2,
            {"hr": 85, "behavioral": 78, "technical": 52, "behaviorConfidence": 72},
            14,
            "2026-11-22T16:30:00+00:00",
        ),
        (
            "intv_fawry_try3",
            "rep_fawry_try3",
            "rep_seed_fawry_01",
            "job_fawry_01",
            "شركة فوري (Fawry)",
            "مهندس واجهات أمامية (Frontend React Developer)",
            3,
            "weakness_retake",
            89,
            8.9,
            "ready",
            "اتمكنت! جاهز للتقديم والمقابلة الحقيقية",
            4,
            0,
            {"hr": 90, "behavioral": 88, "technical": 88, "behaviorConfidence": 89},
            11,
            "2026-11-24T19:15:00+00:00",
        ),
        # وظيفة فودافون VOIS: محاولتان (61% -> 82%)
        (
            "intv_vois_try1",
            "rep_vois_try1",
            None,
            "job_vois_02",
            "فودافون مصر (_VOIS)",
            "Backend Python FastAPI Engineer",
            1,
            "full",
            61,
            6.1,
            "almost_ready",
            "قريب جداً من التمكن — راجع نقاط الضعف وأعد المحاولة",
            2,
            2,
            {"hr": 76, "behavioral": 68, "technical": 50, "behaviorConfidence": 64},
            20,
            "2026-11-23T11:00:00+00:00",
        ),
        (
            "intv_vois_try2",
            "rep_vois_try2",
            "rep_vois_try1",
            "job_vois_02",
            "فودافون مصر (_VOIS)",
            "Backend Python FastAPI Engineer",
            2,
            "weakness_retake",
            82,
            8.2,
            "ready",
            "اتمكنت! جاهز للتقديم والمقابلة الحقيقية",
            3,
            0,
            {"hr": 84, "behavioral": 81, "technical": 82, "behaviorConfidence": 83},
            12,
            "2026-11-25T18:20:00+00:00",
        ),
    ]

    mock_report_file = load_mock("report", default={})
    seed_report_objs = (
        mock_report_file.get("reports", [])
        if isinstance(mock_report_file, dict)
        else []
    )
    seed_map = {r.get("id"): r for r in seed_report_objs if isinstance(r, dict)}

    for (
        intv_id,
        rep_id,
        parent_id,
        job_id,
        comp,
        title,
        att_num,
        mode,
        score100,
        avg10,
        verdict,
        v_label,
        s_cnt,
        w_cnt,
        cat_scores,
        dur,
        created_at,
    ) in attempts_seed:
        conn.execute(
            """
            INSERT INTO interviews (
                id, user_id, job_id, attempt_number, mode, status, overall_score, category_scores_json, duration_minutes, created_at
            ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
            """,
            (
                intv_id,
                user_id,
                job_id,
                att_num,
                mode,
                score100,
                json.dumps(cat_scores, ensure_ascii=False),
                dur,
                created_at,
            ),
        )

        full_rep = seed_map.get(rep_id) or {
            "id": rep_id,
            "interviewId": intv_id,
            "candidateName": "حازم أحمد",
            "createdAt": created_at,
            "attemptNumber": att_num,
            "mode": mode,
            "parentReportId": parent_id,
            "jobContext": {
                "jobId": job_id,
                "companyName": comp,
                "jobTitle": title,
                "jobLevel": "Fresh Graduate",
                "jobDescription": f"متطلبات وظيفة {title} في {comp}.",
            },
            "overallScore100": score100,
            "averageScore10": avg10,
            "stars": round(score100 / 20, 1),
            "readinessVerdict": verdict,
            "readinessLabel": v_label,
            "executiveSummary": f"سجلت في المحاولة #{att_num} لوظيفة {title} بشركة {comp} نسبة إجمالية {score100}%.",
            "categoryScores": cat_scores,
            "strengths": [
                {
                    "id": f"st_{rep_id}_1",
                    "title": "وضوح العرض والتواصل المهني",
                    "description": f"أداء متميز في محاولة #{att_num} مع تحسن ملحوظ في تنظيم الأفكار.",
                    "scoreHighlight": f"{avg10}/10",
                }
            ],
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Fresh Graduate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rep_id,
                user_id,
                job_id,
                intv_id,
                parent_id,
                comp,
                title,
                att_num,
                mode,
                score100,
                avg10,
                verdict,
                v_label,
                s_cnt,
                w_cnt,
                json.dumps(cat_scores, ensure_ascii=False),
                json.dumps(full_rep, ensure_ascii=False),
                created_at,
                created_at,
            ),
        )

    # زرع سجل CV أولي في جدول cvs لربطه بالداشبورد و CV Studio
    conn.execute(
        """
        INSERT INTO cvs (
            id, user_id, job_id, title, ats_score, job_match_score, missing_keywords_json, cv_data_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "cv_hazem_01",
            user_id,
            "job_fawry_01",
            "السيرة الذاتية — Frontend & Full-Stack (ATS Ready)",
            86,
            82,
            json.dumps(["Web Vitals", "CI/CD", "Unit Testing"], ensure_ascii=False),
            json.dumps({"template": "modern-ats", "owner": "حازم أحمد"}, ensure_ascii=False),
            "2026-11-24T10:00:00+00:00",
            "2026-11-24T10:00:00+00:00",
        ),
    )


def sync_report_to_db(report: Dict[str, Any], user_id: Optional[str] = None) -> None:
    """حفظ أو مزامنة أي تقرير ناتج من موديول عضو 6 داخل جدول reports وجدول interviews تلقائياً."""
    init_db()
    rep_id = report.get("id")
    if not rep_id:
        return
    job_ctx = report.get("jobContext") or {}
    comp = job_ctx.get("companyName") or "الشركة المستهدفة"
    title = job_ctx.get("jobTitle") or "مرشح للوظيفة"
    level = job_ctx.get("jobLevel") or "Fresh Graduate"
    job_id = job_ctx.get("jobId")
    cat_scores = report.get("categoryScores") or {}
    now = report.get("createdAt") or utc_now_iso()

    with get_db() as conn:
        resolved_user = user_id
        if not resolved_user:
            first_u = conn.execute("SELECT id FROM users ORDER BY last_login_at DESC LIMIT 1").fetchone()
            resolved_user = first_u["id"] if first_u else None

        if resolved_user and not job_id:
            existing_job = conn.execute(
                "SELECT id FROM jobs WHERE user_id = ? AND company_name = ? AND job_title = ? LIMIT 1",
                (resolved_user, comp, title),
            ).fetchone()
            if existing_job:
                job_id = existing_job["id"]
            else:
                job_id = make_id("job")
                conn.execute(
                    """
                    INSERT INTO jobs (id, user_id, company_name, job_title, job_level, job_description, status, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        job_id,
                        resolved_user,
                        comp,
                        title,
                        level,
                        job_ctx.get("jobDescription") or "",
                        "ready" if report.get("readinessVerdict") == "ready" else "practicing",
                        now,
                        now,
                    ),
                )

        if job_id and report.get("readinessVerdict") == "ready":
            conn.execute("UPDATE jobs SET status = 'ready', updated_at = ? WHERE id = ?", (now, job_id))

        intv_id = report.get("interviewId") or f"intv_{rep_id}"
        if resolved_user:
            conn.execute(
                """
                INSERT OR REPLACE INTO interviews (
                    id, user_id, job_id, attempt_number, mode, status, overall_score, category_scores_json, duration_minutes, created_at
                ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
                """,
                (
                    intv_id,
                    resolved_user,
                    job_id,
                    int(report.get("attemptNumber") or 1),
                    report.get("mode") or "full",
                    int(report.get("overallScore100") or 0),
                    json.dumps(cat_scores, ensure_ascii=False),
                    max(6, len(report.get("questionEvaluations") or []) * 4),
                    now,
                ),
            )

        conn.execute(
            """
            INSERT OR REPLACE INTO reports (
                id, user_id, job_id, interview_id, parent_report_id, company_name, job_title, job_level,
                attempt_number, mode, overall_score_100, average_score_10, readiness_verdict, readiness_label,
                strengths_count, weaknesses_count, category_scores_json, report_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rep_id,
                resolved_user,
                job_id,
                intv_id,
                report.get("parentReportId"),
                comp,
                title,
                level,
                int(report.get("attemptNumber") or 1),
                report.get("mode") or "full",
                int(report.get("overallScore100") or 0),
                float(report.get("averageScore10") or 0.0),
                report.get("readinessVerdict") or "needs_practice",
                report.get("readinessLabel") or "",
                len(report.get("strengths") or []),
                len(report.get("weaknesses") or []),
                json.dumps(cat_scores, ensure_ascii=False),
                json.dumps(report, ensure_ascii=False),
                now,
                utc_now_iso(),
            ),
        )


def _refresh_demo_seed() -> None:
    """
    تحديث بيانات الحساب التجريبي عند بدء التشغيل:
    تُحذف محاولات الزرع القديمة (معرّفاتها تحتوي seed أو try) ويُعاد تسجيلها
    عبر نفس مسار تسجيل المحاولات الحقيقي لتصبح كل المؤشرات متسقة تماماً بين
    الداشبورد وصفحة التقدم والتقارير — مع الحفاظ على بيانات بقية المستخدمين.
    """
    demo_user = "usr_hazem_01"
    demo_jobs = {
        "job_fawry_01": (
            "شركة فوري (Fawry)",
            "مهندس واجهات أمامية (Frontend React Developer)",
            "Fresh Graduate",
            "بناء وتطوير واجهات دفع إلكتروني سريعة وآمنة باستخدام React و Vite وتحسين الأداء والتعامل مع REST APIs.",
        ),
        "job_vois_02": (
            "فودافون مصر (_VOIS)",
            "Backend Python FastAPI Engineer",
            "Junior",
            "تصميم وبناء خدمات مصغرة وقواعد بيانات عالية الكفاءة باستخدام Python و FastAPI و SQL.",
        ),
    }

    with get_db() as conn:
        exists = conn.execute("SELECT id FROM users WHERE id = ?", (demo_user,)).fetchone()
        if not exists:
            return

        conn.execute(
            "DELETE FROM reports WHERE user_id = ? AND (id LIKE '%seed%' OR id LIKE '%try%')",
            (demo_user,),
        )
        conn.execute(
            "DELETE FROM interviews WHERE user_id = ? AND (id LIKE '%seed%' OR id LIKE '%try%')",
            (demo_user,),
        )

        remaining = conn.execute(
            "SELECT COUNT(*) AS cnt FROM reports WHERE user_id = ?", (demo_user,)
        ).fetchone()
        if remaining and remaining["cnt"] > 0:
            return

    demo_plan = [
        ("job_fawry_01", 54, "full_interview", 72, 62, 41, 58),
        ("job_vois_02", 61, "full_interview", 76, 68, 50, 64),
        ("job_fawry_01", 69, "weakness_retake", 85, 78, 52, 72),
        ("job_vois_02", 82, "weakness_retake", 84, 81, 82, 83),
        ("job_fawry_01", 89, "weakness_retake", 90, 88, 88, 89),
    ]
    needs_reseed = True
    with get_db() as conn:
        cnt = conn.execute(
            "SELECT COUNT(*) AS cnt FROM reports WHERE user_id = ?", (demo_user,)
        ).fetchone()
        needs_reseed = not cnt or cnt["cnt"] == 0

    if not needs_reseed:
        return

    base_ts = datetime(2026, 11, 19, 12, 0, tzinfo=timezone.utc)
    for idx, (job_id, score, mode, hr, beh, tech, conf) in enumerate(demo_plan):
        comp, title, level, jd = demo_jobs[job_id]
        created = (base_ts + timedelta(days=idx * 1, hours=idx * 5)).isoformat()
        cats = {"hr": hr, "behavioral": beh, "technical": tech, "behaviorConfidence": conf}
        verdict = "ready" if score >= 75 else ("almost_ready" if score >= 60 else "needs_practice")
        v_label = (
            "اتمكنت! جاهز للتقديم والمقابلة الحقيقية"
            if verdict == "ready"
            else (
                "قريب جداً من التمكن — راجع نقاط الضعف وأعد المحاولة"
                if verdict == "almost_ready"
                else "يحتاج مذاكرة وتدريب إضافي قبل التقديم"
            )
        )
        with get_db() as conn:
            prev = conn.execute(
                "SELECT id, attempt_number FROM reports WHERE user_id = ? AND job_id = ? "
                "ORDER BY attempt_number DESC, created_at DESC LIMIT 1",
                (demo_user, job_id),
            ).fetchone()
            attempt = (prev["attempt_number"] + 1) if prev else 1
            parent_id = prev["id"] if prev else None
            intv_id = make_id("intv")
            rep_id = make_id("rep")
            payload = {
                "id": rep_id,
                "interviewId": intv_id,
                "candidateName": "حازم أحمد",
                "createdAt": created,
                "attemptNumber": attempt,
                "mode": mode,
                "parentReportId": parent_id,
                "jobContext": {
                    "jobId": job_id,
                    "companyName": comp,
                    "jobTitle": title,
                    "jobLevel": level,
                    "jobDescription": jd,
                },
                "overallScore100": score,
                "averageScore10": round(score / 10, 1),
                "stars": round(score / 20, 1),
                "readinessVerdict": verdict,
                "readinessLabel": v_label,
                "executiveSummary": f"محاولة #{attempt} لوظيفة {title} بشركة {comp} بدرجة إجمالية {score}%.",
                "categoryScores": cats,
                "strengths": [],
                "weaknesses": [],
                "questionEvaluations": [],
                "behaviorDataSource": "estimated",
            }
            conn.execute(
                """
                INSERT INTO interviews (
                    id, user_id, job_id, attempt_number, mode, status, overall_score, category_scores_json, duration_minutes, created_at
                ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, 15, ?)
                """,
                (intv_id, demo_user, job_id, attempt, mode, score, json.dumps(cats, ensure_ascii=False), created),
            )
            conn.execute(
                """
                INSERT INTO reports (
                    id, user_id, job_id, interview_id, parent_report_id, company_name, job_title, job_level,
                    attempt_number, mode, overall_score_100, average_score_10, readiness_verdict, readiness_label,
                    strengths_count, weaknesses_count, category_scores_json, report_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rep_id, demo_user, job_id, intv_id, parent_id, comp, title, level, attempt, mode,
                    score, round(score / 10, 1), verdict, v_label,
                    3 if verdict == "ready" else 1, 0 if verdict == "ready" else 2,
                    json.dumps(cats, ensure_ascii=False), json.dumps(payload, ensure_ascii=False), created, created,
                ),
            )
            conn.execute(
                "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?",
                ("ready" if verdict == "ready" else "practicing", created, job_id),
            )


def refresh_demo_seed() -> None:
    """واجهة عامة تُستدعى عند بدء تشغيل الخادم لتحديث بيانات الحساب التجريبي (مرة واحدة لكل عملية)."""
    global _DEMO_REFRESH_DONE
    if _DEMO_REFRESH_DONE:
        return
    _DEMO_REFRESH_DONE = True
    try:
        _refresh_demo_seed()
    except Exception:
        pass
