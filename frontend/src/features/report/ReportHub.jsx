import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { reportApi } from "./reportApi";
import "./report.css";

const DOMAIN_PRESETS = [
  {
    label: "تطوير برمجيات (Full-Stack)",
    companyName: "فودافون مصر (VOIS)",
    jobTitle: "Full-Stack Developer",
    jobLevel: "Fresh Graduate",
    jobDescription:
      "تطوير تطبيقات ويب متكاملة باستخدام React و Python FastAPI وقواعد بيانات SQL.",
    qas: [
      {
        category: "Technical",
        topic: "فهارس قواعد البيانات (SQL Indexing)",
        question:
          "إزاي الفهرس (Index) بيسرع البحث في SQL؟ وليه مش بنحطه على كل الأعمدة؟",
        userAnswer: "مش متأكد أوي، أعتقد بيرتب البيانات بس معرفش ليه مش بنحطه على الكل.",
      },
      {
        category: "Behavioral",
        topic: "إدارة ضغط الوقت في الفريق",
        question:
          "احكيلي عن موقف اتعرضت فيه لضغط تسليم شديد في مشروع وإزاي اتصرفت؟",
        userAnswer:
          "في مشروع التخرج قبل المناقشة بيومين اكتشفنا بطء شديد في صفحة البحث. قسمت الأولويات مع التيم وفحصت الاستعلامات وأضفت Pagination وDebounce خلال 4 ساعات، فانخفض وقت التحميل 80% وسلمنا المشروع في موعده بتقدير امتياز.",
      },
    ],
  },
  {
    label: "محاسبة وبنوك (Financial Accountant)",
    companyName: "البنك الأهلي المصري",
    jobTitle: "محاسب مالي ومحلل ائتمان",
    jobLevel: "حديث التخرج",
    jobDescription:
      "إعداد القوائم المالية، مراجعة القيود اليومية، وتحليل التدفقات النقدية للشركات.",
    qas: [
      {
        category: "Technical",
        topic: "قائمة التدفقات النقدية مقابل قائمة الدخل",
        question:
          "إيه الفرق الجوهري بين صافي الربح في قائمة الدخل وصافي التدفق النقدي التشغيلي؟",
        userAnswer:
          "صافي الربح في قائمة الدخل بيعتمد على أساس الاستحقاق يعني بيسجل الإيرادات والمصروفات وقت حدوثها، بينما التدفق النقدي التشغيلي بيسجل الكاش الفعلي اللي دخل وخرج من الشركة فعلاً عشان نعرف السيولة الحقيقية.",
      },
      {
        category: "Technical",
        topic: "مخصص الديون المشكوك في تحصيلها",
        question:
          "إزاي بنعالج محاسبياً الديون المشكوك في تحصيلها وتأثيرها على الميزانية؟",
        userAnswer: "بنخصمها لما العميل ميدفعش خالص.",
      },
    ],
  },
  {
    label: "تسويق رقمي (Digital Marketing)",
    companyName: "طلبات (Talabat)",
    jobTitle: "Performance Marketing Specialist",
    jobLevel: "Junior",
    jobDescription:
      "إدارة الحملات الإعلانية الممولة وتحسين معدل التحويل (CRO) وتحليل مؤشرات ROAS و CAC.",
    qas: [
      {
        category: "Technical",
        topic: "تحليل مؤشرات ROAS و CAC",
        question:
          "لو حملة إعلانية جايبة تفاعل عالي جداً لكن الـ ROAS منخفض، إيه الخطوات اللي هتعملها لتشخيص المشكلة؟",
        userAnswer: "ممكن أزود الميزانية أو أغير صورة الإعلان.",
      },
      {
        category: "HR",
        topic: "الدافع للانضمام لشركة طلبات",
        question: "ليه اخترت تقدم في فريق التسويق بشركة طلبات تحديداً؟",
        userAnswer:
          "لأن طلبات من أسرع منصات التوصيل نمواً في مصر والمنطقة وبتعتمد على التسويق المبني على البيانات اللحظية، وأنا اشتغلت في تدريبي الأخير على تحسين حملات الموبايل وحققت خفض في تكلفة الاستحواذ بنسبة 22%.",
      },
    ],
  },
];

const RAW_JSON_PRESETS = [
  {
    label: "1. صيغة محادثة شات (messages: role hr / candidate) من عضو 3",
    json: JSON.stringify(
      {
        company: "أورانج مصر (Orange)",
        position: "Data Analyst",
        level: "Fresh Graduate",
        messages: [
          {
            role: "hr",
            content:
              "أهلاً بيك! عرفنا بنفسك وليه حابب تشتغل محلل بيانات في أورانج؟",
          },
          {
            role: "candidate",
            content:
              "أنا خريج إحصاء وعلوم حاسب، اشتغلت على تحليل بيانات العملاء بـ Python و SQL و Power BI، ومتحمس لأورانج لحجم البيانات الضخم في قطاع الاتصالات.",
          },
          {
            role: "hr",
            content:
              "إزاي بتتعامل مع القيم المفقودة (Missing Values) والـ Outliers في بيانات المبيعات؟",
          },
          {
            role: "candidate",
            content: "بمسح الصفوف اللي فيها قيم ناقصة وخلاص.",
          },
        ],
      },
      null,
      2
    ),
  },
  {
    label: "2. مصفوفتان منفصلتان (questions[] + answers[]) + بيانات عضو 5 (0..1)",
    json: JSON.stringify(
      {
        company_name: "إنستابج (Instabug)",
        job_title: "Mobile Flutter Developer",
        questions: [
          "What is the difference between StatelessWidget and StatefulWidget in Flutter?",
          "كيف تعالج مشكلة تسريب الذاكرة (Memory Leaks) عند استخدام Streams في Flutter؟",
        ],
        answers: [
          "StatelessWidget is immutable and depends only on configuration when built, whereas StatefulWidget maintains mutable state across rebuilds using setState, for example in interactive forms.",
          "مش متأكد بالظبط إزاي بنقفلها.",
        ],
        behavior_metrics: [
          {
            stress: 0.22,
            focus: 0.91,
            confidence: 0.88,
            eye_contact: 0.85,
            wpm: 132,
            filler_words: ["امم"],
            expression: "واثق",
          },
          {
            stress: 0.74,
            focus: 0.58,
            confidence: 0.44,
            eye_contact: 0.51,
            wpm: 95,
            filler_words: ["يعني", "آآ", "أظن", "يعني"],
            expression: "متوتر",
          },
        ],
      },
      null,
      2
    ),
  },
  {
    label: "3. مفاتيح عربية بالكامل لوظيفة هندسية",
    json: JSON.stringify(
      {
        الشركة: "شركة السويدي إليكتريك",
        المسمى: "مهندس كهرباء قوى (حديث التخرج)",
        الأسئلة: [
          {
            السؤال:
              "اشرح معامل القدرة (Power Factor) وكيفية تحسينه في المصانع؟",
            الإجابة: "معرفش تفاصيل تحسينه في المصانع.",
          },
          {
            السؤال:
              "احكي عن موقف تعاونت فيه مع فريق المشروع لحل عطل فني مفاجئ؟",
            الإجابة:
              "في مشروع التخرج تعطل محول القياس قبل التجربة بيوم. فحصت التوصيلات وحددت تلف الفيوز الثانوي واستبدلته بعد مراجعة حسابات الحمل مع فريقي، فاشتغلت الدائرة بكفاءة 100% يوم المناقشة.",
          },
        ],
      },
      null,
      2
    ),
  },
];

export default function ReportHub({ onReportCreated = null }) {
  const navigate = useNavigate();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simMode, setSimMode] = useState("form");

  const [companyName, setCompanyName] = useState(DOMAIN_PRESETS[0].companyName);
  const [jobTitle, setJobTitle] = useState(DOMAIN_PRESETS[0].jobTitle);
  const [jobLevel, setJobLevel] = useState(DOMAIN_PRESETS[0].jobLevel);
  const [jobDescription, setJobDescription] = useState(
    DOMAIN_PRESETS[0].jobDescription
  );
  const [qaDrafts, setQaDrafts] = useState(DOMAIN_PRESETS[0].qas);

  const [rawJson, setRawJson] = useState(RAW_JSON_PRESETS[0].json);
  const [jsonErr, setJsonErr] = useState("");
  const [busy, setBusy] = useState(false);

  const [showLLM, setShowLLM] = useState(false);
  const [llmStatus, setLlmStatus] = useState("جاري الفحص...");
  const [provider, setProvider] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");

  function loadAll() {
    reportApi
      .listReports()
      .then((d) => {
        setReports(d.reports || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    reportApi
      .getLLMStatus()
      .then((d) => {
        if (d.status) {
          setLlmStatus(
            d.status.active
              ? `مفعل: ${d.status.provider} (${d.status.model})`
              : d.status.provider
          );
        }
        if (d.config) {
          setProvider(d.config.provider || "auto");
          setBaseUrl(d.config.baseUrl || "");
          setModel(d.config.model || "");
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadAll();
  }, []);

  function applyPreset(idx) {
    const p = DOMAIN_PRESETS[idx];
    setCompanyName(p.companyName);
    setJobTitle(p.jobTitle);
    setJobLevel(p.jobLevel);
    setJobDescription(p.jobDescription);
    setQaDrafts(p.qas.map((x) => ({ ...x })));
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await reportApi.generateReport({
        candidateName: "مرشح تجريبي",
        jobContext: { companyName, jobTitle, jobLevel, jobDescription },
        qaList: qaDrafts,
      });
      if (res.report?.id) {
        if (typeof onReportCreated === "function") {
          onReportCreated(res.report);
        } else {
          navigate(`/report?id=${res.report.id}`);
        }
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRawJsonSubmit() {
    setJsonErr("");
    let parsed;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      setJsonErr("صيغة الـ JSON غير سليمة نحوياً — راجع الأقواس والفواصل.");
      return;
    }
    setBusy(true);
    try {
      const res = await reportApi.generateReport(parsed);
      if (res.report?.id) {
        if (typeof onReportCreated === "function") {
          onReportCreated(res.report);
        } else {
          navigate(`/report?id=${res.report.id}`);
        }
      }
    } catch (err) {
      setJsonErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLLM(e) {
    e.preventDefault();
    await reportApi.saveLLMConfig({ provider, apiKey, baseUrl, model });
    setApiKey("");
    setShowLLM(false);
    loadAll();
  }

  async function removeReport(id) {
    await reportApi.deleteReport(id);
    loadAll();
  }

  const latestReport = reports[0];
  const latestWithWeak =
    reports.find((r) => (r.weaknesses || []).length > 0) || latestReport;

  return (
    <div className="rp-stack-lg">
      {/* بانر الهيكل الرسمي cvInterview ومهام عضو 6 */}
      <section className="rp-hero-dark">
        <div className="rp-hero-grid">
          <div className="rp-stack-sm">
            <div className="rp-row-wrap">
              <span className="rp-badge rp-badge-emerald">
                مطابق 100% لهيكل cvInterview الرسمي
              </span>
              <button
                type="button"
                onClick={() => setShowLLM((p) => !p)}
                className="rp-btn rp-btn-outline rp-btn-sm"
                style={{ background: "rgba(255,255,255,0.1)", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}
              >
                ⚙️ محرك الـ AI: {llmStatus}
              </button>
            </div>

            <h1 className="rp-h1" style={{ color: "#fff" }}>
              موديول التقييم والمذاكرة وإعادة الإنترفيو (عضو 6)
            </h1>

            <p style={{ margin: 0, fontSize: 14.5, color: "#cbd5e1" }}>
              مبني بنفس تقسيمة التيم بالمللي:{" "}
              <code style={{ color: "#fde047" }}>backend/app/modules/report/router.py</code>{" "}
              (FastAPI Python) +{" "}
              <code style={{ color: "#fde047" }}>
                frontend/src/features/report/{"{Report.jsx, Study.jsx}"}
              </code>{" "}
              (React + Vite) +{" "}
              <code style={{ color: "#fde047" }}>shared/mocks/report.json</code>.
            </p>

            <div className="rp-row-wrap" style={{ paddingTop: 8 }}>
              {latestReport && (
                <Link
                  to={`/report/${latestReport.id}`}
                  className="rp-btn rp-btn-primary"
                >
                  📊 افتح صفحة التقرير ({latestReport.jobContext?.companyName}) ←
                </Link>
              )}
              {latestWithWeak && (
                <Link
                  to={`/study/${latestWithWeak.id}`}
                  className="rp-btn rp-btn-outline"
                  style={{ background: "rgba(255,255,255,0.12)", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}
                >
                  📚 افتح صفحة المذاكرة والتدريب
                </Link>
              )}
            </div>
          </div>

          <div
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 16,
              padding: 18,
              fontSize: 13,
            }}
          >
            <strong style={{ color: "#fde047", display: "block", marginBottom: 8 }}>
              ملفات عضو 6 الجاهزة للنسخ مباشرة في ريبو التيم:
            </strong>
            <ul style={{ margin: 0, paddingRight: 18, lineHeight: 1.85 }}>
              <li>
                <code>backend/app/modules/report/router.py</code> (+ evaluator &amp; normalizer)
              </li>
              <li>
                <code>frontend/src/features/report/Report.jsx</code>
              </li>
              <li>
                <code>frontend/src/features/report/Study.jsx</code>
              </li>
              <li>
                <code>shared/mocks/report.json</code>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {showLLM && (
        <section className="rp-card rp-stack-md">
          <div className="rp-section-head">
            <div>
              <h2 className="rp-h2">⚙️ إعدادات نموذج الـ LLM المشترك (backend/app/core/llm.py)</h2>
              <p className="rp-muted">
                ضع مفتاح Gemini المجاني أو Groq أو OpenAI لتفعيل التقييم بالـ LLM الحقيقي، أو اتركه فارغاً ليعمل بالمحرك الديناميكي المدمج
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowLLM(false)}
              className="rp-btn rp-btn-outline rp-btn-sm"
            >
              إغلاق ✕
            </button>
          </div>

          <form onSubmit={saveLLM} className="rp-two-col">
            <div>
              <label className="rp-kpi-label">المزود (Provider)</label>
              <select
                className="rp-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="auto">اكتشاف تلقائي (Auto)</option>
                <option value="gemini">Google Gemini API</option>
                <option value="groq">Groq (Llama 3.3 70B)</option>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </div>
            <div>
              <label className="rp-kpi-label">API Key</label>
              <input
                type="password"
                dir="ltr"
                className="rp-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza... / gsk_... / sk-..."
              />
            </div>
            <div>
              <label className="rp-kpi-label">Base URL (اختياري)</label>
              <input
                type="text"
                dir="ltr"
                className="rp-input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div>
              <label className="rp-kpi-label">Model (اختياري)</label>
              <input
                type="text"
                dir="ltr"
                className="rp-input"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gemini-2.0-flash"
              />
            </div>
            <div>
              <button type="submit" className="rp-btn rp-btn-primary">
                حفظ إعدادات الـ LLM
              </button>
            </div>
          </form>
        </section>
      )}

      {/* مختبر التقييم الديناميكي وصيغ JSON التيم */}
      <section className="rp-card rp-stack-md">
        <div className="rp-section-head">
          <div>
            <h2 className="rp-h2">🧪 مختبر التقييم الديناميكي واختبار طلبات التيم</h2>
            <p className="rp-muted">
              اختبر أي مجال وظيفي أو أي صيغة JSON يرسلها عضو 2 وعضو 3 وعضو 5 إلى{" "}
              <code>POST /api/report/generate</code>
            </p>
          </div>

          <div className="rp-row-wrap">
            <button
              type="button"
              onClick={() => setSimMode("form")}
              className={`rp-btn rp-btn-sm ${
                simMode === "form" ? "rp-btn-primary" : "rp-btn-outline"
              }`}
            >
              فورم تفاعلي (تخصصات متنوعة)
            </button>
            <button
              type="button"
              onClick={() => setSimMode("json")}
              className={`rp-btn rp-btn-sm ${
                simMode === "json" ? "rp-btn-dark" : "rp-btn-outline"
              }`}
            >
              {"</>"} اختبار JSON عشوائي من التيم
            </button>
          </div>
        </div>

        {simMode === "form" ? (
          <form onSubmit={handleFormSubmit} className="rp-stack-md">
            <div className="rp-row-wrap">
              <span className="rp-muted-xs" style={{ fontWeight: 800 }}>
                جرّب تخصصاً جاهزاً:
              </span>
              {DOMAIN_PRESETS.map((p, idx) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(idx)}
                  className="rp-btn rp-btn-outline rp-btn-sm"
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="rp-bars-3">
              <div>
                <label className="rp-kpi-label">اسم الشركة</label>
                <input
                  required
                  className="rp-input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div>
                <label className="rp-kpi-label">المسمى الوظيفي (أي تخصص)</label>
                <input
                  required
                  className="rp-input"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="rp-kpi-label">المستوى</label>
                <input
                  required
                  className="rp-input"
                  value={jobLevel}
                  onChange={(e) => setJobLevel(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="rp-kpi-label">وصف الوظيفة (Job Description)</label>
              <textarea
                rows={2}
                required
                className="rp-textarea"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
              />
            </div>

            <div className="rp-between">
              <strong>الأسئلة والإجابات ({qaDrafts.length}):</strong>
              <button
                type="button"
                onClick={() =>
                  setQaDrafts((p) => [
                    ...p,
                    { category: "Technical", topic: "", question: "", userAnswer: "" },
                  ])
                }
                className="rp-btn rp-btn-outline rp-btn-sm"
              >
                + إضافة سؤال
              </button>
            </div>

            {qaDrafts.map((qa, i) => (
              <div key={i} className="rp-behavior-row rp-stack-sm">
                <div className="rp-between">
                  <strong>سؤال #{i + 1}</strong>
                  {qaDrafts.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setQaDrafts((p) => p.filter((_, idx) => idx !== i))
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "#e11d48",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      حذف ✕
                    </button>
                  )}
                </div>

                <div className="rp-two-col">
                  <div>
                    <label className="rp-kpi-label">نوع السؤال</label>
                    <select
                      className="rp-select"
                      value={qa.category}
                      onChange={(e) =>
                        setQaDrafts((p) =>
                          p.map((item, idx) =>
                            idx === i ? { ...item, category: e.target.value } : item
                          )
                        )
                      }
                    >
                      <option value="Technical">تخصصي / تقني (Technical)</option>
                      <option value="Behavioral">سلوكي (Behavioral)</option>
                      <option value="HR">تعارف وموارد بشرية (HR)</option>
                    </select>
                  </div>
                  <div>
                    <label className="rp-kpi-label">
                      الموضوع (اختياري — يُستنتج تلقائياً لو تُرك فارغاً)
                    </label>
                    <input
                      className="rp-input"
                      value={qa.topic}
                      onChange={(e) =>
                        setQaDrafts((p) =>
                          p.map((item, idx) =>
                            idx === i ? { ...item, topic: e.target.value } : item
                          )
                        )
                      }
                      placeholder="يُستنتج تلقائياً من السؤال..."
                    />
                  </div>
                </div>

                <div>
                  <label className="rp-kpi-label">نص السؤال</label>
                  <input
                    required
                    className="rp-input"
                    value={qa.question}
                    onChange={(e) =>
                      setQaDrafts((p) =>
                        p.map((item, idx) =>
                          idx === i ? { ...item, question: e.target.value } : item
                        )
                      )
                    }
                  />
                </div>

                <div>
                  <label className="rp-kpi-label">إجابة المرشح</label>
                  <textarea
                    rows={2}
                    required
                    className="rp-textarea"
                    value={qa.userAnswer}
                    onChange={(e) =>
                      setQaDrafts((p) =>
                        p.map((item, idx) =>
                          idx === i ? { ...item, userAnswer: e.target.value } : item
                        )
                      )
                    }
                  />
                </div>
              </div>
            ))}

            <div>
              <button
                type="submit"
                disabled={busy}
                className="rp-btn rp-btn-primary"
              >
                {busy
                  ? "جاري تحليل الإجابات وتوليد التقرير..."
                  : "قيّم المقابلة الآن وأنشئ صفحة التقرير والمذاكرة ←"}
              </button>
            </div>
          </form>
        ) : (
          <div className="rp-stack-sm">
            <div className="rp-row-wrap">
              {RAW_JSON_PRESETS.map((pr) => (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => {
                    setRawJson(pr.json);
                    setJsonErr("");
                  }}
                  className="rp-btn rp-btn-outline rp-btn-sm"
                >
                  {pr.label}
                </button>
              ))}
            </div>

            <textarea
              rows={13}
              dir="ltr"
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              className="rp-code-dark"
              style={{ width: "100%" }}
            />

            {jsonErr && <div className="rp-item-rose">{jsonErr}</div>}

            <div>
              <button
                type="button"
                disabled={busy}
                onClick={handleRawJsonSubmit}
                className="rp-btn rp-btn-dark"
              >
                {busy
                  ? "جاري تطبيع الـ JSON وتوليد التقرير..."
                  : "أرسل هذا الـ JSON إلى FastAPI وافتح التقرير الناتج ←"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* سجل التقارير المحفوظة */}
      <section className="rp-stack-sm">
        <h2 className="rp-h2">📂 سجل التقارير المحفوظة ({reports.length})</h2>

        {loading ? (
          <div className="rp-card">جاري تحميل التقارير...</div>
        ) : (
          <div className="rp-two-col">
            {reports.map((rep) => (
              <div key={rep.id} className="rp-card rp-stack-sm">
                <div className="rp-between">
                  <span className="rp-badge rp-badge-neutral">
                    {rep.jobContext?.companyName} • محاولة #{rep.attemptNumber}
                  </span>
                  <div className="rp-row-wrap">
                    <span
                      className={`rp-badge ${
                        rep.overallScore100 >= 75
                          ? "rp-badge-emerald"
                          : "rp-badge-amber"
                      }`}
                    >
                      {rep.overallScore100}% ({rep.averageScore10}/10)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeReport(rep.id)}
                      className="rp-btn rp-btn-outline rp-btn-sm"
                      title="حذف"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                <h3 className="rp-h3">{rep.jobContext?.jobTitle}</h3>
                <p className="rp-muted" style={{ fontSize: 13 }}>
                  {rep.executiveSummary}
                </p>

                <div
                  className="rp-between"
                  style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12 }}
                >
                  <span className="rp-muted-xs">
                    {rep.strengths?.length || 0} قوة •{" "}
                    {rep.weaknesses?.length || 0} ضعف
                  </span>
                  <div className="rp-row-wrap">
                    <Link
                      to={`/report/${rep.id}`}
                      className="rp-btn rp-btn-dark rp-btn-sm"
                    >
                      صفحة التقرير
                    </Link>
                    {(rep.weaknesses || []).length > 0 && (
                      <Link
                        to={`/study/${rep.id}`}
                        className="rp-btn rp-btn-primary rp-btn-sm"
                      >
                        صفحة المذاكرة
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
