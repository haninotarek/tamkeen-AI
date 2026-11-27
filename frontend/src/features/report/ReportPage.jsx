import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { reportApi } from "./reportApi";
import BehaviorSection from "./BehaviorSection";
import RetakeView from "./RetakeView";
import ReportHub from "./ReportHub";
import "./report.css";

function ScoreGauge({ score100, average10, stars }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, score100 || 0));
  const offset = circumference - (clamped / 100) * circumference;
  const color =
    clamped >= 75 ? "#10b981" : clamped >= 60 ? "#f59e0b" : "#f43f5e";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: 140, height: 140 }}>
        <svg width="140" height="140" style={{ transform: "rotate(-90deg)" }}>
          <circle
            cx="70"
            cy="70"
            r={radius}
            stroke="#e2e8f0"
            strokeWidth="12"
            fill="transparent"
          />
          <circle
            cx="70"
            cy="70"
            r={radius}
            stroke={color}
            strokeWidth="12"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <strong style={{ fontSize: 28, fontWeight: 900 }}>{clamped}%</strong>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
            متوسط {average10} / 10
          </span>
        </div>
      </div>
      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: "#d97706" }}>
        {"★".repeat(Math.round(stars || 0))}
        {"☆".repeat(Math.max(0, 5 - Math.round(stars || 0)))}{" "}
        <span style={{ color: "#475569", fontSize: 12 }}>({stars}/5)</span>
      </div>
    </div>
  );
}

function QuestionEvaluationCard({ ev }) {
  const [showModel, setShowModel] = useState(ev.scoreOutOf10 < 7);

  const scoreClass =
    ev.scoreOutOf10 >= 7.5
      ? "rp-badge-emerald"
      : ev.scoreOutOf10 >= 5
      ? "rp-badge-amber"
      : "rp-badge-rose";

  const catLabel =
    ev.category === "Technical"
      ? "تخصصي / تقني"
      : ev.category === "Behavioral"
      ? "سلوكي (Behavioral)"
      : "تعارف (HR)";

  return (
    <article className="rp-q-card">
      <div className="rp-q-header">
        <div style={{ flex: 1 }}>
          <div className="rp-row-wrap" style={{ marginBottom: 8 }}>
            <span className="rp-q-num">سؤال {ev.questionIndex}</span>
            <span className="rp-badge rp-badge-neutral">{catLabel}</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: "#047857" }}>
              • {ev.topic}
            </span>
          </div>
          <h3 className="rp-h3">{ev.question}</h3>
        </div>

        <div className={`rp-score-box ${scoreClass}`}>
          <div className="rp-score-big">
            {ev.scoreOutOf10} <span style={{ fontSize: 12 }}>/ 10</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 800 }}>{ev.verdict}</div>
        </div>
      </div>

      <div className="rp-q-body">
        <div className="rp-answer-quote">
          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", marginBottom: 4 }}>
            إجابتك في المقابلة:
          </div>
          <div>{ev.userAnswer}</div>
        </div>

        <div className={ev.scoreOutOf10 >= 7 ? "rp-item-emerald" : "rp-item-amber"}>
          <strong style={{ fontSize: 13 }}>
            سبب الدرجة ({ev.scoreOutOf10} من 10):
          </strong>
          <p style={{ margin: "4px 0 0", fontSize: 14 }}>{ev.reason}</p>
        </div>

        <div className="rp-two-col">
          <div className="rp-item-emerald">
            <strong style={{ fontSize: 12.5, color: "#065f46" }}>
              ✓ نقاط إيجابية في إجابتك:
            </strong>
            <ul style={{ margin: "6px 0 0", paddingRight: 18, fontSize: 13 }}>
              {(ev.goodPoints || []).map((pt, i) => (
                <li key={i}>{pt}</li>
              ))}
            </ul>
          </div>

          <div className="rp-item-rose">
            <strong style={{ fontSize: 12.5, color: "#9f1239" }}>
              ! ما كان ينقص الإجابة للوصول لـ 10/10:
            </strong>
            {(ev.missingPoints || []).length > 0 ? (
              <ul style={{ margin: "6px 0 0", paddingRight: 18, fontSize: 13 }}>
                {ev.missingPoints.map((pt, i) => (
                  <li key={i}>{pt}</li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                الإجابة وافية ومكتملة الأركان!
              </p>
            )}
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowModel((prev) => !prev)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              color: "#047857",
              fontWeight: 800,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            💡 {showModel ? "إخفاء الإجابة النموذجية" : "عرض إجابة نموذجية مقترحة 10/10"}
          </button>

          {showModel && (
            <div
              style={{
                marginTop: 8,
                background: "#f0fdfa",
                border: "1px solid #99f6e4",
                borderRadius: 12,
                padding: 14,
                fontSize: 13.5,
              }}
            >
              <strong>نموذج إجابة احترافية: </strong>
              {ev.modelAnswer}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * frontend/src/features/report/ReportPage.jsx
 * الشاشة الرسمية الأولى لـ (عضو 6 — حازم): صفحة التقرير الشامل
 */
export default function ReportPage({ reportId: propReportId, reportData: propReportData }) {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const resolvedId = propReportId || params?.id || searchParams.get("id");

  const [report, setReport] = useState(propReportData || null);
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading] = useState(!propReportData);
  const [error, setError] = useState("");
  const [filterTab, setFilterTab] = useState("all");
  const [selectedWeaknessIds, setSelectedWeaknessIds] = useState([]);
  const [retakeLoading, setRetakeLoading] = useState(false);
  const [activeRetakeSession, setActiveRetakeSession] = useState(null);
  const [showLab, setShowLab] = useState(false);
  const [jsonPreview, setJsonPreview] = useState(null);

  useEffect(() => {
    reportApi
      .listReports()
      .then((d) => setAllReports(d.reports || []))
      .catch(() => {});
  }, [report?.id]);

  useEffect(() => {
    if (propReportData) {
      setReport(propReportData);
      setSelectedWeaknessIds((propReportData.weaknesses || []).map((w) => w.id));
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError("");
    const loadFn = resolvedId
      ? reportApi.getReport(resolvedId)
      : reportApi.listReports().then((d) => ({ report: (d.reports || [])[0] }));

    loadFn
      .then((data) => {
        if (!mounted) return;
        if (!data.report) throw new Error("لم يتم العثور على التقرير");
        setReport(data.report);
        setSelectedWeaknessIds((data.report.weaknesses || []).map((w) => w.id));
        setLoading(false);
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message || "تعذر تحميل التقرير");
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [resolvedId, propReportData]);

  function toggleWeakness(id) {
    setSelectedWeaknessIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleStartRetake(previewOnly = false) {
    if (!report) return;
    setRetakeLoading(true);
    try {
      const ids =
        selectedWeaknessIds.length > 0
          ? selectedWeaknessIds
          : report.weaknesses.map((w) => w.id);
      const res = await reportApi.createWeaknessRetake(report.id, ids);
      if (previewOnly) {
        setJsonPreview(res.session);
      } else {
        setActiveRetakeSession(res.session);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setRetakeLoading(false);
    }
  }

  if (activeRetakeSession) {
    return (
      <RetakeView
        initialSession={activeRetakeSession}
        onBack={() => setActiveRetakeSession(null)}
        onCompleteReport={(newRep) => {
          setActiveRetakeSession(null);
          setReport(newRep);
          setSelectedWeaknessIds((newRep.weaknesses || []).map((w) => w.id));
          setSearchParams({ id: newRep.id });
        }}
      />
    );
  }

  if (showLab) {
    return (
      <div className="rp-stack-md">
        <div className="rp-between">
          <button
            type="button"
            onClick={() => setShowLab(false)}
            className="rp-btn rp-btn-outline rp-btn-sm"
          >
            → العودة إلى عرض التقرير الحالي
          </button>
        </div>
        <ReportHub
          onReportCreated={(newRep) => {
            setShowLab(false);
            setReport(newRep);
            setSelectedWeaknessIds((newRep.weaknesses || []).map((w) => w.id));
            setSearchParams({ id: newRep.id });
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rp-card" style={{ textAlign: "center", padding: 60 }}>
        <strong>جاري تحميل وتحليل تقرير المقابلة...</strong>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rp-card" style={{ textAlign: "center", padding: 60 }}>
        <p className="rp-text-rose" style={{ fontWeight: 800 }}>
          {error || "لا توجد تقارير محفوظة حالياً"}
        </p>
        <button
          type="button"
          onClick={() => setShowLab(true)}
          className="rp-btn rp-btn-primary"
          style={{ marginTop: 12 }}
        >
          🧪 إنشاء وتقييم مقابلة جديدة الآن
        </button>
      </div>
    );
  }

  const dynamicBars = [];
  if (report.categoryScores?.hr !== null && report.categoryScores?.hr !== undefined) {
    dynamicBars.push({ label: "أسئلة HR", val: report.categoryScores.hr });
  }
  if (
    report.categoryScores?.behavioral !== null &&
    report.categoryScores?.behavioral !== undefined
  ) {
    dynamicBars.push({
      label: "أسئلة سلوكية",
      val: report.categoryScores.behavioral,
    });
  }
  if (
    report.categoryScores?.technical !== null &&
    report.categoryScores?.technical !== undefined
  ) {
    dynamicBars.push({
      label: "أسئلة تخصصية/تقنية",
      val: report.categoryScores.technical,
    });
  }
  dynamicBars.push({
    label: "الثقة والسلوك",
    val: report.categoryScores?.behaviorConfidence ?? 70,
  });

  const presentCats = new Set(
    (report.questionEvaluations || []).map((q) => q.category)
  );

  const filteredQuestions = (report.questionEvaluations || []).filter((q) => {
    if (filterTab === "all") return true;
    if (filterTab === "weak") return q.scoreOutOf10 < 7;
    return q.category === filterTab;
  });

  const verdictBadgeClass =
    report.readinessVerdict === "ready"
      ? "rp-badge-emerald"
      : report.readinessVerdict === "almost_ready"
      ? "rp-badge-amber"
      : "rp-badge-rose";

  const studyLink = `/study?id=${report.id}`;

  return (
    <div className="rp-stack-lg">
      {/* شريط التنقل السريع بين التقارير ومختبر التقييم الديناميكي */}
      <div className="rp-between">
        <div className="rp-row-wrap">
          {allReports.length > 1 && (
            <select
              className="rp-select"
              style={{ width: "auto", minWidth: 240, padding: "7px 12px" }}
              value={report.id}
              onChange={(e) => {
                const chosen = allReports.find((r) => r.id === e.target.value);
                if (chosen) {
                  setReport(chosen);
                  setSelectedWeaknessIds((chosen.weaknesses || []).map((w) => w.id));
                  setSearchParams({ id: chosen.id });
                }
              }}
            >
              {allReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.jobContext?.companyName} — {r.jobContext?.jobTitle} ({r.overallScore100}%)
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowLab(true)}
          className="rp-btn rp-btn-outline rp-btn-sm"
        >
          🧪 مختبر تقييم مقابلة جديدة / JSON التيم
        </button>
      </div>

      {/* شريط مقارنة التحسن عند إعادة الإنترفيو */}
      {typeof report.previousScore100 === "number" && (
        <div className="rp-improvement-banner">
          <div>
            <strong style={{ fontSize: 15 }}>
              🎉 نتيجة إعادة الإنترفيو على نقاط الضعف (المحاولة #{report.attemptNumber})
            </strong>
            <div style={{ fontSize: 13, opacity: 0.92 }}>
              تغير تقييمك الكلي من {report.previousScore100}% في المحاولة السابقة إلى{" "}
              <strong>{report.overallScore100}%</strong> (
              {report.overallScore100 - report.previousScore100 >= 0 ? "+" : ""}
              {report.overallScore100 - report.previousScore100}% فرق الأداء!)
            </div>
          </div>
          {report.parentReportId && (
            <button
              type="button"
              onClick={() => navigate(`/report?id=${report.parentReportId}`)}
              className="rp-btn rp-btn-outline rp-btn-sm"
            >
              مقارنة بالتقرير السابق
            </button>
          )}
        </div>
      )}

      {/* البطاقة العلوية للـ Rating وملخص الجاهزية */}
      <section className="rp-card rp-stack-md">
        <div className="rp-report-top-grid">
          <div className="rp-stack-sm">
            <div className="rp-row-wrap">
              <span className="rp-badge rp-badge-neutral">
                🏢 {report.jobContext?.companyName}
              </span>
              <span className="rp-badge rp-badge-neutral">
                {report.jobContext?.jobLevel}
              </span>
              <span className="rp-badge rp-badge-emerald">
                {report.mode === "weakness_retake"
                  ? `محاولة #${report.attemptNumber} (إعادة نقاط الضعف)`
                  : `محاولة #${report.attemptNumber} (مقابلة كاملة)`}
              </span>
            </div>

            <h1 className="rp-h1">
              تقرير مقابلة: {report.jobContext?.jobTitle}
            </h1>
            <p className="rp-muted-xs" style={{ margin: 0 }}>
              المرشح: {report.candidateName} • إجمالي الأسئلة المقيمة:{" "}
              {report.questionEvaluations?.length || 0}
            </p>

            <div>
              <span
                className={`rp-badge ${verdictBadgeClass}`}
                style={{ fontSize: 13, padding: "6px 14px" }}
              >
                قرار الجاهزية (اتمكن؟): {report.readinessLabel}
              </span>
            </div>

            <p style={{ margin: "4px 0", fontSize: 14.5, color: "#334155" }}>
              {report.executiveSummary}
            </p>

            {/* أشرطة المحاور المتواجدة ديناميكياً */}
            <div className="rp-kpi-grid">
              {dynamicBars.map((bar) => (
                <div key={bar.label} className="rp-kpi-box">
                  <div className="rp-between" style={{ fontSize: 12, fontWeight: 800 }}>
                    <span>{bar.label}</span>
                    <span>{bar.val}%</span>
                  </div>
                  <div className="rp-progress-track" style={{ marginTop: 6 }}>
                    <div
                      className={`rp-progress-fill ${
                        bar.val >= 75
                          ? "rp-fill-emerald"
                          : bar.val >= 60
                          ? "rp-fill-amber"
                          : "rp-fill-rose"
                      }`}
                      style={{ width: `${bar.val}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* أزرار المذاكرة وإعادة الإنترفيو */}
            <div className="rp-row-wrap" style={{ paddingTop: 6 }}>
              {(report.weaknesses || []).length > 0 ? (
                <>
                  <Link to={studyLink} className="rp-btn rp-btn-primary">
                    📚 ذاكر نقاط الضعف ({report.weaknesses.length} مواضيع + أسئلة تدريب) ←
                  </Link>

                  <button
                    type="button"
                    disabled={retakeLoading}
                    onClick={() => handleStartRetake(false)}
                    className="rp-btn rp-btn-dark"
                  >
                    🔄 إعادة الإنترفيو على النقاط الضعيفة بس (
                    {selectedWeaknessIds.length || report.weaknesses.length})
                  </button>

                  <button
                    type="button"
                    disabled={retakeLoading}
                    onClick={() => handleStartRetake(true)}
                    className="rp-btn rp-btn-outline rp-btn-sm"
                  >
                    {"</>"} معاينة JSON لـ (عضو 3)
                  </button>
                </>
              ) : (
                <span
                  className="rp-badge rp-badge-emerald"
                  style={{ padding: "10px 16px", fontSize: 13.5 }}
                >
                  ✨ لا توجد نقاط ضعف متبقية — أنت جاهز تماماً للمقابلة الحقيقية!
                </span>
              )}
            </div>
          </div>

          <div className="rp-ring-box">
            <span className="rp-muted-xs" style={{ fontWeight: 800, marginBottom: 8 }}>
              التقييم العام (Overall Rating)
            </span>
            <ScoreGauge
              score100={report.overallScore100}
              average10={report.averageScore10}
              stars={report.stars}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                width: "100%",
                marginTop: 14,
              }}
            >
              <div className="rp-card" style={{ padding: 10 }}>
                <strong className="rp-text-emerald" style={{ fontSize: 18 }}>
                  {report.strengths?.length || 0}
                </strong>
                <div className="rp-muted-xs">نقاط قوة</div>
              </div>
              <div className="rp-card" style={{ padding: 10 }}>
                <strong className="rp-text-rose" style={{ fontSize: 18 }}>
                  {report.weaknesses?.length || 0}
                </strong>
                <div className="rp-muted-xs">نقاط ضعف</div>
              </div>
            </div>
          </div>
        </div>

        {jsonPreview && (
          <div>
            <div className="rp-between" style={{ marginBottom: 6 }}>
              <strong style={{ fontSize: 12.5, color: "#047857" }}>
                بيانات جلسة الإعادة المخصصة المرسلة لموديول interview/ عند (عضو 3):
              </strong>
              <button
                type="button"
                onClick={() => setJsonPreview(null)}
                className="rp-btn rp-btn-outline rp-btn-sm"
              >
                إغلاق ✕
              </button>
            </div>
            <pre className="rp-code-dark">
              {JSON.stringify(jsonPreview, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* نقاط القوة ونقاط الضعف */}
      <section className="rp-two-col">
        <div className="rp-card rp-stack-sm">
          <div className="rp-section-head">
            <h2 className="rp-h2">✅ نقاط القوة (Strengths)</h2>
            <span className="rp-badge rp-badge-emerald">
              {report.strengths?.length || 0} نقاط
            </span>
          </div>
          {(report.strengths || []).map((st) => (
            <div key={st.id} className="rp-item-emerald">
              <div className="rp-between">
                <strong style={{ fontSize: 14 }}>{st.title}</strong>
                {st.scoreHighlight && (
                  <span className="rp-badge rp-badge-emerald">
                    {st.scoreHighlight}
                  </span>
                )}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#334155" }}>
                {st.description}
              </p>
            </div>
          ))}
        </div>

        <div className="rp-card rp-stack-sm">
          <div className="rp-section-head">
            <h2 className="rp-h2">⚠️ نقاط الضعف المطلوب مذاكرتها</h2>
            <span className="rp-badge rp-badge-rose">
              {report.weaknesses?.length || 0} نقاط ضعف
            </span>
          </div>

          {(report.weaknesses || []).length === 0 ? (
            <div className="rp-item-emerald" style={{ textAlign: "center", padding: 30 }}>
              <strong>ممتاز! لا توجد أي إجابة أقل من 7/10 في هذه المقابلة.</strong>
            </div>
          ) : (
            report.weaknesses.map((wk) => {
              const checked = selectedWeaknessIds.includes(wk.id);
              return (
                <div key={wk.id} className="rp-item-rose">
                  <div className="rp-between">
                    <label className="rp-row-wrap" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWeakness(wk.id)}
                      />
                      <span
                        className={`rp-badge ${
                          wk.severity === "عالية" ? "rp-badge-rose" : "rp-badge-amber"
                        }`}
                      >
                        أولوية {wk.severity}
                      </span>
                      <span className="rp-muted-xs">({wk.category})</span>
                    </label>
                    <strong className="rp-text-rose" style={{ fontSize: 12.5 }}>
                      الدرجة: {wk.originalScore10} / 10
                    </strong>
                  </div>

                  <div style={{ fontWeight: 800, fontSize: 14.5, marginTop: 6 }}>
                    {wk.topic}
                  </div>
                  <p style={{ margin: "4px 0 8px", fontSize: 13, color: "#475569" }}>
                    {wk.diagnosis}
                  </p>

                  <div
                    className="rp-between"
                    style={{ borderTop: "1px solid #fecdd3", paddingTop: 8 }}
                  >
                    <span className="rp-muted-xs">
                      {wk.resources?.length || 0} مصادر +{" "}
                      {wk.practiceQuestions?.length || 0} أسئلة تدريب
                    </span>
                    <Link
                      to={`/study?id=${report.id}&weakness=${wk.id}`}
                      style={{ fontSize: 12.5, fontWeight: 800, color: "#047857" }}
                    >
                      ذاكر هذه النقطة الآن ←
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* رسوم مؤشرات السلوك بالتكامل الآمن مع موديول عضو 5 */}
      <BehaviorSection
        evaluations={report.questionEvaluations}
        behaviorDataSource={report.behaviorDataSource}
      />

      {/* تقييم كل إجابة: درجة من 10 + السبب */}
      <section className="rp-stack-md">
        <div className="rp-between">
          <div>
            <h2 className="rp-h2">📝 تقييم كل إجابة بالتفصيل (درجة من 10 + السبب)</h2>
            <p className="rp-muted">
              مراجعة شاملة لكل سؤال وإجابتك عليه وسبب الدرجة مع نموذج الإجابة المثالية
            </p>
          </div>

          <div className="rp-row-wrap">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={`rp-btn rp-btn-sm ${
                filterTab === "all" ? "rp-btn-dark" : "rp-btn-outline"
              }`}
            >
              الكل ({report.questionEvaluations?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("weak")}
              className={`rp-btn rp-btn-sm ${
                filterTab === "weak" ? "rp-btn-dark" : "rp-btn-outline"
              }`}
            >
              نقاط الضعف فقط (
              {(report.questionEvaluations || []).filter((q) => q.scoreOutOf10 < 7).length}
              )
            </button>
            {presentCats.has("Technical") && (
              <button
                type="button"
                onClick={() => setFilterTab("Technical")}
                className={`rp-btn rp-btn-sm ${
                  filterTab === "Technical" ? "rp-btn-dark" : "rp-btn-outline"
                }`}
              >
                تخصصي / تقني
              </button>
            )}
            {presentCats.has("Behavioral") && (
              <button
                type="button"
                onClick={() => setFilterTab("Behavioral")}
                className={`rp-btn rp-btn-sm ${
                  filterTab === "Behavioral" ? "rp-btn-dark" : "rp-btn-outline"
                }`}
              >
                سلوكي
              </button>
            )}
            {presentCats.has("HR") && (
              <button
                type="button"
                onClick={() => setFilterTab("HR")}
                className={`rp-btn rp-btn-sm ${
                  filterTab === "HR" ? "rp-btn-dark" : "rp-btn-outline"
                }`}
              >
                HR
              </button>
            )}
          </div>
        </div>

        <div className="rp-stack-md">
          {filteredQuestions.map((ev) => (
            <QuestionEvaluationCard key={ev.id} ev={ev} />
          ))}
        </div>
      </section>
    </div>
  );
}
