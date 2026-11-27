import asyncio
from datetime import datetime, timezone
import inspect
import json
import re
from urllib.parse import quote
import uuid
from typing import Any, Optional

from app.modules.report.llm_bridge import call_llm_json
from app.modules.report.prompts import (
    build_answer_eval_prompt,
    build_retake_questions_prompt,
    build_study_plan_prompt,
)

STOP_WORDS = {
    "من", "في", "على", "إلى", "الى", "عن", "مع", "هذا", "هذه", "ذلك", "تلك",
    "اللي", "الذي", "التي", "ما", "ماذا", "هل", "كيف", "إزاي", "ازاي", "ليه",
    "لماذا", "متى", "إمتى", "امتى", "فين", "أين", "ايه", "إيه", "هو", "هي",
    "هم", "أنت", "انت", "أنا", "انا", "نحن", "كان", "كانت", "يكون", "تكون",
    "لو", "إذا", "اذا", "أو", "او", "ثم", "بل", "لا", "لم", "لن", "كل", "بعض",
    "جداً", "جدا", "فقط", "بس", "كمان", "أيضاً", "ايضا", "اشرح", "وضح", "اذكر",
    "قولي", "احكيلي", "احكي", "عرفنا", "كلمنا", "سؤال", "الفرق", "بين", "عندك",
    "عندنا", "ممكن", "تتعامل", "تشتغل", "نستخدم", "بتستخدم",
    "what", "how", "why", "when", "where", "which", "who", "the", "and", "for",
    "with", "that", "this", "from", "into", "your", "you", "are", "was", "were",
    "have", "has", "had", "can", "could", "would", "should", "explain", "describe",
    "tell", "about", "difference", "between", "does", "use",
}


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _norm_token(tok: str) -> str:
    t = tok.lower()
    t = re.sub(r"^[أإآ]", "ا", t)
    t = re.sub(r"^ال", "", t)
    t = re.sub(r"ة$", "ه", t)
    t = re.sub(r"ى$", "ي", t)
    return t


def extract_salient_terms(text: str) -> list[str]:
    cleaned = re.sub(r"[؟?!.!،,؛:\"'()\[\]{}<>/\\|+*=~`]", " ", text or "")
    tokens = [t.strip() for t in cleaned.split() if len(t.strip()) >= 3]
    seen: set[str] = set()
    out: list[str] = []
    for tok in tokens:
        low = tok.lower()
        if low in STOP_WORDS:
            continue
        nt = _norm_token(low)
        if len(nt) < 3 or nt in STOP_WORDS:
            continue
        if nt not in seen:
            seen.add(nt)
            out.append(tok)
    return out


async def _call_shared_llm(prompt: str, temperature: float = 0.3) -> Optional[dict[str, Any]]:
    """استدعاء آمن لـ app/core/llm.py أو الجسر المدمج داخل موديول report"""
    return await call_llm_json(prompt, temperature=temperature)


def _verdict_from_score(score: float) -> str:
    if score >= 8.5:
        return "ممتاز"
    if score >= 7.0:
        return "جيد جداً"
    if score >= 5.0:
        return "متوسط"
    return "ضعيف"


def _estimated_behavior(score10: float) -> dict[str, Any]:
    confidence = min(94, max(38, round(score10 * 8.8 + 6)))
    stress = min(85, max(15, round(100 - confidence + 8)))
    focus = min(96, max(52, round(confidence * 0.85 + 14)))
    expr = "واثق وهادئ" if score10 >= 7.5 else ("تركيز متوسط" if score10 >= 5.5 else "متردد / متوتر")
    return {
        "stressLevel": stress,
        "focusLevel": focus,
        "confidenceLevel": confidence,
        "eyeContactPercent": min(92, max(45, confidence - 3)),
        "wordsPerMinute": 130 if score10 >= 7 else 104,
        "fillerWordsCount": 2 if score10 >= 7 else 6,
        "dominantExpression": expr,
        "isProvidedByMember5": False,
    }


def _detect_domain(job: dict[str, Any], extra: str = "") -> str:
    blob = f"{job.get('jobTitle', '')} {job.get('jobDescription', '')} {extra}".lower()
    if re.search(r"data|machine learning|ai|analytics|sql|python|power bi|tableau|بيانات|ذكاء اصطناعي|تحليل البيانات", blob):
        return "data_ai"
    if re.search(r"frontend|backend|fullstack|full-stack|software|developer|react|node|flutter|mobile|devops|qa|cyber|برمج|مطور|ويب|تطبيقات", blob):
        return "software"
    if re.search(r"accountant|accounting|finance|audit|tax|bank|ifrs|محاسب|مالي|مراجعة|ضرائب|بنك|ميزانية|قيد", blob):
        return "finance"
    if re.search(r"marketing|seo|social media|ads|content|brand|copywrit|growth|تسويق|إعلانات|محتوى|مبيعات|sales", blob):
        return "marketing"
    if re.search(r"ui|ux|figma|graphic|product design|مصمم|تصميم|جرافيك", blob):
        return "design"
    if re.search(r"civil|mechanical|electrical|architect|مدني|ميكانيكا|كهرباء|مهندس موقع|إنشائي", blob):
        return "engineering"
    return "general"


def _build_dynamic_model_answer(
    job: dict[str, Any], qa: dict[str, Any], q_terms: list[str]
) -> str:
    cat = qa.get("category", "Technical")
    topic = qa.get("topic", "هذا الموضوع")
    title = job.get("jobTitle", "الوظيفة")
    company = job.get("companyName", "الشركة")
    level = job.get("jobLevel", "Fresh Graduate")

    if cat == "Behavioral":
        return (
            f"في تجربة سابقة واجهت موقفاً يتعلق بـ ({topic}) حيث كان علينا إنجاز المهمة بجودة عالية وفي وقت محدد (Situation & Task). "
            f"بادرت بتحليل المشكلة وتقسيم الأولويات والتنسيق المستمر مع الفريق لتنفيذ الحل خطوة بخطوة (Action)، "
            f"وكانت النتيجة إنجاز المطلوب بنجاح وتحقيق تحسن ملموس في الأداء (Result)."
        )
    if cat == "HR":
        return (
            f"أنا متخصص في مجال {title} بمستوى ({level})، ركزت على بناء أساس عملي قوي من خلال مشاريع تطبيقية حقيقية. "
            f"تابعت دور شركة {company} المميز في السوق، وأسعى لتوظيف مهاراتي لإضافة قيمة سريعة للفريق مع التطور المستمر."
        )

    expected = qa.get("expectedKeyPoints") or []
    if expected:
        concepts = f"مع تغطية النقاط الجوهرية وهي: ({'، '.join(expected)})"
    elif q_terms:
        concepts = f"من خلال توضيح العلاقة الدقيقة بين ({'، '.join(q_terms[:4])}) وآلية عمل كل منها"
    else:
        concepts = "بتوضيح التعريف الدقيق، خطوات التطبيق، ومتى نختار هذا الحل"

    return (
        f"للإجابة باحترافية عن ({topic}) في دور {title}: نبدأ بشرح الهدف العملي للمفهوم {concepts}، "
        f"ثم نوضح أثره على الكفاءة والجودة في بيئة عمل مثل {company}، ونختم بمثال تطبيقي مختصر يثبت الممارسة الفعلية."
    )


def _heuristic_evaluate_answer(job: dict[str, Any], qa: dict[str, Any]) -> dict[str, Any]:
    answer = (qa.get("userAnswer") or "").strip()
    norm_ans = answer.lower()
    words = [w for w in answer.split() if w]
    word_count = len(words)
    cat = qa.get("category", "Technical")
    topic = qa.get("topic", "السؤال")
    question = qa.get("question", "")
    title = job.get("jobTitle", "الوظيفة")
    company = job.get("companyName", "الشركة")

    q_terms = extract_salient_terms(f"{topic} {question}")
    ans_norm_set = {_norm_token(t) for t in extract_salient_terms(answer)}

    unsure_patterns = [
        "مش عارف", "معرفش", "لا أعلم", "لا اعرف", "مسمعتش", "نسيت",
        "معنديش فكرة", "i don't know", "dont know", "no idea", "not sure", "skip",
    ]
    has_unsure = any(p in norm_ans for p in unsure_patterns)

    if word_count == 0 or (has_unsure and word_count < 14):
        sc = 0.0 if word_count == 0 else 1.5
        return {
            "category": cat,
            "topic": topic,
            "question": question,
            "userAnswer": answer or "(لم يتم تقديم إجابة)",
            "scoreOutOf10": sc,
            "verdict": "ضعيف",
            "reason": (
                f"لم يتم تقديم إجابة على سؤال ({topic})."
                if word_count == 0
                else f"أوضحت عدم التأكد دون شرح المفهوم الأساسي لـ ({topic})؛ تحتاج لمذاكرة هذا المحور جيداً قبل المقابلة."
            ),
            "goodPoints": ["الوضوح وعدم ادعاء معلومة غير صحيحة"] if word_count > 0 else [],
            "missingPoints": qa.get("expectedKeyPoints")
            or [
                f"توضيح المفهوم الجوهري لـ ({topic})",
                "شرح كيفية التطبيق العملي في بيئة العمل",
                "ذكر مثال محدد يدعم الإجابة",
            ],
            "modelAnswer": _build_dynamic_model_answer(job, qa, q_terms),
        }

    clean_q = re.sub(r"[؟?!.!،,]", "", question).strip().lower()
    clean_a = re.sub(r"[؟?!.!،,]", "", answer).strip().lower()
    if clean_a == clean_q or (word_count <= 14 and clean_a in clean_q):
        return {
            "category": cat,
            "topic": topic,
            "question": question,
            "userAnswer": answer,
            "scoreOutOf10": 2.0,
            "verdict": "ضعيف",
            "reason": f"الإجابة أعادت صياغة ألفاظ السؤال دون تقديم شرح حقيقي أو خطوات عملية لموضوع ({topic}).",
            "goodPoints": [],
            "missingPoints": [
                f"شرح معنى وآلية ({topic}) بأسلوبك الخاص",
                "توضيح السبب والأثر العملي بمثال واقعي",
            ],
            "modelAnswer": _build_dynamic_model_answer(job, qa, q_terms),
        }

    score = 3.5
    good_points: list[str] = []
    missing_points: list[str] = []

    unique_ratio = len(ans_norm_set) / max(1, word_count)
    if word_count >= 38 and unique_ratio >= 0.4:
        score += 2.2
        good_points.append("إجابة وافية ومفصلة تعرض الفكرة بتسلسل منطقي واضح")
    elif word_count >= 20 and unique_ratio >= 0.4:
        score += 1.7
        good_points.append("صياغة مركزة ومباشرة تغطي صلب السؤال بدون حشو زائد")
    elif word_count >= 11:
        score += 0.8
        missing_points.append("تحتاج الإجابة إلى تفصيل أعمق وشرح خطوات أو أمثلة أوضح")
    else:
        score -= 0.5
        missing_points.append("الإجابة مقتضبة جداً ولا تكفي لإقناع المحاور بتمكنك من الموضوع")

    expected = qa.get("expectedKeyPoints") or []
    if expected:
        matched_count = 0
        for kp in expected:
            kp_terms = extract_salient_terms(kp)
            hit = bool(kp_terms) and any(
                t.lower() in norm_ans or _norm_token(t) in ans_norm_set for t in kp_terms
            )
            if hit:
                matched_count += 1
            else:
                missing_points.append(f"إغفال نقطة مهمة: {kp}")
        cov = matched_count / len(expected)
        score += cov * 3.2
        if cov >= 0.65:
            good_points.append(f"تغطية دقيقة لمعظم العناصر المطلوبة في ({topic})")
    elif q_terms:
        matched_terms = [
            t for t in q_terms if t.lower() in norm_ans or _norm_token(t) in ans_norm_set
        ]
        ratio = len(matched_terms) / len(q_terms)
        score += min(1.8, ratio * 1.8)
        if re.search(r"الفرق بين|مقارنة بين|difference between|\bvs\b", question, re.IGNORECASE) and len(matched_terms) >= 2:
            score += 1.0
            good_points.append(
                f"تناول طرفي المقارنة المذكورين في السؤال ({matched_terms[0]} و {matched_terms[1]}) بوضوح"
            )
        elif not matched_terms:
            missing_points.append(
                f"ربط الإجابة مباشرة بالمفاهيم المحددة في السؤال ({'، '.join(q_terms[:3])})"
            )

    reasoning_markers = [
        "لأن", "عشان", "بسبب", "وبالتالي", "نتيجة", "بينما", "في حين", "مقابل",
        "أولاً", "ثانياً", "خطوة", "يمنع", "يحسن", "يقلل", "يزيد", "تعتمد", "تستخدم",
        "بتحفظ", "بيحفظ", "مرجع", "قيمة", "بدل", "حماية", "أمان", "سرعة", "كفاءة",
        "because", "therefore", "whereas", "while", "prevents", "improves", "reduces",
        "first", "second", "instead of", "ensures",
    ]
    r_hits = sum(1 for m in reasoning_markers if m in norm_ans)
    if r_hits >= 2:
        score += min(1.8, r_hits * 0.55)
        good_points.append("تفسير السبب والآلية العملية بدلاً من الاكتفاء بسرد تعريفي جامد")
    elif cat == "Technical":
        missing_points.append("توضيح (لماذا وكيف) يعمل هذا المفهوم ومتى نفضله على البدائل")

    if cat == "Behavioral":
        action_signals = [
            "عملت", "قمت", "بدأت", "قسمت", "اقترحت", "تواصلت", "حليت", "نفذت", "قررت",
            "مشروع", "تدريب", "تيم", "فريق", "النتيجة", "نجحنا", "سلمنا",
            "implemented", "decided", "resolved", "led", "result", "project", "team",
        ]
        s_hits = sum(1 for s in action_signals if s in norm_ans)
        if s_hits >= 3:
            score += 1.4
            good_points.append("عرض موقف واقعي محدد مع إبراز دورك الشخصي والنتيجة (منهجية STAR)")
        else:
            score = min(score, 6.0)
            missing_points.insert(
                0, "تطبيق منهجية STAR بذكر واقعة حقيقية محددة (الموقف، المهمة، ما فعلته أنت، والنتيجة)"
            )
    elif cat == "HR":
        comp_tokens = extract_salient_terms(company)
        if any(ct.lower() in norm_ans for ct in comp_tokens):
            score += 0.9
            good_points.append(f"إظهار اهتمام حقيقي وربط الإجابة بشركة ({company})")
        else:
            missing_points.append(f"ربط دوافعك ومهاراتك بطبيعة عمل شركة ({company}) ومتطلبات دور {title}")

    if re.search(r"مثال|مثلاً|سبيل المثال|تجربتي|مشروع|عملياً|for example|e\.g\.|\d+%?", norm_ans):
        score += 0.7
        good_points.append("دعم الإجابة بمثال تطبيقي أو مؤشر رقمي يعزز الإقناع")
    elif score < 8.5:
        missing_points.append("إضافة مثال عملي سريع من مشروع سابق أو حالة واقعية للوصول للدرجة النهائية")

    if has_unsure:
        score = min(score, 4.5)
        missing_points.insert(0, "التخلص من عبارات التردد وبناء الإجابة على المفاهيم المؤكدة لديك")

    clamped = round(min(9.5, max(1.5, score)) * 2) / 2
    verdict = _verdict_from_score(clamped)

    if not good_points:
        good_points.append("محاولة الإجابة المباشرة في إطار موضوع السؤال")

    if clamped >= 8.5:
        reason = f"إجابة ممتازة ومتمكنة ({clamped}/10)؛ شرحت جوهر ({topic}) بدقة ووضحت السبب العملي بأسلوب منظم يناسب تماماً متطلبات وظيفة {title}."
    elif clamped >= 7.0:
        reason = f"إجابة جيدة جداً ({clamped}/10)؛ غطّت الفكرة الصحيحة لموضوع ({topic})، ويمكن رفعها للعلامة الكاملة بإضافة مثال تطبيقي من الواقع."
    elif clamped >= 5.0:
        first_miss = missing_points[0] if missing_points else "الأمثلة العملية"
        reason = f"إجابة متوسطة ({clamped}/10)؛ تناولت جانباً عاماً من ({topic}) لكنها افتقدت التفصيل الدقيق و{first_miss}."
    else:
        reason = f"إجابة ضعيفة تحتاج لمراجعة ({clamped}/10)؛ لم تغطِّ الركائز الأساسية لموضوع ({topic}) المطلوبة من مرشح لوظيفة {title}."

    return {
        "category": cat,
        "topic": topic,
        "question": question,
        "userAnswer": answer,
        "scoreOutOf10": clamped,
        "verdict": verdict,
        "reason": reason,
        "goodPoints": list(dict.fromkeys(good_points))[:3],
        "missingPoints": list(dict.fromkeys(missing_points))[:3],
        "modelAnswer": _build_dynamic_model_answer(job, qa, q_terms),
    }


async def evaluate_single_answer(
    job: dict[str, Any], qa: dict[str, Any], question_index: int = 1
) -> dict[str, Any]:
    prompt = build_answer_eval_prompt(job, qa)
    llm_res = await _call_shared_llm(prompt, temperature=0.25)

    if llm_res and isinstance(llm_res.get("scoreOutOf10"), (int, float)):
        clean_score = round(min(10.0, max(0.0, float(llm_res["scoreOutOf10"]))) * 2) / 2
        bm = qa.get("behaviorMetrics") or _estimated_behavior(clean_score)
        return {
            "id": qa.get("id") or _uid("qeval"),
            "questionIndex": question_index,
            "category": qa.get("category", "Technical"),
            "topic": qa.get("topic", "السؤال"),
            "question": qa.get("question", ""),
            "userAnswer": qa.get("userAnswer", ""),
            "scoreOutOf10": clean_score,
            "verdict": llm_res.get("verdict") or _verdict_from_score(clean_score),
            "reason": llm_res.get("reason", ""),
            "goodPoints": llm_res.get("goodPoints") or [],
            "missingPoints": llm_res.get("missingPoints") or [],
            "modelAnswer": llm_res.get("modelAnswer")
            or _build_dynamic_model_answer(job, qa, extract_salient_terms(qa.get("question", ""))),
            "behaviorMetrics": bm,
        }

    fallback = _heuristic_evaluate_answer(job, qa)
    bm = qa.get("behaviorMetrics") or _estimated_behavior(fallback["scoreOutOf10"])
    return {
        "id": qa.get("id") or _uid("qeval"),
        "questionIndex": question_index,
        **fallback,
        "behaviorMetrics": bm,
    }


async def build_weakness_study_pack(
    job: dict[str, Any],
    topic: str,
    category: str,
    diagnosis: str,
    original_question: str = "",
    missing_points: Optional[list[str]] = None,
) -> dict[str, Any]:
    missing_points = missing_points or []
    llm_pack = await _call_shared_llm(
        build_study_plan_prompt(job, topic, category, diagnosis), temperature=0.35
    )
    if llm_pack and llm_pack.get("studySummary") and isinstance(llm_pack.get("resources"), list) and llm_pack["resources"]:
        return {
            "studySummary": llm_pack["studySummary"],
            "resources": [
                {**r, "id": _uid("res"), "completed": False} for r in llm_pack["resources"]
            ],
            "practiceQuestions": [
                {**pq, "id": _uid("pq")} for pq in (llm_pack.get("practiceQuestions") or [])
            ],
        }

    title = job.get("jobTitle", "الوظيفة")
    company = job.get("companyName", "الشركة")
    domain = _detect_domain(job, f"{topic} {original_question}")

    if category == "Behavioral":
        q_focus = quote(f"{topic} STAR method interview بالعربي")
        return {
            "studySummary": (
                f"لإتقان محور ({topic}) في المقابلات السلوكية، اعتمد على هيكل STAR الرباعي: "
                "(1) الموقف والسياق في جملة، (2) المهمة المطلوبة منك، (3) الخطوات المحددة التي نفذتها أنت بنفسك، "
                "(4) النتيجة الإيجابية بالأرقام وما تعلمته."
            ),
            "resources": [
                {
                    "id": _uid("res"),
                    "title": "دليل جامعة MIT الرسمي لهيكلة الإجابات السلوكية بطريقة STAR",
                    "type": "guide",
                    "typeLabel": "دليل تطبيقي",
                    "provider": "MIT Career Advising",
                    "url": "https://capd.mit.edu/resources/the-star-method-for-behavioral-interviews/",
                    "estimatedMinutes": 12,
                    "whyRecommended": "يشرح بالأمثلة كيف تحوّل مواقف الدراسة أو التدريب إلى قصة احترافية مقنعة.",
                    "completed": False,
                },
                {
                    "id": _uid("res"),
                    "title": f"شروحات وأمثلة عملية لأسئلة ({topic}) في المقابلات",
                    "type": "video",
                    "typeLabel": "فيديو شرح",
                    "provider": "YouTube التعليمي",
                    "url": f"https://www.youtube.com/results?search_query={q_focus}",
                    "estimatedMinutes": 15,
                    "whyRecommended": "يعرض نماذج حية للإجابة بثقة وبدون إطالة.",
                    "completed": False,
                },
            ],
            "practiceQuestions": [
                {
                    "id": _uid("pq"),
                    "question": f"اذكر موقفاً عملياً حقيقياً واجهت فيه تحدياً يخص ({topic}) أثناء مشروع أو تدريب سابق؛ ماذا فعلت تحديداً وما النتيجة؟",
                    "difficulty": "متوسط",
                    "hint": "قسّم إجابتك إلى: الموقف ← المهمة ← خطواتك الشخصية ← النتيجة الملموسة.",
                    "expectedKeyPoints": [
                        "تحديد سياق ومشروع حقيقي محدد (Situation & Task)",
                        "توضيح القرارات والخطوات التي قمت أنت بتنفيذها (Action)",
                        "ذكر النتيجة النهائية والأثر الإيجابي (Result)",
                    ],
                    "sampleAnswer": (
                        f"خلال عملي على مشروع سابق واجهنا تحدياً مباشراً في ({topic}) كاد يؤخر التسليم (Situation/Task). "
                        "بادرت بتحديد أصل المشكلة وإعادة تنظيم خطوات التنفيذ بالتنسيق مع الفريق ومتابعة الإنجاز يومياً (Action)، "
                        "مما أدى لإتمام العمل في الموعد المحدد بجودة عالية (Result)."
                    ),
                }
            ],
        }

    hub_map = {
        "software": ("MDN / DevDocs Search", "توثيق تقني", "official documentation guide"),
        "data_ai": ("Kaggle / Data Science Guides", "مرجع علوم بيانات", "data science guide examples"),
        "finance": ("Corporate Finance Institute / المعايير المالية", "مرجع مالي ومحاسبي", "شرح محاسبة ومالية corporate finance"),
        "marketing": ("HubSpot / Google Skillshop", "دليل تسويق رقمي", "digital marketing strategy guide"),
        "design": ("Nielsen Norman Group / Figma Learn", "مرجع تصميم UX/UI", "UX UI design best practices"),
        "engineering": ("Engineering Reference & Standards", "مرجع هندسي تطبيقي", "engineering practical guide"),
        "general": ("Indeed Career & Specialist Guide", "دليل مهني متخصص", "interview guide best practices"),
    }
    provider_name, type_label, search_suffix = hub_map.get(domain, hub_map["general"])
    yt_q = quote(f"{topic} {title} شرح")
    hub_q = quote(f"{topic} {title} {search_suffix}")
    intv_q = quote(f"{topic} أسئلة انترفيو {title}")
    miss_focus = (
        f"خصوصاً النقاط التي فاتتك في المقابلة وهي: ({'، '.join(missing_points)})"
        if missing_points
        else f"مع التركيز على الفهم العملي وربط المفهوم بمهام {title}"
    )

    return {
        "studySummary": (
            f"لإتقان محور ({topic}) المطلوب لوظيفة {title} في {company}، ابدأ بفهم الفكرة الجوهرية والهدف العملي منها، "
            f"ثم راجع متى وكيف تُطبّق في الواقع المهني {miss_focus}، وجهّز مثالاً عملياً واضحاً تشرحه بثقة."
        ),
        "resources": [
            {
                "id": _uid("res"),
                "title": f"شرح تفصيلي مبسط لموضوع ({topic}) لتخصص {title}",
                "type": "video",
                "typeLabel": "فيديو شرح",
                "provider": "YouTube التعليمي",
                "url": f"https://www.youtube.com/results?search_query={yt_q}",
                "estimatedMinutes": 18,
                "whyRecommended": f"يبني لديك الفهم الأساسي السريع لـ ({topic}) بالصوت والصورة مع أمثلة تطبيقية.",
                "completed": False,
            },
            {
                "id": _uid("res"),
                "title": f"المرجع التطبيقي وأفضل الممارسات في ({topic})",
                "type": "docs",
                "typeLabel": type_label,
                "provider": provider_name,
                "url": f"https://www.google.com/search?q={hub_q}",
                "estimatedMinutes": 15,
                "whyRecommended": f"يغطي التفاصيل الدقيقة والمعايير المهنية التي يسأل عنها المحاورون في مجال {title}.",
                "completed": False,
            },
            {
                "id": _uid("res"),
                "title": f"أهم أسئلة المقابلات المتوقعة وإجاباتها في ({topic})",
                "type": "article",
                "typeLabel": "أسئلة مقابلات",
                "provider": "بنك المقابلات المهنية",
                "url": f"https://www.google.com/search?q={intv_q}",
                "estimatedMinutes": 12,
                "whyRecommended": "يدربك على الصياغات المختلفة لنفس السؤال حتى لا تتفاجأ بطريقة طرح المحاور.",
                "completed": False,
            },
        ],
        "practiceQuestions": [
            {
                "id": _uid("pq"),
                "question": f"اشرح مفهوم ({topic}) بأسلوب واضح، وكيف توظفه عملياً أثناء عملك كـ {title} في {company}؟",
                "difficulty": "متوسط",
                "hint": "ابدأ بالتعريف الدقيق ثم اشرح الفائدة العملية وأنهِ إجابتك بمثال واقعي.",
                "expectedKeyPoints": missing_points
                or [
                    f"توضيح الفكرة الأساسية لـ ({topic}) بدقة",
                    f"شرح خطوات التطبيق العملي في دور {title}",
                    "إعطاء مثال واقعي يوضح النتيجة والأثر",
                ],
                "sampleAnswer": (
                    f"يرتكز ({topic}) على تحقيق أعلى دقة وكفاءة في مهام {title} عبر فهم القواعد الأساسية وتطبيقها المنهجي. "
                    f"في مشاريعي العملية أحرص على تحليل المتطلبات أولاً ثم تطبيق أفضل الممارسات المتعلقة بـ ({topic}) والتحقق من جودة النتائج بالأرقام."
                ),
            },
            {
                "id": _uid("pq"),
                "question": f"ما أبرز الأخطاء الشائعة عند التعامل مع ({topic})؟ وكيف تتفاداها لضمان أفضل نتيجة؟",
                "difficulty": "متقدم",
                "hint": "اذكر خطأً شائعاً يقع فيه حديثو التخرج، واشرح الأسلوب الصحيح لتفاديه.",
                "expectedKeyPoints": [
                    f"تحديد خطأ عملي شائع مرتبط بـ ({topic})",
                    "توضيح آلية المراجعة أو الوقاية الصحيحة",
                ],
                "sampleAnswer": (
                    f"من الأخطاء الشائعة تطبيق ({topic}) بشكل سطحي دون مراعاة سياق المشكلة أو قياس الأثر. "
                    "أتفادى ذلك بمراجعة المعايير القياسية للتخصص والتحقق من الحالات الحرجة قبل اعتماد الحل النهائي."
                ),
            },
        ],
    }


async def generate_full_report(
    inp: dict[str, Any], previous_score_100: Optional[int] = None
) -> dict[str, Any]:
    job = inp["jobContext"]
    qa_list = inp["qaList"]

    evaluations = await asyncio.gather(
        *[evaluate_single_answer(job, qa, i + 1) for i, qa in enumerate(qa_list)]
    )
    evaluations = list(evaluations)

    avg_score_10 = (
        round(sum(e["scoreOutOf10"] for e in evaluations) / len(evaluations), 1)
        if evaluations
        else 0.0
    )

    def by_cat(cat: str) -> Optional[int]:
        items = [e for e in evaluations if e["category"] == cat]
        if not items:
            return None
        return round((sum(e["scoreOutOf10"] for e in items) / len(items)) * 10)

    has_member5 = any(
        e.get("behaviorMetrics", {}).get("isProvidedByMember5") is True
        for e in evaluations
    )

    behavior_confidence = (
        round(
            sum(
                e["behaviorMetrics"]["confidenceLevel"] * 0.45
                + e["behaviorMetrics"]["focusLevel"] * 0.35
                + (100 - e["behaviorMetrics"]["stressLevel"]) * 0.2
                for e in evaluations
            )
            / len(evaluations)
        )
        if evaluations
        else 70
    )

    overall_score_100 = (
        round(avg_score_10 * 10 * 0.85 + behavior_confidence * 0.15)
        if has_member5
        else round(avg_score_10 * 10)
    )
    stars = round((overall_score_100 / 20.0) * 2) / 2

    strengths = [
        {
            "id": _uid("str"),
            "title": f"تمكن واضح في: {e['topic']}",
            "category": e["category"],
            "description": (e["goodPoints"][0] if e["goodPoints"] else e["reason"]),
            "scoreHighlight": f"{e['scoreOutOf10']} / 10",
        }
        for e in evaluations
        if e["scoreOutOf10"] >= 7.0
    ]

    if has_member5 and behavior_confidence >= 72:
        strengths.append(
            {
                "id": _uid("str"),
                "title": "ثبات انفعالي وتركيز بصري جيد أمام الكاميرا",
                "category": "Behavior",
                "description": f"أظهرت بيانات الكاميرا والصوت (عضو 5) مستوى ثقة وتركيز بنسبة {behavior_confidence}% أثناء الإجابة.",
                "scoreHighlight": f"{behavior_confidence}% ثقة",
            }
        )

    if not strengths:
        strengths.append(
            {
                "id": _uid("str"),
                "title": "خوض التجربة الكاملة وتحديد خريطة التعلم بدقة",
                "category": "HR",
                "description": "أتممت أسئلة المقابلة مما مكن النظام من تشخيص الفجوات الفعلية وتجهيز مصادر مذاكرة مخصصة لكل نقطة.",
            }
        )

    weak_evals = [e for e in evaluations if e["scoreOutOf10"] < 7.0]

    async def _make_weakness(we: dict[str, Any]) -> dict[str, Any]:
        diag = (
            f"حصلت على ({we['scoreOutOf10']}/10) بسبب نقص في: {'، '.join(we['missingPoints'])}."
            if we.get("missingPoints")
            else we["reason"]
        )
        pack = await build_weakness_study_pack(
            job,
            we["topic"],
            we["category"],
            diag,
            we["question"],
            we.get("missingPoints") or [],
        )
        return {
            "id": _uid("weak"),
            "topic": we["topic"],
            "category": we["category"],
            "severity": "عالية" if we["scoreOutOf10"] < 5.0 else "متوسطة",
            "relatedQuestionId": we["id"],
            "originalScore10": we["scoreOutOf10"],
            "diagnosis": diag,
            "studySummary": pack["studySummary"],
            "isMastered": False,
            "resources": pack["resources"],
            "practiceQuestions": pack["practiceQuestions"],
        }

    weaknesses = list(await asyncio.gather(*[_make_weakness(we) for we in weak_evals]))

    has_high = any(w["severity"] == "عالية" for w in weaknesses)
    if overall_score_100 >= 75 and not weaknesses:
        verdict = "ready"
        label = "اتمكنت! جاهز للتقديم والمقابلة الحقيقية"
    elif overall_score_100 >= 70 and not has_high:
        verdict = "almost_ready"
        label = "قريب جداً من الجاهزية — راجع النقاط البسيطة المتبقية"
    else:
        verdict = "needs_study"
        label = "محتاج مذاكرة نقاط الضعف وإعادة الإنترفيو"

    exec_summary = (
        f"أداء متميز في مقابلة ({job['jobTitle']}) لشركة ({job['companyName']})! حققت متوسط {avg_score_10}/10 وتجاوزت جميع المحاور بنجاح دون نقاط ضعف."
        if verdict == "ready"
        else f"حققت نتيجة إجمالية {overall_score_100}% (متوسط إجابات {avg_score_10}/10) لوظيفة {job['jobTitle']} في {job['companyName']}. لديك {len(weaknesses)} نقاط ضعف محددة تم تجهيز ملخصات ومصادر مذاكرة وأسئلة تدريب لها لتتمكن من إعادة الإنترفيو عليها فقط."
    )

    llm_status = core_llm.get_llm_status() if hasattr(core_llm, "get_llm_status") else {"active": False}

    return {
        "id": _uid("rep"),
        "interviewId": inp.get("interviewId") or _uid("intv"),
        "candidateName": inp.get("candidateName") or "مرشح منصة جاهز",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "attemptNumber": inp.get("attemptNumber", 1),
        "mode": inp.get("mode", "full"),
        "parentReportId": inp.get("parentReportId"),
        "previousScore100": previous_score_100,
        "evaluationEngineUsed": "llm" if llm_status.get("active") else "smart-dynamic",
        "behaviorDataSource": "member5" if has_member5 else "estimated",
        "jobContext": job,
        "overallScore100": overall_score_100,
        "averageScore10": avg_score_10,
        "stars": stars,
        "readinessVerdict": verdict,
        "readinessLabel": label,
        "executiveSummary": exec_summary,
        "categoryScores": {
            "hr": by_cat("HR"),
            "behavioral": by_cat("Behavioral"),
            "technical": by_cat("Technical"),
            "behaviorConfidence": behavior_confidence,
        },
        "strengths": strengths,
        "weaknesses": weaknesses,
        "questionEvaluations": evaluations,
    }


async def generate_weakness_retake_session(
    report: dict[str, Any], selected_weakness_ids: Optional[list[str]] = None
) -> dict[str, Any]:
    all_weaknesses = report.get("weaknesses", [])
    target_weaknesses = (
        [w for w in all_weaknesses if w["id"] in selected_weakness_ids]
        if selected_weakness_ids
        else all_weaknesses
    )

    llm_retake = await _call_shared_llm(
        build_retake_questions_prompt(report["jobContext"], target_weaknesses),
        temperature=0.4,
    )
    llm_qs = (llm_retake or {}).get("questions") or []

    questions = []
    for idx, w in enumerate(target_weaknesses):
        lq = llm_qs[idx] if idx < len(llm_qs) and isinstance(llm_qs[idx], dict) else {}
        first_pq = (w.get("practiceQuestions") or [{}])[0]
        questions.append(
            {
                "id": _uid("retake_q"),
                "weaknessId": w["id"],
                "category": w["category"],
                "topic": w["topic"],
                "question": lq.get("question")
                or first_pq.get("question")
                or f"سؤال إعادة مخصص في ({w['topic']}): اشرح المفهوم الأساسي وكيف تطبقه عملياً في دور {report['jobContext']['jobTitle']} داخل {report['jobContext']['companyName']}؟",
                "expectedKeyPoints": lq.get("expectedKeyPoints")
                or first_pq.get("expectedKeyPoints")
                or [
                    f"توضيح الفكرة الأساسية لـ ({w['topic']}) بدقة",
                    "شرح خطوات التطبيق العملي وتجنب الأخطاء السابقة",
                    "ذكر مثال واقعي واضح",
                ],
                "previousScore10": w["originalScore10"],
                "sampleStrongAnswer": lq.get("sampleStrongAnswer")
                or first_pq.get("sampleAnswer")
                or f"في عملي كـ {report['jobContext']['jobTitle']} أطبق ({w['topic']}) بشكل منهجي من خلال تحديد المتطلبات أولاً ثم تنفيذ الحل القياسي والتحقق من دقة النتيجة بمثال عملي ملموس.",
            }
        )

    return {
        "retakeSessionId": _uid("retake_sess"),
        "parentReportId": report["id"],
        "parentInterviewId": report["interviewId"],
        "attemptNumber": report.get("attemptNumber", 1) + 1,
        "mode": "weakness_retake",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "jobContext": report["jobContext"],
        "targetedWeaknesses": [
            {
                "weaknessId": w["id"],
                "topic": w["topic"],
                "category": w["category"],
                "previousScore10": w["originalScore10"],
            }
            for w in target_weaknesses
        ],
        "questions": questions,
    }
