import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../../api";
import { useAuth } from "./AuthContext";
import "./auth.css";

/**
 * عضو 1 — شاشة الداشبورد (DashboardPage)
 * بيانات حقيقية من /api/auth/dashboard: الوظائف المستهدفة (CRUD)، سجل المحاولات،
 * مؤشرات الجاهزية، نظرة على الـ CVs، وإجراءات سريعة.
 */

const JOB_LEVELS = ["Fresh Graduate", "Junior", "Mid-Level", "Senior"];
const STATUS_MAP = {
  preparing: { label: "قيد التحضير", cls: "pill--info" },
  practicing: { label: "قيد التدريب", cls: "pill--warn" },
  ready: { label: "جاهز للتقديم", cls: "pill--good" },
  applied: { label: "تم التقديم", cls: "pill--info" },
  archived: { label: "مؤرشفة", cls: "" },
};
const VERDICT_MAP = {
  ready: "متمكن — جاهز للمقابلة الحقيقية",
  almost_ready: "قريب من التمكن",
  needs_practice: "يحتاج تدريب",
  not_started: "لم تبدأ بعد",
};

function scoreColor(score) {
  if (score == null) return "rgba(148,165,201,0.2)";
  if (score >= 75) return "rgba(33,211,164,0.24)";
  if (score >= 60) return "rgba(255,176,40,0.24)";
  return "rgba(255,92,122,0.24)";
}

function scoreText(score) {
  if (score == null) return "var(--muted)";
  if (score >= 75) return "#5df0c6";
  if (score >= 60) return "#ffcb6b";
  return "#ff9cb0";
}

function DeltaBadge({ value, hasPrevious = true }) {
  if (!hasPrevious) return <span className="pill">المحاولة الأولى</span>;
  const v = value || 0;
  const cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
  const sign = v > 0 ? "+" : "";
  return (
    <span className={`delta ${cls}`}>
      {sign}
      {v} نقطة
    </span>
  );
}

function JobModal({ open, onClose, onSubmit, initial, busy }) {
  const [form, setForm] = useState({
    companyName: "",
    jobTitle: "",
    jobLevel: "Fresh Graduate",
    jobDescription: "",
    status: "preparing",
  });
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setErr("");
      setForm({
        companyName: initial?.companyName || "",
        jobTitle: initial?.jobTitle || "",
        jobLevel: initial?.jobLevel || "Fresh Graduate",
        jobDescription: initial?.jobDescription || "",
        status: initial?.status || "preparing",
      });
    }
  }, [open, initial]);

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{initial?.id ? "تعديل الوظيفة المستهدفة" : "إضافة وظيفة مستهدفة"}</h3>
        {err ? <div className="alert alert--error">{err}</div> : null}
        <div className="field">
          <label>اسم الشركة *</label>
          <input value={form.companyName} onChange={set("companyName")} placeholder="مثال: فوري، VOIS، إنستابج" />
        </div>
        <div className="field">
          <label>المسمى الوظيفي *</label>
          <input value={form.jobTitle} onChange={set("jobTitle")} placeholder="مثال: Backend Developer" />
        </div>
        <div className="grid grid-2" style={{ gap: 10 }}>
          <div className="field">
            <label>المستوى</label>
            <select value={form.jobLevel} onChange={set("jobLevel")}>
              {JOB_LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>الحالة</label>
            <select value={form.status} onChange={set("status")}>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>الوصف الوظيفي (Job Description)</label>
          <textarea
            value={form.jobDescription}
            onChange={set("jobDescription")}
            placeholder="الصق وصف الوظيفة هنا..."
          />
          <small>
            يقرأ هذا الوصف تلقائياً: بحث الشركة (عضو 2)، محرك المقابلة (عضو 3)، وتحليل الـ CV (عضو 7).
          </small>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => {
              if (!form.companyName.trim() || !form.jobTitle.trim()) {
                setErr("اسم الشركة والمسمى الوظيفي مطلوبان.");
                return;
              }
              onSubmit(form);
            }}
          >
            {busy ? <span className="spinner" /> : null}
            {initial?.id ? "حفظ التعديلات" : "إضافة الوظيفة"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState({ open: false, initial: null });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [attemptBusy, setAttemptBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await authApi.dashboard();
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const summary = data?.summary;
  const jobs = data?.jobs || [];
  const attempts = data?.attempts || [];
  const cvs = data?.cvs || [];

  const topWeaknessAttempt = useMemo(() => {
    const sorted = [...attempts].sort((a, b) => (a.overallScore100 || 0) - (b.overallScore100 || 0));
    return sorted[0] || null;
  }, [attempts]);

  async function saveJob(form) {
    setBusy(true);
    try {
      if (modal.initial?.id) {
        await authApi.updateJob(modal.initial.id, form);
        setToast("تم تحديث الوظيفة بنجاح ✅");
      } else {
        await authApi.createJob(form);
        setToast("تمت إضافة الوظيفة المستهدفة ✅");
      }
      setModal({ open: false, initial: null });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeJob(job) {
    if (!window.confirm(`حذف وظيفة "${job.jobTitle}" من قائمتك؟`)) return;
    try {
      await authApi.deleteJob(job.id);
      setToast("تم حذف الوظيفة");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function quickPractice(job) {
    setAttemptBusy(job.id);
    try {
      const base = job.latestScore ?? 55;
      const next = Math.min(98, base + 6 + Math.floor(Math.random() * 12));
      await authApi.recordAttempt({
        jobId: job.id,
        overallScore100: next,
        mode: job.attemptsCount ? "weakness_retake" : "full_interview",
        hrScore: Math.min(100, next + 4),
        behavioralScore: Math.max(30, next - 3),
        technicalScore: Math.max(30, next - 5),
        confidenceScore: Math.min(100, next + 2),
      });
      setToast(`تم تسجيل محاولة جديدة بدرجة ${next}% ✅`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setAttemptBusy("");
    }
  }

  if (loading) {
    return (
      <div className="grid grid-4">
        {[0, 1, 2, 3].map((i) => (
          <div className="skeleton" key={i} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>أهلاً {user?.name || "بك"} 👋</h1>
          <p>
            {user?.headline || "تابع وظائفك المستهدفة، محاولاتك، وجاهزيتك للمقابلة من مكان واحد."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link to="/progress" className="btn btn-ghost btn-sm">
            📈 تطور الأداء
          </Link>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setModal({ open: true, initial: null })}
          >
            ＋ وظيفة مستهدفة
          </button>
        </div>
      </div>

      {error ? <div className="alert alert--error">{error}</div> : null}
      {toast ? <div className="alert alert--success">{toast}</div> : null}

      {summary ? (
        <div className="kpi-grid">
          <div className="kpi-card info">
            <div className="kpi-label">الوظائف المستهدفة</div>
            <div className="kpi-value">{summary.totalJobs}</div>
            <div className="kpi-sub">{summary.readyJobs} جاهزة للتقديم</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">عدد المحاولات</div>
            <div className="kpi-value">{summary.totalAttempts}</div>
            <div className="kpi-sub">موزعة على كل الوظائف</div>
          </div>
          <div className="kpi-card good">
            <div className="kpi-label">أعلى درجة وصلتها</div>
            <div className="kpi-value">{summary.bestScore}%</div>
            <div className="kpi-sub">متوسطك الحالي {summary.averageScore}%</div>
          </div>
          <div className="kpi-card warn">
            <div className="kpi-label">أفضل تقييم ATS للسيرة</div>
            <div className="kpi-value">{summary.bestAtsScore}%</div>
            <div className="kpi-sub">{summary.totalCvs} سيرة محفوظة</div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <section className="card">
          <div className="card-head">
            <h3>🎯 الوظائف المستهدفة</h3>
            <span className="pill pill--info">{jobs.length} وظيفة</span>
          </div>

          {jobs.length === 0 ? (
            <div className="empty-state">
              لا توجد وظائف بعد — أضف أول وظيفة مستهدفة لتبدأ التدريب عليها.
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setModal({ open: true, initial: null })}
                >
                  إضافة وظيفة
                </button>
              </div>
            </div>
          ) : (
            <div className="job-grid">
              {jobs.map((job) => {
                const st = STATUS_MAP[job.status] || STATUS_MAP.preparing;
                const latest = job.latestScore;
                return (
                  <article className="job-card" key={job.id}>
                    <div className="job-card-top">
                      <div>
                        <h4>{job.jobTitle}</h4>
                        <small>
                          {job.companyName} · {job.jobLevel}
                        </small>
                      </div>
                      <span className={`pill ${st.cls}`}>{st.label}</span>
                    </div>

                    <div className="job-progress">
                      <div className="bar">
                        <span style={{ width: `${latest ?? 0}%` }} />
                      </div>
                      <div className="job-stats">
                        <span>
                          آخر درجة:{" "}
                          <b style={{ color: scoreText(latest) }}>{latest != null ? `${latest}%` : "—"}</b>
                        </span>
                        <span>
                          أعلى درجة: <b>{job.bestScore != null ? `${job.bestScore}%` : "—"}</b>
                        </span>
                        <span>
                          المحاولات: <b>{job.attemptsCount}</b>
                        </span>
                      </div>
                      <div className="job-stats">
                        <span>
                          التطور منذ البداية:{" "}
                          {job.attemptsCount > 1 ? (
                            <DeltaBadge value={job.improvementDelta} />
                          ) : (
                            <span className="pill">لا مقارنة بعد</span>
                          )}
                        </span>
                      </div>
                      <div className="job-stats">
                        <span>الجاهزية: {VERDICT_MAP[job.readinessVerdict] || "لم تبدأ بعد"}</span>
                        {!job.jobDescription ? (
                          <span className="pill pill--warn" title="أضف وصف الوظيفة لتفعيل البحث والمقابلة الذكية">
                            بلا وصف وظيفي
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="job-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={attemptBusy === job.id}
                        onClick={() => quickPractice(job)}
                        title="تسجيل محاولة جديدة سريعة لهذه الوظيفة"
                      >
                        {attemptBusy === job.id ? <span className="spinner" /> : "🎤 محاولة جديدة"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/progress?jobId=${encodeURIComponent(job.id)}`)}
                      >
                        📈 تطوري
                      </button>
                      {job.latestReportId ? (
                        <Link to={`/report/${job.latestReportId}`} className="btn btn-ghost btn-sm">
                          📝 آخر تقرير
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setModal({ open: true, initial: job })}
                      >
                        تعديل
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => removeJob(job)}
                      >
                        حذف
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>🕘 سجل المحاولات</h3>
            <span className="pill">{attempts.length} محاولة</span>
          </div>

          {attempts.length === 0 ? (
            <div className="empty-state">لا توجد محاولات مسجلة بعد. ابدأ أول مقابلة تجريبية.</div>
          ) : (
            <div className="timeline-list">
              {attempts.slice(0, 8).map((a) => (
                <div className="timeline-row" key={a.reportId}>
                  <span className="idx">#{a.attemptNumber}</span>
                  <div className="t-main">
                    <strong>
                      {a.jobTitle} · {a.companyName}
                    </strong>
                    <small>
                      {new Date(a.createdAt).toLocaleDateString("ar-EG", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {a.mode === "weakness_retake" ? "إعادة نقاط الضعف" : "مقابلة كاملة"}
                    </small>
                  </div>
                  <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                    <span
                      className="score-chip"
                      style={{ background: scoreColor(a.overallScore100), color: scoreText(a.overallScore100) }}
                    >
                      {a.overallScore100}%
                    </span>
                    <DeltaBadge
                      value={a.deltaFromPrevious}
                      hasPrevious={a.deltaFromPrevious != null}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {attempts.length > 0 ? (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link to="/progress" className="btn btn-ghost btn-sm">
                عرض كل التحليلات
              </Link>
              {topWeaknessAttempt ? (
                <Link to={`/report/${topWeaknessAttempt.reportId}`} className="btn btn-ghost btn-sm">
                  🔍 راجع أضعف محاولة ({topWeaknessAttempt.overallScore100}%)
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h3>📄 سيرك الذاتية (CVs)</h3>
            <span className="pill">{cvs.length}</span>
          </div>
          {cvs.length === 0 ? (
            <div className="empty-state">
              لا توجد سير ذاتية محفوظة بعد — أنشئ سيرتك من استوديو السيرة لتحصل على تقييم ATS.
              <div style={{ marginTop: 12 }}>
                <Link to="/cv" className="btn btn-primary btn-sm">
                  اذهب لاستوديو السيرة
                </Link>
              </div>
            </div>
          ) : (
            <div className="timeline-list">
              {cvs.map((c) => (
                <div className="timeline-row" key={c.id}>
                  <span className="idx">📄</span>
                  <div className="t-main">
                    <strong>{c.title}</strong>
                    <small>
                      ATS {c.atsScore}% · مطابقة الوظيفة {c.jobMatchScore}%
                      {c.missingKeywords?.length ? ` · ينقصك: ${c.missingKeywords.slice(0, 3).join("، ")}` : ""}
                    </small>
                  </div>
                  <span
                    className="score-chip"
                    style={{ background: scoreColor(c.atsScore), color: scoreText(c.atsScore) }}
                  >
                    {c.atsScore}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h3>⚡ إجراءات سريعة</h3>
          </div>
          <div className="grid" style={{ gap: 9 }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setModal({ open: true, initial: null })}
            >
              ＋ إضافة وظيفة مستهدفة جديدة
            </button>
            <Link to="/" className="btn btn-ghost btn-block">
              📝 التقارير ومذاكرة نقاط الضعف
            </Link>
            <Link to="/progress" className="btn btn-ghost btn-block">
              📈 تحليل تطور الأداء بين المحاولات
            </Link>
            <Link to="/profile" className="btn btn-ghost btn-block">
              ⚙️ تحديث بياناتي الشخصية
            </Link>
          </div>

          {data?.dbStats ? (
            <div style={{ marginTop: 14 }}>
              <small>قاعدة البيانات المتصلة (SQLite) — السجلات الحالية:</small>
              <div className="job-stats" style={{ marginTop: 6 }}>
                <span>مستخدمون: <b>{data.dbStats.users}</b></span>
                <span>وظائف: <b>{data.dbStats.jobs}</b></span>
                <span>مقابلات: <b>{data.dbStats.interviews}</b></span>
                <span>تقارير: <b>{data.dbStats.reports}</b></span>
                <span>سير ذاتية: <b>{data.dbStats.cvs}</b></span>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <JobModal
        open={modal.open}
        initial={modal.initial}
        busy={busy}
        onClose={() => setModal({ open: false, initial: null })}
        onSubmit={saveJob}
      />
    </div>
  );
}
