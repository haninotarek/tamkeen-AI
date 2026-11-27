from typing import Any


def build_answer_eval_prompt(job: dict[str, Any], qa: dict[str, Any]) -> str:
    expected = qa.get("expectedKeyPoints") or []
    expected_line = f"- النقاط المتوقع تغطيتها: {' ، '.join(expected)}\n" if expected else ""
    return f"""أنت خبير تقييم مقابلات عمل (Senior Interview Evaluator) في منصة "جاهز".
مهمتك تقييم إجابة مرشح متقدم لوظيفة:
- الشركة: {job.get('companyName')}
- المسمى الوظيفي: {job.get('jobTitle')} ({job.get('jobLevel')})
- وصف الوظيفة (JD): {job.get('jobDescription')}

تفاصيل السؤال:
- التصنيف: {qa.get('category')}
- الموضوع: {qa.get('topic')}
- نص السؤال: "{qa.get('question')}"
{expected_line}
إجابة المرشح:
"{qa.get('userAnswer')}"

قيّم الإجابة بدقة علمية وموضوعية لمستوى ({job.get('jobLevel')}) وأرجع JSON فقط بالشكل التالي:
{{
  "scoreOutOf10": 7.5,
  "verdict": "جيد جداً",
  "reason": "شرح واضح بالعربية من جملتين إلى 3 جمل يوضح سبب الدرجة وما أصاب فيه أو قصر فيه",
  "goodPoints": ["نقطة إيجابية 1", "نقطة إيجابية 2"],
  "missingPoints": ["نقطة ناقصة 1", "نقطة ناقصة 2"],
  "modelAnswer": "إجابة نموذجية احترافية ومختصرة تناسب الوظيفة والشركة"
}}"""


def build_study_plan_prompt(
    job: dict[str, Any], topic: str, category: str, diagnosis: str
) -> str:
    return f"""أنت مرشد مهني وتخصصي (Career Coach) في منصة "جاهز".
المرشح المتقدم لوظيفة "{job.get('jobTitle')}" ({job.get('jobLevel')}) في شركة "{job.get('companyName')}" لديه نقطة ضعف في:
- الموضوع: {topic} ({category})
- سبب الضعف: {diagnosis}

أنشئ خطة مذاكرة مركزة وأسئلة تدريب بصيغة JSON فقط:
{{
  "studySummary": "شرح تعليمي مبسط وعملي بالعربية يغطي جوهر الموضوع في 3-4 جمل",
  "resources": [
    {{
      "title": "عنوان المصدر",
      "type": "docs",
      "typeLabel": "توثيق رسمي",
      "provider": "اسم المنصة المرجعية المناسبة للتخصص",
      "url": "رابط حقيقي وموثوق",
      "estimatedMinutes": 15,
      "whyRecommended": "لماذا يفيد هذا المصدر في علاج نقطة الضعف"
    }}
  ],
  "practiceQuestions": [
    {{
      "question": "سؤال تدريبي جديد يقيس نفس المهارة",
      "difficulty": "متوسط",
      "hint": "تلميح سريع لكيفية هيكلة الإجابة",
      "expectedKeyPoints": ["نقطة 1", "نقطة 2"],
      "sampleAnswer": "إجابة نموذجية للسؤال التدريبي"
    }}
  ]
}}"""


def build_retake_questions_prompt(
    job: dict[str, Any], weaknesses: list[dict[str, Any]]
) -> str:
    lines = "\n".join(
        f"{i+1}. [{w.get('category')}] {w.get('topic')} — ({w.get('diagnosis')})"
        for i, w in enumerate(weaknesses)
    )
    return f"""أنت محرك إعداد مقابلات ذكي في منصة "جاهز".
نريد عمل "إعادة إنترفيو مخصصة على نقاط الضعف فقط" لمرشح متقدم لوظيفة {job.get('jobTitle')} في شركة {job.get('companyName')}.
نقاط الضعف المطلوب اختبارها فقط:
{lines}

ولّد سؤالاً جديداً ومباشراً لكل نقطة ضعف (بصياغة مختلفة قليلاً عن السؤال الأصلي للتأكد من الفهم الحقيقي وليس الحفظ) وأرجع JSON فقط:
{{
  "questions": [
    {{
      "topic": "نفس اسم الموضوع",
      "category": "Technical",
      "question": "سؤال المقابلة الجديد",
      "expectedKeyPoints": ["نقطة 1", "نقطة 2"],
      "sampleStrongAnswer": "إجابة قوية مقترحة"
    }}
  ]
}}"""
