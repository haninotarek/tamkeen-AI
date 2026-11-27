import re
from typing import Any, Optional
from app.modules.report.store import safe_load_shared_mock


def _as_dict(val: Any) -> Optional[dict[str, Any]]:
    return val if isinstance(val, dict) else None


def _pick_str(obj: Optional[dict[str, Any]], keys: list[str]) -> Optional[str]:
    if not obj:
        return None
    for k in keys:
        v = obj.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def _pick_num(obj: Optional[dict[str, Any]], keys: list[str]) -> Optional[float]:
    if not obj:
        return None
    for k in keys:
        v = obj.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
        if isinstance(v, str) and v.strip():
            try:
                return float(v.strip())
            except ValueError:
                pass
    return None


def _norm_percent(val: Optional[float], fallback: int) -> int:
    if val is None:
        return fallback
    if 0.0 <= val <= 1.0:
        return round(val * 100)
    if 1.0 < val <= 10.0:
        return round(val * 10)
    return max(0, min(100, round(val)))


def infer_category(raw_cat: Optional[str], question_text: str) -> str:
    c = (raw_cat or "").strip().lower()
    if c:
        if any(w in c for w in ["hr", "intro", "تعارف", "بشرية", "شخصي", "عام"]):
            return "HR"
        if any(w in c for w in ["behav", "situat", "star", "سلوك", "مواقف", "موقف"]):
            return "Behavioral"
        if any(w in c for w in ["tech", "code", "domain", "role", "تقن", "فني", "تخصص", "علمي"]):
            return "Technical"

    q = question_text.lower()
    hr_patterns = [
        "عرفنا بنفسك", "عرف نفسك", "تكلم عن نفسك", "ليه اخترت", "لماذا اخترت",
        "ليه مقدم", "شركتنا", "طموحك", "بعد 5 سنين", "الراتب", "مرتب",
        "tell me about yourself", "why do you want", "why our company", "introduce yourself",
    ]
    if any(p in q for p in hr_patterns):
        return "HR"

    beh_patterns = [
        "احكيلي عن موقف", "احكي عن موقف", "موقف واجهت", "موقف صعب", "ضغط الشغل",
        "ضغط وقت", "خلاف", "اختلاف في الرأي", "مشكلة مع زميل", "تيم", "فريق",
        "غلطة عملتها", "tell me about a time", "describe a situation", "conflict with", "tight deadline",
    ]
    if any(p in q for p in beh_patterns):
        return "Behavioral"

    return "Technical"


def infer_topic_from_question(question_text: str, category: str) -> str:
    cleaned = re.sub(r"[؟?!.!،,\"'«»()]", " ", question_text)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    prefixes = [
        r"^أهلاً[^،.]*\s+",
        r"^ممكن\s+(تشرحلي|تشرح|تقولي|توضحلي|توضح|تحكيلي|تكلمنا عن)\s+",
        r"^(اشرحلي|اشرح لنا|اشرح|وضحلي|وضح|عرفلي|عرّف|ما هو|ما هي|إيه هو|ايه هو|إيه هي|ايه هي|إيه الفرق بين|ايه الفرق بين|ما الفرق بين|إزاي|ازاي|كيف)\s+",
        r"^(احكيلي عن موقف|احكي عن موقف|اذكر موقف|كلمنا عن موقف)\s+",
        r"^(لو عندك|في حالة وجود|بما إننا|سؤال أخير|سؤال متابعة)\s+",
        r"^(can you explain|explain|what is the difference between|what is|what are|how do you|how would you|tell me about a time when|tell me about|describe)\s+",
    ]
    subj = cleaned
    for pat in prefixes:
        subj = re.sub(pat, "", subj, flags=re.IGNORECASE).strip()

    if re.search(r"الفرق بين", cleaned, re.IGNORECASE) and not subj.startswith("الفرق بين"):
        subj = f"الفرق بين {subj}"
    elif re.search(r"difference between", cleaned, re.IGNORECASE) and not subj.lower().startswith("difference"):
        subj = f"Difference between {subj}"

    words = [w for w in subj.split(" ") if w]
    if not words:
        if category == "HR":
            return "التعريف الشخصي والتوافق الوظيفي"
        if category == "Behavioral":
            return "إدارة المواقف والعمل الجماعي"
        return "المهارات التخصصية للوظيفة"

    short_title = " ".join(words[:7])
    return f"{short_title}..." if len(words) > 7 else short_title


def normalize_behavior_metrics(raw: Any) -> Optional[dict[str, Any]]:
    obj = _as_dict(raw)
    if not obj:
        return None

    stress_raw = _pick_num(obj, ["stressLevel", "stress_level", "stress", "stressScore", "anxiety", "التوتر"])
    focus_raw = _pick_num(obj, ["focusLevel", "focus_level", "focus", "focusScore", "attention", "التركيز"])
    conf_raw = _pick_num(obj, ["confidenceLevel", "confidence_level", "confidence", "confidenceScore", "الثقة"])
    eye_raw = _pick_num(obj, ["eyeContactPercent", "eye_contact_percent", "eyeContact", "eye_contact", "gaze", "التواصل_البصري"])
    wpm_raw = _pick_num(obj, ["wordsPerMinute", "words_per_minute", "wpm", "speechRate", "speech_rate", "سرعة_الكلام"])

    filler_count = _pick_num(obj, ["fillerWordsCount", "filler_words_count", "fillerCount", "fillers", "كلمات_الحشو"])
    if filler_count is None and isinstance(obj.get("fillerWords"), list):
        filler_count = float(len(obj["fillerWords"]))
    if filler_count is None and isinstance(obj.get("filler_words"), list):
        filler_count = float(len(obj["filler_words"]))

    expression = (
        _pick_str(obj, ["dominantExpression", "dominant_expression", "expression", "emotion", "faceExpression", "التعبير"])
        or "طبيعي / متزن"
    )

    if all(x is None for x in [stress_raw, focus_raw, conf_raw, eye_raw, wpm_raw, filler_count]):
        return None

    confidence = _norm_percent(conf_raw, 72)
    stress = _norm_percent(stress_raw, max(15, 100 - confidence))
    focus = _norm_percent(focus_raw, 76)

    return {
        "stressLevel": stress,
        "focusLevel": focus,
        "confidenceLevel": confidence,
        "eyeContactPercent": _norm_percent(eye_raw, focus),
        "wordsPerMinute": round(wpm_raw) if wpm_raw is not None else 125,
        "fillerWordsCount": max(0, round(filler_count)) if filler_count is not None else 2,
        "dominantExpression": expression,
        "isProvidedByMember5": True,
    }


def _extract_str_list(val: Any) -> Optional[list[str]]:
    if isinstance(val, list):
        items = [str(x).strip() for x in val if isinstance(x, str) and x.strip()]
        return items or None
    if isinstance(val, str) and val.strip():
        items = [s.strip() for s in re.split(r"[،,;|\n]+", val) if s.strip()]
        return items or None
    return None


def normalize_job_context(body: dict[str, Any]) -> dict[str, Any]:
    nested = (
        _as_dict(body.get("jobContext"))
        or _as_dict(body.get("job_context"))
        or _as_dict(body.get("job"))
        or _as_dict(body.get("jobData"))
        or _as_dict(body.get("jobInfo"))
    )

    company = (
        _pick_str(nested, ["companyName", "company_name", "company", "organization", "الشركة", "اسم_الشركة"])
        or _pick_str(body, ["companyName", "company_name", "company", "organization", "الشركة", "اسم_الشركة"])
        or "الشركة المستهدفة"
    )
    title = (
        _pick_str(nested, ["jobTitle", "job_title", "title", "position", "role", "المسمى", "المسمى_الوظيفي", "الوظيفة"])
        or _pick_str(body, ["jobTitle", "job_title", "title", "position", "role", "المسمى", "المسمى_الوظيفي", "الوظيفة"])
        or "مرشح للوظيفة"
    )
    level = (
        _pick_str(nested, ["jobLevel", "job_level", "level", "seniority", "experienceLevel", "المستوى"])
        or _pick_str(body, ["jobLevel", "job_level", "level", "seniority", "experienceLevel", "المستوى"])
        or "Fresh Graduate"
    )
    jd = (
        _pick_str(nested, ["jobDescription", "job_description", "jd", "JD", "description", "requirements", "الوصف"])
        or _pick_str(body, ["jobDescription", "job_description", "jd", "JD", "description", "requirements", "الوصف"])
        or f"متطلبات ومهارات وظيفة {title} في {company} لمستوى {level}."
    )
    job_id = _pick_str(nested, ["jobId", "job_id", "id"]) or _pick_str(body, ["jobId", "job_id"])

    return {
        "jobId": job_id,
        "companyName": company,
        "jobTitle": title,
        "jobLevel": level,
        "jobDescription": jd,
    }


def normalize_single_qa_item(raw_item: Any, fallback_behavior: Any = None) -> Optional[dict[str, Any]]:
    obj = _as_dict(raw_item)
    if not obj:
        return None

    question = _pick_str(
        obj,
        ["question", "questionText", "question_text", "q", "prompt", "interviewer", "hr", "asked", "السؤال", "سؤال"],
    )
    if not question:
        return None

    user_answer = (
        _pick_str(
            obj,
            [
                "userAnswer", "user_answer", "candidateAnswer", "candidate_answer",
                "answer", "answerText", "answer_text", "a", "response", "reply",
                "candidate", "transcript", "الإجابة", "الاجابة", "إجابة",
            ],
        )
        or ""
    )

    raw_cat = _pick_str(obj, ["category", "questionCategory", "type", "stage", "phase", "التصنيف", "النوع", "المرحلة"])
    category = infer_category(raw_cat, question)
    topic = (
        _pick_str(obj, ["topic", "subject", "skill", "tag", "title", "الموضوع", "المهارة"])
        or infer_topic_from_question(question, category)
    )
    expected = _extract_str_list(
        obj.get("expectedKeyPoints")
        or obj.get("expected_key_points")
        or obj.get("keyPoints")
        or obj.get("rubric")
        or obj.get("keywords")
        or obj.get("النقاط_المتوقعة")
    )

    bm = (
        normalize_behavior_metrics(
            obj.get("behaviorMetrics")
            or obj.get("behavior_metrics")
            or obj.get("behavior")
            or obj.get("metrics")
            or obj.get("السلوك")
        )
        or normalize_behavior_metrics(fallback_behavior)
    )

    return {
        "id": _pick_str(obj, ["id", "questionId", "question_id"]),
        "category": category,
        "topic": topic,
        "question": question,
        "userAnswer": user_answer,
        "expectedKeyPoints": expected,
        "behaviorMetrics": bm,
    }


def _extract_from_role_messages(messages: list[Any], top_behavior: list[Any]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    pending_q: Optional[dict[str, Optional[str]]] = None
    user_buf: list[str] = []

    def flush_pair() -> None:
        nonlocal pending_q, user_buf
        if pending_q and user_buf:
            q_text = pending_q["text"] or ""
            a_text = " ".join(user_buf).strip()
            cat = infer_category(pending_q.get("stage"), q_text)
            topic = infer_topic_from_question(q_text, cat)
            idx = len(result)
            fb = top_behavior[idx] if idx < len(top_behavior) else None
            result.append(
                {
                    "id": None,
                    "category": cat,
                    "topic": topic,
                    "question": q_text,
                    "userAnswer": a_text,
                    "expectedKeyPoints": None,
                    "behaviorMetrics": normalize_behavior_metrics(fb),
                }
            )
        pending_q = None
        user_buf = []

    for m in messages:
        rec = _as_dict(m)
        if not rec:
            continue
        role = (_pick_str(rec, ["role", "sender", "speaker", "author"]) or "").lower()
        content = _pick_str(rec, ["content", "text", "message", "utterance", "النص"])
        if not content:
            continue

        is_interviewer = any(w in role for w in ["assistant", "ai", "hr", "interviewer", "bot", "system_question"])
        is_candidate = any(w in role for w in ["user", "candidate", "applicant", "student", "human"])

        if is_interviewer:
            if pending_q and user_buf:
                flush_pair()
            pending_q = {
                "text": content,
                "stage": _pick_str(rec, ["stage", "category", "type"]),
            }
        elif is_candidate and pending_q:
            user_buf.append(content)

    if pending_q and user_buf:
        flush_pair()
    return result


def extract_raw_qa_list(body: dict[str, Any]) -> list[dict[str, Any]]:
    top_behavior: list[Any] = []
    for k in ["behaviorMetrics", "behavior_metrics", "metricsPerQuestion"]:
        if isinstance(body.get(k), list):
            top_behavior = body[k]
            break

    # 1. مصفوفة عناصر سؤال/إجابة مباشرة
    for key in [
        "qaList", "qa_list", "qas", "qa", "items", "evaluations",
        "questionsAndAnswers", "turns", "responses", "الأسئلة",
    ]:
        arr = body.get(key)
        if isinstance(arr, list) and arr:
            first = _as_dict(arr[0])
            is_role_chat = bool(
                first and isinstance(first.get("role"), str) and not first.get("question") and not first.get("q")
            )
            if not is_role_chat:
                parsed = [
                    normalize_single_qa_item(item, top_behavior[i] if i < len(top_behavior) else None)
                    for i, item in enumerate(arr)
                ]
                clean = [x for x in parsed if x is not None]
                if clean:
                    return clean

    # 2. مصفوفات متوازية questions[] + answers[]
    if isinstance(body.get("questions"), list) and isinstance(body.get("answers"), list) and body["questions"]:
        parsed_par: list[dict[str, Any]] = []
        qs = body["questions"]
        ans = body["answers"]
        for i, q_raw in enumerate(qs):
            a_raw = ans[i] if i < len(ans) else ""
            q_rec = _as_dict(q_raw)
            a_rec = _as_dict(a_raw)
            q_text = q_raw.strip() if isinstance(q_raw, str) else (
                _pick_str(q_rec, ["question", "text", "questionText", "content", "prompt", "السؤال"]) or ""
            )
            a_text = a_raw.strip() if isinstance(a_raw, str) else (
                _pick_str(a_rec, ["userAnswer", "answer", "text", "answerText", "content", "response", "الإجابة"]) or ""
            )
            if not q_text:
                continue
            raw_cat = _pick_str(q_rec, ["category", "type", "stage", "التصنيف"])
            cat = infer_category(raw_cat, q_text)
            topic = _pick_str(q_rec, ["topic", "subject", "skill", "الموضوع"]) or infer_topic_from_question(q_text, cat)
            expected = _extract_str_list(
                (q_rec or {}).get("expectedKeyPoints") or (q_rec or {}).get("keyPoints") or (q_rec or {}).get("rubric")
            )
            bm = (
                normalize_behavior_metrics(
                    (a_rec or {}).get("behaviorMetrics")
                    or (a_rec or {}).get("behavior")
                    or (q_rec or {}).get("behaviorMetrics")
                )
                or normalize_behavior_metrics(top_behavior[i] if i < len(top_behavior) else None)
            )
            parsed_par.append(
                {
                    "id": _pick_str(q_rec, ["id", "questionId"]),
                    "category": cat,
                    "topic": topic,
                    "question": q_text,
                    "userAnswer": a_text,
                    "expectedKeyPoints": expected,
                    "behaviorMetrics": bm,
                }
            )
        if parsed_par:
            return parsed_par

    # 3. مصفوفة questions مدمج بداخلها الإجابات
    if isinstance(body.get("questions"), list) and body["questions"]:
        parsed_q = [
            normalize_single_qa_item(item, top_behavior[i] if i < len(top_behavior) else None)
            for i, item in enumerate(body["questions"])
        ]
        clean_q = [x for x in parsed_q if x is not None]
        if clean_q:
            return clean_q

    # 4. مصفوفة رسائل الشات messages / conversation / transcript
    for chat_key in ["messages", "conversation", "chatHistory", "transcript"]:
        chat_arr = body.get(chat_key)
        if isinstance(chat_arr, list) and chat_arr:
            first = _as_dict(chat_arr[0])
            if first and any(k in first for k in ["question", "q", "interviewer", "hr", "السؤال"]):
                paired = [
                    normalize_single_qa_item(item, top_behavior[i] if i < len(top_behavior) else None)
                    for i, item in enumerate(chat_arr)
                ]
                clean_p = [x for x in paired if x is not None]
                if clean_p:
                    return clean_p

            from_msgs = _extract_from_role_messages(chat_arr, top_behavior)
            if from_msgs:
                return from_msgs

    # 5. سؤال واحد مفرد
    single = normalize_single_qa_item(_as_dict(body.get("qa")) or body, top_behavior[0] if top_behavior else None)
    if single:
        return [single]

    return []


def normalize_generate_report_payload(raw_body: Any) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    body = _as_dict(raw_body)
    if not body:
        return None, "جسم الطلب (Request Body) يجب أن يكون كائن JSON صالحاً."

    unwrapped = body
    for wrapper_key in ["data", "payload", "session"]:
        sub = _as_dict(body.get(wrapper_key))
        if sub and not body.get("qaList") and not body.get("messages"):
            unwrapped = sub
            break

    # دعم إضافي: لو أرسل عضو 3 فقط { "interviewId": "intv_fawry_01" } نسحب بياناتها من shared/mocks/interview.json!
    interview_id = _pick_str(unwrapped, ["interviewId", "interview_id", "sessionId", "session_id", "id"])
    qa_list = extract_raw_qa_list(unwrapped)

    if not qa_list and interview_id:
        for mock_name in ("transcript", "interview"):
            interview_mock = safe_load_shared_mock(mock_name, default={})
            sessions = (
                interview_mock.get("sessions", [])
                if isinstance(interview_mock, dict)
                else (interview_mock if isinstance(interview_mock, list) else [])
            )
            matched = next((s for s in sessions if isinstance(s, dict) and s.get("id") == interview_id), None)
            if matched:
                unwrapped = {**matched, **unwrapped}
                qa_list = extract_raw_qa_list(unwrapped)
                if qa_list:
                    break
            elif isinstance(interview_mock, dict) and interview_mock.get("id") == interview_id:
                unwrapped = {**interview_mock, **unwrapped}
                qa_list = extract_raw_qa_list(unwrapped)
                if qa_list:
                    break

    # دعم إضافي: إذا طلب التوليد بدون جسم أسئلة ولكن يوجد بيانات داخل shared/mocks/transcript.json + job_profile.json + behavior_metrics.json
    if not qa_list and unwrapped.get("useSharedMocks"):
        tr_mock = safe_load_shared_mock("transcript", default={}) or safe_load_shared_mock("interview", default={})
        beh_mock = safe_load_shared_mock("behavior_metrics", default={}) or safe_load_shared_mock("behavior", default={})
        job_mock = safe_load_shared_mock("job_profile", default={}) or safe_load_shared_mock("jobs", default={})
        merged_mock: dict[str, Any] = {}
        if isinstance(job_mock, dict):
            merged_mock.update(job_mock)
        if isinstance(beh_mock, dict):
            merged_mock.update(beh_mock)
        if isinstance(tr_mock, dict):
            merged_mock.update(tr_mock)
        merged_mock.update(unwrapped)
        unwrapped = merged_mock
        qa_list = extract_raw_qa_list(unwrapped)

    if not qa_list:
        return (
            None,
            "لم يتم العثور على أسئلة وإجابات للتقييم داخل الـ Request. يمكنك إرسال qaList أو messages أو questions/answers بأي صيغة.",
        )

    job_context = normalize_job_context(unwrapped)
    candidate_name = (
        _pick_str(
            unwrapped,
            ["candidateName", "candidate_name", "userName", "user_name", "studentName", "name", "اسم_المستخدم", "المرشح"],
        )
        or "مرشح منصة جاهز"
    )
    attempt_num = _pick_num(unwrapped, ["attemptNumber", "attempt_number", "attempt", "tryNumber", "رقم_المحاولة"])
    raw_mode = (_pick_str(unwrapped, ["mode", "interviewMode", "sessionType", "type"]) or "").lower()
    parent_report_id = _pick_str(
        unwrapped,
        ["parentReportId", "parent_report_id", "previousReportId", "parentInterviewId", "parent_interview_id"],
    )

    mode = (
        "weakness_retake"
        if ("retake" in raw_mode or "weak" in raw_mode or bool(parent_report_id))
        else "full"
    )

    return {
        "interviewId": interview_id,
        "candidateName": candidate_name,
        "attemptNumber": max(1, round(attempt_num)) if attempt_num else 1,
        "mode": mode,
        "parentReportId": parent_report_id,
        "jobContext": job_context,
        "qaList": qa_list,
    }, None
