from typing import Any
from fastapi import APIRouter, HTTPException, Request
from app.modules.report.llm_bridge import (
    get_llm_status,
    get_runtime_llm_config,
    save_runtime_llm_config,
)
from app.modules.report.evaluator import (
    evaluate_single_answer,
    generate_full_report,
    generate_weakness_retake_session,
)
from app.modules.report.normalizer import (
    normalize_generate_report_payload,
    normalize_job_context,
    normalize_single_qa_item,
)
from app.modules.report.store import (
    delete_report,
    get_all_reports,
    get_report_by_id,
    get_retake_session_by_id,
    save_report,
    save_retake_session,
)

# الراوتر الرسمي الخاص بـ (عضو 6 — التقييم والمذاكرة) داخل backend/app/modules/report/router.py
router = APIRouter(tags=["Member 6 - Report & Study"])


@router.get("")
@router.get("/")
async def list_reports() -> dict[str, Any]:
    return {"reports": get_all_reports()}


@router.get("/llm/status")
async def llm_status() -> dict[str, Any]:
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


@router.post("/llm/config")
async def update_llm_config(request: Request) -> dict[str, Any]:
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


@router.post("/evaluate-answer")
async def api_evaluate_single_answer(request: Request) -> dict[str, Any]:
    try:
        raw_body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="يجب إرسال JSON صالح")

    if not isinstance(raw_body, dict):
        raise HTTPException(status_code=400, detail="يجب إرسال كائن JSON للسؤال والإجابة")

    job_ctx = normalize_job_context(raw_body)
    qa = normalize_single_qa_item(raw_body.get("qa") or raw_body.get("item") or raw_body)
    if not qa:
        raise HTTPException(
            status_code=400,
            detail="لم يتم العثور على نص السؤال؛ أرسل question أو q أو السؤال مع answer أو userAnswer",
        )

    q_idx = raw_body.get("questionIndex", 1)
    evaluation = await evaluate_single_answer(
        job_ctx, qa, int(q_idx) if isinstance(q_idx, int) else 1
    )
    return {"evaluation": evaluation, "normalizedJobContext": job_ctx}


@router.post("")
@router.post("/")
@router.post("/generate")
async def api_generate_report(request: Request) -> dict[str, Any]:
    try:
        raw_body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="جسم الطلب يجب أن يكون JSON صالحاً")

    normalized, err = normalize_generate_report_payload(raw_body)
    if err or not normalized:
        raise HTTPException(status_code=400, detail=err or "بيانات غير صالحة")

    prev_score = None
    if normalized.get("parentReportId"):
        parent = get_report_by_id(normalized["parentReportId"])
        if parent:
            prev_score = parent.get("overallScore100")

    report = await generate_full_report(normalized, prev_score)
    save_report(report)
    return {
        "report": report,
        "reportUrl": f"/report/{report['id']}",
        "studyUrl": f"/study/{report['id']}",
        "normalizedQuestionsCount": len(normalized["qaList"]),
    }


@router.get("/retake-session/{session_id}")
async def api_get_retake_session(session_id: str) -> dict[str, Any]:
    sess = get_retake_session_by_id(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="جلسة إعادة الإنترفيو غير موجودة")
    return {"session": sess}


@router.get("/{report_id}")
async def api_get_report(report_id: str) -> dict[str, Any]:
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="التقرير المطلوب غير موجود")
    return {"report": report}


@router.delete("/{report_id}")
async def api_delete_report(report_id: str) -> dict[str, Any]:
    ok = delete_report(report_id)
    if not ok:
        raise HTTPException(status_code=404, detail="التقرير غير موجود لحذفه")
    return {"ok": True}


@router.patch("/{report_id}/study-progress")
async def api_update_study_progress(report_id: str, request: Request) -> dict[str, Any]:
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="التقرير غير موجود")

    body = await request.json()
    weakness_id = body.get("weaknessId")
    resource_id = body.get("resourceId")
    completed = body.get("completed")
    is_mastered = body.get("isMastered")

    weakness = next(
        (w for w in report.get("weaknesses", []) if w.get("id") == weakness_id), None
    )
    if not weakness:
        raise HTTPException(status_code=404, detail="نقطة الضعف غير موجودة")

    if resource_id is not None and isinstance(completed, bool):
        res_item = next(
            (r for r in weakness.get("resources", []) if r.get("id") == resource_id),
            None,
        )
        if res_item:
            res_item["completed"] = completed
        resources = weakness.get("resources", [])
        if resources and all(r.get("completed") for r in resources):
            weakness["isMastered"] = True

    if isinstance(is_mastered, bool):
        weakness["isMastered"] = is_mastered

    save_report(report)
    return {"report": report}


@router.post("/{report_id}/practice-eval")
async def api_evaluate_practice_question(
    report_id: str, request: Request
) -> dict[str, Any]:
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="التقرير غير موجود")

    body = await request.json()
    weakness_id = body.get("weaknessId")
    pq_id = body.get("practiceQuestionId")
    user_answer = (body.get("userAnswer") or "").strip()

    weakness = next(
        (w for w in report.get("weaknesses", []) if w.get("id") == weakness_id), None
    )
    pq = next(
        (
            p
            for p in (weakness or {}).get("practiceQuestions", [])
            if p.get("id") == pq_id
        ),
        None,
    )
    if not weakness or not pq:
        raise HTTPException(status_code=404, detail="سؤال التدريب غير موجود")

    evaluation = await evaluate_single_answer(
        report["jobContext"],
        {
            "category": weakness["category"],
            "topic": weakness["topic"],
            "question": pq["question"],
            "userAnswer": user_answer,
            "expectedKeyPoints": pq.get("expectedKeyPoints"),
        },
        1,
    )

    pq["lastUserAnswer"] = user_answer
    pq["lastScore10"] = evaluation["scoreOutOf10"]
    pq["lastFeedback"] = evaluation["reason"]

    if evaluation["scoreOutOf10"] >= 7.5:
        weakness["isMastered"] = True

    save_report(report)
    return {"evaluation": evaluation, "report": report}


@router.post("/{report_id}/retake")
async def api_create_weakness_retake(report_id: str, request: Request) -> dict[str, Any]:
    report = get_report_by_id(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="التقرير غير موجود")

    if not report.get("weaknesses"):
        raise HTTPException(
            status_code=400,
            detail="لا توجد نقاط ضعف في هذا التقرير؛ أنت جاهز تماماً للمقابلة!",
        )

    selected_ids = None
    try:
        body = await request.json()
        if isinstance(body, dict) and isinstance(body.get("selectedWeaknessIds"), list) and body["selectedWeaknessIds"]:
            selected_ids = body["selectedWeaknessIds"]
    except Exception:
        pass

    session = await generate_weakness_retake_session(report, selected_ids)
    save_retake_session(session)
    return {
        "session": session,
        "nextUrl": f"/retake/{session['retakeSessionId']}",
        "member3IntegrationNote": "يُمرر كائن session مباشرة إلى موديول interview/ لدى (عضو 3) لبدء مقابلة مخصصة على نقاط الضعف فقط.",
    }
