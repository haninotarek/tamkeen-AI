import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { reportApi } from "./reportApi";
import RetakeView from "./RetakeView";
import "./report.css";

/**
 * frontend/src/features/report/StudyPage.jsx
 * الشاشة الرسمية الثانية لـ (عضو 6 — حازم): صفحة المذاكرة وأسئلة التدريب لكل نقطة ضعف
 */
export default function StudyPage({ reportId: propReportId }) {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const resolvedId = propReportId || params?.id || searchParams.get("id");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedWeaknessId, setSelectedWeaknessId] = useState("");
  const [practiceInputs, setPracticeInputs] = useState({});
  const [evaluatingPqId, setEvaluatingPqId] = useState(null);
  const [revealedHints, setRevealedHints] = useState({});
  const [revealedSamples, setRevealedSamples] = useState({});
  const [retakeLoading, setRetakeLoading] = useState(false);
  const [activeRetakeSession, setActiveRetakeSession] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const loadFn = resolvedId
      ? reportApi.getReport(resolvedId)
      : reportApi
          .listReports()
          .then((d) => ({
            report:
              (d.reports || []).find((r) => (r.weaknesses || []).length > 0) ||
              (d.reports || [])[0],
          }));

    loadFn
      .then((data) => {
        if (!mounted || !data.report) {
          setLoading(false);
          return;
        }
        const rep = data.report;
        setReport(rep);

        const requested = searchParams.get("weakness");
        if (requested && (rep.weaknesses || []).some((w) => w.id === requested)) {
          setSelectedWeaknessId(requested);
        } else if ((rep.weaknesses || []).length > 0) {
          setSelectedWeaknessId(rep.weaknesses[0].id);
        }

        const saved = {};
        (rep.weaknesses || []).forEach((w) => {
          (w.practiceQuestions || []).forEach((pq) => {
            if (pq.lastUserAnswer) saved[pq.id] = pq.lastUserAnswer;
          });
        });
        setPracticeInputs(saved);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [resolvedId, searchParams]);

  async function toggleResource(weaknessId, resourceId, completed) {
    if (!report) return;
    const data = await reportApi.updateStudyProgress(report.id, {
      weaknessId,
      resourceId,
      completed,
    });
    setReport(data.report);
  }

  async function toggleMastered(weaknessId, isMastered) {
    if (!report) return;
    const data = await reportApi.updateStudyProgress(report.id, {
      weaknessId,
      isMastered,
    });
    setReport(data.report);
  }

  async function submitPractice(weaknessId, pqId) {
    if (!report) return;
    const text = (practiceInputs[pqId] || "").trim();
    if (!text) return;
    setEvaluatingPqId(pqId);
    try {
      const data = await reportApi.evaluatePracticeQuestion(report.id, {
        weaknessId,
        practiceQuestionId: pqId,
        userAnswer: text,
      });
      setReport(data.report);
    } catch (err) {
      alert(err.message);
    } finally {
      setEvaluatingPqId(null);
    }
  }

  async function startRetake(onlyUnmastered = false) {
    if (!report) return;
    setRetakeLoading(true);
    try {
      const unmastered = (report.weaknesses || [])
        .filter((w) => !w.isMastered)
        .map((w) => w.id);
      const ids =
        onlyUnmastered && unmastered.length > 0
          ? unmastered
          : report.weaknesses.map((w) => w.id);
      const res = await reportApi.createWeaknessRetake(report.id, ids);
      setActiveRetakeSession(res.session);
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
          navigate(`/report?id=${newRep.id}`);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="rp-card" style={{ textAlign: "center", padding: 60 }}>
        <strong>جاري تجهيز خطة المذاكرة وأسئلة التدريب...</strong>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rp-card" style={{ textAlign: "center", padding: 60 }}>
        <p className="rp-text-rose" style={{ fontWeight: 800 }}>
          لم يتم العثور على خطة المذاكرة المطلوبة
        </p>
        <Link to="/report" className="rp-btn rp-btn-dark" style={{ marginTop: 12 }}>
          العودة لصفحة التقرير
        </Link>
      </div>
    );
  }

  const weaknesses = report.weaknesses || [];
  const totalResources = weaknesses.reduce(
    (s, w) => s + (w.resources || []).length,
    0
  );
  const doneResources = weaknesses.reduce(
    (s, w) => s + (w.resources || []).filter((r) => r.completed).length,
    0
  );
  const masteredCount = weaknesses.filter((w) => w.isMastered).length;
  const unmasteredCount = weaknesses.length - masteredCount;
  const progressPct =
    totalResources > 0 ? Math.round((doneResources / totalResources) * 100) : 100;

  const activeWeakness =
    weaknesses.find((w) => w.id === selectedWeaknessId) || weaknesses[0];

  return (
    <div className="rp-stack-lg">
      {/* رأس صفحة المذاكرة */}
      <section className="rp-card rp-stack-md">
        <div className="rp-between">
          <div>
            <Link
              to={`/report?id=${report.id}`}
              style={{ fontSize: 13, fontWeight: 800, color: "#047857" }}
            >
              → العودة إلى صفحة التقرير ({report.overallScore100}%)
            </Link>
            <h1 className="rp-h1">مساحة المذاكرة والتدريب على نقاط الضعف</h1>
            <p className="rp-muted">
              {report.jobContext?.companyName} — {report.jobContext?.jobTitle} (
              {report.jobContext?.jobLevel})
            </p>
          </div>

          {weaknesses.length > 0 && (
            <div className="rp-row-wrap">
              {unmasteredCount > 0 && unmasteredCount < weaknesses.length && (
                <button
                  type="button"
                  disabled={retakeLoading}
                  onClick={() => startRetake(true)}
                  className="rp-btn rp-btn-outline"
                >
                  إعادة على غير المتقنة فقط ({unmasteredCount})
                </button>
              )}
              <button
                type="button"
                disabled={retakeLoading}
                onClick={() => startRetake(false)}
                className="rp-btn rp-btn-primary"
              >
                🔄 إعادة الإنترفيو على النقاط الضعيفة بس ({weaknesses.length})
              </button>
            </div>
          )}
        </div>

        {weaknesses.length > 0 && (
          <div className="rp-kpi-box">
            <div className="rp-between" style={{ fontSize: 13, fontWeight: 800 }}>
              <span>
                إنجاز المصادر التعليمية: {doneResources} من {totalResources} (
                {progressPct}%)
              </span>
              <span className="rp-text-emerald">
                نقاط الضعف المتقنة: {masteredCount} من {weaknesses.length}
              </span>
            </div>
            <div className="rp-progress-track" style={{ marginTop: 6 }}>
              <div
                className="rp-progress-fill rp-fill-emerald"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {weaknesses.length === 0 ? (
        <div className="rp-card" style={{ textAlign: "center", padding: 56 }}>
          <h2 className="rp-h2">🏆 مبروك! لا توجد نقاط ضعف مسجلة في هذا التقرير</h2>
          <p className="rp-muted">
            تجاوزت جميع الأسئلة بنجاح وأنت جاهز للمقابلة الحقيقية.
          </p>
          <div className="rp-row-wrap" style={{ justifyContent: "center", marginTop: 18 }}>
            <Link to={`/report?id=${report.id}`} className="rp-btn rp-btn-primary">
              عرض صفحة التقرير
            </Link>
          </div>
        </div>
      ) : (
        <div className="rp-study-layout">
          {/* القائمة الجانبية لنقاط الضعف */}
          <aside className="rp-stack-sm">
            <strong style={{ fontSize: 13.5, color: "#334155" }}>
              نقاط الضعف المستخرجة ({weaknesses.length}):
            </strong>

            {weaknesses.map((wk, i) => {
              const isSelected = activeWeakness?.id === wk.id;
              const doneCount = (wk.resources || []).filter((r) => r.completed).length;
              return (
                <button
                  key={wk.id}
                  type="button"
                  onClick={() => setSelectedWeaknessId(wk.id)}
                  className={`rp-weak-tab ${isSelected ? "active" : ""}`}
                >
                  <div className="rp-between">
                    <span className="rp-badge rp-badge-neutral">
                      #{i + 1} • {wk.category}
                    </span>
                    {wk.isMastered ? (
                      <span className="rp-badge rp-badge-emerald">✓ متقنة</span>
                    ) : (
                      <span className="rp-badge rp-badge-rose">
                        {wk.originalScore10}/10
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, marginTop: 8 }}>
                    {wk.topic}
                  </div>
                  <div className="rp-between rp-muted-xs" style={{ marginTop: 8 }}>
                    <span>
                      المصادر: {doneCount}/{(wk.resources || []).length}
                    </span>
                    <span>{(wk.practiceQuestions || []).length} أسئلة تدريب</span>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* تفاصيل المذاكرة والتدريب للنقطة المختارة */}
          {activeWeakness && (
            <div className="rp-stack-md">
              <section className="rp-card rp-stack-md">
                <div className="rp-section-head">
                  <div>
                    <span
                      className={`rp-badge ${
                        activeWeakness.severity === "عالية"
                          ? "rp-badge-rose"
                          : "rp-badge-amber"
                      }`}
                    >
                      أولوية {activeWeakness.severity} • درجتك السابقة:{" "}
                      {activeWeakness.originalScore10} / 10
                    </span>
                    <h2 className="rp-h2" style={{ marginTop: 8 }}>
                      {activeWeakness.topic}
                    </h2>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      toggleMastered(activeWeakness.id, !activeWeakness.isMastered)
                    }
                    className={`rp-btn rp-btn-sm ${
                      activeWeakness.isMastered ? "rp-btn-primary" : "rp-btn-outline"
                    }`}
                  >
                    {activeWeakness.isMastered
                      ? "✓ تم تحديدها كمتقنة"
                      : "علّم هذه النقطة كمتقنة"}
                  </button>
                </div>

                <div className="rp-item-rose">
                  <strong style={{ fontSize: 13 }}>تشخيص نقطة الضعف:</strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13.5 }}>
                    {activeWeakness.diagnosis}
                  </p>
                </div>

                <div className="rp-item-emerald">
                  <strong style={{ fontSize: 13.5, color: "#065f46" }}>
                    ✨ الملخص التعليمي السريع (الخلاصة المركزة):
                  </strong>
                  <p style={{ margin: "6px 0 0", fontSize: 14 }}>
                    {activeWeakness.studySummary}
                  </p>
                </div>
              </section>

              {/* مصادر المذاكرة */}
              <section className="rp-card rp-stack-sm">
                <h3 className="rp-h3">
                  📖 مصادر المذاكرة المرشحة ({(activeWeakness.resources || []).length})
                </h3>

                {(activeWeakness.resources || []).map((res) => (
                  <div
                    key={res.id}
                    className={`rp-resource-item ${res.completed ? "done" : ""}`}
                  >
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(res.completed)}
                        onChange={() =>
                          toggleResource(activeWeakness.id, res.id, !res.completed)
                        }
                        style={{ marginTop: 5, width: 18, height: 18, cursor: "pointer" }}
                      />
                      <div>
                        <div className="rp-row-wrap">
                          <span className="rp-badge rp-badge-neutral">
                            {res.typeLabel}
                          </span>
                          <span className="rp-muted-xs">{res.provider}</span>
                          <span className="rp-muted-xs">
                            ⏱ {res.estimatedMinutes} دقيقة
                          </span>
                        </div>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: 14,
                            marginTop: 4,
                            textDecoration: res.completed ? "line-through" : "none",
                          }}
                        >
                          {res.title}
                        </div>
                        <div className="rp-muted-xs">{res.whyRecommended}</div>
                      </div>
                    </div>

                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rp-btn rp-btn-dark rp-btn-sm"
                    >
                      افتح المصدر ↗
                    </a>
                  </div>
                ))}
              </section>

              {/* أسئلة التدريب التفاعلية */}
              <section className="rp-card rp-stack-md">
                <div>
                  <h3 className="rp-h3">
                    🎯 أسئلة التدريب التفاعلية (
                    {(activeWeakness.practiceQuestions || []).length})
                  </h3>
                  <p className="rp-muted-xs" style={{ margin: "2px 0 0" }}>
                    اكتب إجابتك واختبر تقييمها من 10 فوراً قبل إعادة الإنترفيو
                  </p>
                </div>

                {(activeWeakness.practiceQuestions || []).map((pq, idx) => {
                  const isBusy = evaluatingPqId === pq.id;
                  return (
                    <div key={pq.id} className="rp-behavior-row rp-stack-sm">
                      <div className="rp-between">
                        <span className="rp-badge rp-badge-indigo">
                          سؤال تدريب #{idx + 1} • مستوى {pq.difficulty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedHints((p) => ({ ...p, [pq.id]: !p[pq.id] }))
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "#b45309",
                            fontWeight: 800,
                            fontSize: 12.5,
                            cursor: "pointer",
                          }}
                        >
                          💡 {revealedHints[pq.id] ? "إخفاء التلميح" : "اعرض تلميح الحل"}
                        </button>
                      </div>

                      <div style={{ fontWeight: 800, fontSize: 14.5 }}>
                        {pq.question}
                      </div>

                      {revealedHints[pq.id] && (
                        <div className="rp-item-amber" style={{ fontSize: 13 }}>
                          💡 <strong>تلميح:</strong> {pq.hint}
                        </div>
                      )}

                      <textarea
                        rows={3}
                        className="rp-textarea"
                        value={practiceInputs[pq.id] || ""}
                        onChange={(e) =>
                          setPracticeInputs((p) => ({
                            ...p,
                            [pq.id]: e.target.value,
                          }))
                        }
                        placeholder="اكتب إجابتك التدريبية هنا لتقييمها من 10..."
                      />

                      <div className="rp-between">
                        <div className="rp-row-wrap">
                          <button
                            type="button"
                            disabled={
                              isBusy || !(practiceInputs[pq.id] || "").trim()
                            }
                            onClick={() => submitPractice(activeWeakness.id, pq.id)}
                            className="rp-btn rp-btn-primary rp-btn-sm"
                          >
                            {isBusy
                              ? "جاري التقييم..."
                              : "قيّم إجابتي الآن (من 10)"}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setPracticeInputs((p) => ({
                                ...p,
                                [pq.id]: pq.sampleAnswer,
                              }))
                            }
                            className="rp-btn rp-btn-outline rp-btn-sm"
                          >
                            تجربة إجابة قوية جاهزة
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setRevealedSamples((p) => ({
                              ...p,
                              [pq.id]: !p[pq.id],
                            }))
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "#4338ca",
                            fontWeight: 800,
                            fontSize: 12.5,
                            cursor: "pointer",
                          }}
                        >
                          {revealedSamples[pq.id]
                            ? "إخفاء الإجابة النموذجية"
                            : "عرض النقاط المطلوبة والإجابة النموذجية"}
                        </button>
                      </div>

                      {typeof pq.lastScore10 === "number" && (
                        <div
                          className={
                            pq.lastScore10 >= 7.5
                              ? "rp-item-emerald"
                              : "rp-item-amber"
                          }
                        >
                          <div className="rp-between">
                            <strong style={{ fontSize: 13 }}>
                              نتيجة تقييم إجابتك التدريبية:
                            </strong>
                            <span className="rp-badge rp-badge-emerald">
                              {pq.lastScore10} / 10
                            </span>
                          </div>
                          <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                            {pq.lastFeedback}
                          </p>
                        </div>
                      )}

                      {revealedSamples[pq.id] && (
                        <div className="rp-card" style={{ padding: 14 }}>
                          <strong style={{ fontSize: 12.5, color: "#4338ca" }}>
                            النقاط المتوقع تغطيتها:
                          </strong>
                          <ul style={{ margin: "4px 0 8px", paddingRight: 18, fontSize: 12.5 }}>
                            {(pq.expectedKeyPoints || []).map((kp, kIdx) => (
                              <li key={kIdx}>{kp}</li>
                            ))}
                          </ul>
                          <strong style={{ fontSize: 12.5, color: "#047857" }}>
                            نموذج الإجابة:
                          </strong>
                          <p style={{ margin: "4px 0 0", fontSize: 13 }}>
                            {pq.sampleAnswer}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
