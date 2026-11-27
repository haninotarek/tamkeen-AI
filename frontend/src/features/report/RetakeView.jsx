import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { reportApi } from "./reportApi";
import "./report.css";

/**
 * شاشة ومكون "إعادة الإنترفيو على النقاط الضعيفة بس"
 * يعمل كمكون مضمّن داخل ReportPage/StudyPage أو كمسار مستقل /retake/:sessionId
 */
export default function RetakeView({
  sessionId: propSessionId,
  initialSession = null,
  onCompleteReport = null,
  onBack = null,
}) {
  const params = useParams();
  const navigate = useNavigate();
  const resolvedSessionId = propSessionId || params?.sessionId;

  const [session, setSession] = useState(initialSession);
  const [loading, setLoading] = useState(!initialSession);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialSession) {
      setSession(initialSession);
      setLoading(false);
      return;
    }
    if (!resolvedSessionId) {
      setLoading(false);
      return;
    }
    reportApi
      .getRetakeSession(resolvedSessionId)
      .then((data) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [resolvedSessionId, initialSession]);

  function fillStrongAnswers() {
    if (!session) return;
    const next = {};
    (session.questions || []).forEach((q) => {
      next[q.id] = q.sampleStrongAnswer;
    });
    setAnswers(next);
  }

  async function submitRetake() {
    if (!session) return;
    setSubmitting(true);
    try {
      const qaList = session.questions.map((q) => ({
        category: q.category,
        topic: q.topic,
        question: q.question,
        userAnswer: answers[q.id] || "",
        expectedKeyPoints: q.expectedKeyPoints,
      }));

      const res = await reportApi.generateReport({
        attemptNumber: session.attemptNumber,
        mode: "weakness_retake",
        parentReportId: session.parentReportId,
        jobContext: session.jobContext,
        qaList,
      });

      if (res.report?.id) {
        if (typeof onCompleteReport === "function") {
          onCompleteReport(res.report);
        } else {
          navigate(`/report?id=${res.report.id}`);
        }
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="rp-card" style={{ textAlign: "center", padding: 60 }}>
        <strong>جاري تحميل جلسة إعادة الإنترفيو المخصصة لنقاط الضعف...</strong>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rp-card" style={{ textAlign: "center", padding: 60 }}>
        <p className="rp-text-rose" style={{ fontWeight: 800 }}>
          جلسة إعادة الإنترفيو غير موجودة
        </p>
        <button
          type="button"
          onClick={() => (onBack ? onBack() : navigate("/report"))}
          className="rp-btn rp-btn-dark"
          style={{ marginTop: 12 }}
        >
          العودة للتقرير
        </button>
      </div>
    );
  }

  const answeredCount = (session.questions || []).filter(
    (q) => (answers[q.id] || "").trim().length > 0
  ).length;

  return (
    <div className="rp-stack-lg">
      <section className="rp-hero-dark">
        <button
          type="button"
          onClick={() =>
            onBack ? onBack() : navigate(`/report?id=${session.parentReportId}`)
          }
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#6ee7b7",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          → العودة إلى التقرير الأصلي
        </button>

        <div className="rp-between" style={{ marginTop: 10 }}>
          <div>
            <span className="rp-badge rp-badge-emerald">
              🎯 المحاولة #{session.attemptNumber} • وضع نقاط الضعف فقط
            </span>
            <h1 className="rp-h1" style={{ color: "#fff" }}>
              إعادة الإنترفيو على النقاط الضعيفة بس
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: "#cbd5e1" }}>
              تم استبعاد الأسئلة المتقنة، وتوليد {session.questions.length} أسئلة جديدة تختبر فقط نقاط الضعف لديك في مقابلة{" "}
              <strong>
                {session.jobContext?.companyName} ({session.jobContext?.jobTitle})
              </strong>
            </p>
          </div>

          <button
            type="button"
            onClick={fillStrongAnswers}
            className="rp-btn rp-btn-primary"
          >
            ✨ ملء إجابات متقنة (للتجربة السريعة)
          </button>
        </div>
      </section>

      <div className="rp-stack-md">
        {session.questions.map((q, idx) => (
          <section key={q.id} className="rp-card rp-stack-sm">
            <div className="rp-between">
              <div className="rp-row-wrap">
                <span className="rp-q-num">
                  سؤال الإعادة {idx + 1} من {session.questions.length}
                </span>
                <span className="rp-badge rp-badge-emerald">
                  يختبر نقطة الضعف: {q.topic}
                </span>
              </div>
              <span className="rp-text-rose" style={{ fontSize: 12.5, fontWeight: 800 }}>
                درجتك السابقة: {q.previousScore10} / 10
              </span>
            </div>

            <h3 className="rp-h3" style={{ marginTop: 4 }}>
              {q.question}
            </h3>

            <textarea
              rows={4}
              className="rp-textarea"
              value={answers[q.id] || ""}
              onChange={(e) =>
                setAnswers((p) => ({ ...p, [q.id]: e.target.value }))
              }
              placeholder="اكتب إجابتك المحسّنة بعد المذاكرة هنا (عند الربط مع غرفة الصوت عند عضو 3 و4 تُستقبل الإجابة تلقائياً)..."
            />
          </section>
        ))}
      </div>

      <div className="rp-card rp-between">
        <strong>
          أجبت على {answeredCount} من {session.questions.length} أسئلة مستهدفة
        </strong>
        <button
          type="button"
          disabled={submitting || answeredCount === 0}
          onClick={submitRetake}
          className="rp-btn rp-btn-primary"
        >
          {submitting
            ? "جاري إصدار التقرير المقارن الجديد..."
            : "إنهاء المقابلة وإصدار التقرير المقارن الجديد ←"}
        </button>
      </div>
    </div>
  );
}
