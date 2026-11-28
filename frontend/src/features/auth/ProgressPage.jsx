import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { authApi } from "../../api";
import { useAuth } from "./AuthContext";
import "./auth.css";

/**
 * عضو 1 — شاشة تطور الأداء (ProgressPage)
 * رسوم SVG تفاعلية مبنية على بيانات حقيقية من /api/auth/progress:
 * 1) منحنى الدرجة الكلية بين المحاولات
 * 2) تطور المحاور الأربعة (HR / سلوكي / تقني / ثقة)
 * 3) مقارنة أول محاولة بآخر محاولة لكل محور
 * 4) جدول فروق التحسن محاولة بمحاولة
 */

const SERIES = [
  { key: "overallScore100", label: "الدرجة الكلية", color: "#3f7dff" },
  { key: "technical", label: "تقني", color: "#21d3a4" },
  { key: "behavioral", label: "سلوكي", color: "#ffb028" },
  { key: "hr", label: "HR", color: "#a78bfa" },
  { key: "confidence", label: "ثقة", color: "#ff7aa2" },
];

function buildPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  // منحنى سلس (Catmull-Rom → Bezier)
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function LineChart({ items, series = SERIES, height = 240, showLabels = true }) {
  const width = 720;
  const pad = { top: 16, right: 18, bottom: 30, left: 38 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const n = items.length;

  const xFor = (i) => (n <= 1 ? pad.left + innerW / 2 : pad.left + (innerW * i) / (n - 1));
  const yFor = (v) => pad.top + innerH - (Math.max(0, Math.min(100, v)) / 100) * innerH;

  const gridValues = [0, 25, 50, 75, 100];

  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img">
      {gridValues.map((g) => (
        <g key={g}>
          <line
            className="grid-line"
            x1={pad.left}
            x2={width - pad.right}
            y1={yFor(g)}
            y2={yFor(g)}
          />
          <text className="axis-label" x={width - pad.right + 6} y={yFor(g) + 3.5} textAnchor="start">
            {g}
          </text>
        </g>
      ))}

      {items.map((it, i) => (
        <text
          key={`x-${it.index || i}`}
          className="axis-label"
          x={xFor(i)}
          y={height - 8}
          textAnchor="middle"
        >
          {it.attemptNumber ? `#${it.attemptNumber}` : `#${i + 1}`}
        </text>
      ))}

      {series.map((s, si) => {
        const pts = items.map((it, i) => ({ x: xFor(i), y: yFor(it[s.key] ?? 0) }));
        const line = buildPath(pts);
        if (!line) return null;
        // تعبئة المساحة للخط الأساسي فقط (الدرجة الكلية) لتفادي تراكم التظليل
        const area =
          si === 0 && pts.length > 1
            ? `${line} L ${pts[pts.length - 1].x} ${pad.top + innerH} L ${pts[0].x} ${
                pad.top + innerH
              } Z`
            : "";
        return (
          <g key={s.key}>
            {area ? <path className="area-path" d={area} fill={s.color} /> : null}
            <path className="line-path" d={line} stroke={s.color} />
            {showLabels
              ? pts.map((p, i) => (
                  <circle
                    key={i}
                    className="dot"
                    cx={p.x}
                    cy={p.y}
                    r={4.2}
                    fill={s.color}
                  >
                    <title>
                      {`${s.label} — محاولة #${items[i].attemptNumber || i + 1}: ${
                        items[i][s.key] ?? 0
                      }%`}
                    </title>
                  </circle>
                ))
              : null}
          </g>
        );
      })}
    </svg>
  );
}

function scoreText(score) {
  if (score >= 75) return "#5df0c6";
  if (score >= 60) return "#ffcb6b";
  return "#ff9cb0";
}

function GrowthCard({ label, first, latest, color }) {
  const delta = latest - first;
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <div className="growth-item">
      <div className="g-head">
        <span>{label}</span>
        <span className={`delta ${up ? "up" : flat ? "flat" : "down"}`}>
          {up ? "+" : ""}
          {delta} نقطة
        </span>
      </div>
      <div className="growth-bars">
        <div className="gb">
          <span>أول</span>
          <span className="track">
            <i style={{ width: `${first}%`, background: "rgba(148,165,201,0.55)" }} />
          </span>
          <b style={{ color: "#c7d3ea" }}>{first}%</b>
        </div>
        <div className="gb">
          <span>آخر</span>
          <span className="track">
            <i style={{ width: `${latest}%`, background: color }} />
          </span>
          <b style={{ color: color }}>{latest}%</b>
        </div>
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedJob = params.get("jobId") || "";
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("all"); // all | job

  const load = useCallback(async (jobId) => {
    setError("");
    try {
      const res = await authApi.progress(jobId || undefined);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(selectedJob);
  }, [selectedJob, load]);

  const timeline = data?.timeline || [];
  const progressions = data?.jobProgressions || [];

  const activeProgression = useMemo(
    () => progressions.find((p) => p.jobId === selectedJob) || null,
    [progressions, selectedJob]
  );

  const chartItems = useMemo(() => {
    if (view === "job" && activeProgression) return activeProgression.attempts;
    return timeline;
  }, [view, activeProgression, timeline]);

  const kpis = data?.kpis || {};

  if (loading) {
    return (
      <div className="grid grid-2">
        <div className="skeleton" style={{ height: 260 }} />
        <div className="skeleton" style={{ height: 260 }} />
      </div>
    );
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>تطور الأداء بين المحاولات</h1>
          <p>
            {user?.name ? `${user.name} — ` : ""}
            قارن درجاتك عبر المحاولات وتابع تحسّن المحاور الأربعة قبل المقابلة الحقيقية.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="seg" role="group" aria-label="نطاق العرض">
            <button
              type="button"
              className={view === "all" ? "active" : ""}
              onClick={() => setView("all")}
            >
              كل المحاولات
            </button>
            <button
              type="button"
              className={view === "job" ? "active" : ""}
              onClick={() => setView("job")}
              disabled={!activeProgression}
              title={activeProgression ? "" : "اختر وظيفة أولاً"}
            >
              وظيفة محددة
            </button>
          </div>
          <select
            value={selectedJob}
            onChange={(e) => {
              const v = e.target.value;
              if (v) setParams({ jobId: v });
              else setParams({});
            }}
            style={{ minWidth: 210 }}
          >
            <option value="">كل الوظائف</option>
            {(data?.jobs || []).map((j) => (
              <option key={j.id} value={j.id}>
                {j.jobTitle} — {j.companyName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="alert alert--error">{error}</div> : null}

      {timeline.length === 0 ? (
        <div className="empty-state">
          لا توجد محاولات مسجلة بعد لهذا النطاق — ابدأ محاولة من الداشبورد وستظهر هنا منحنيات التطور.
          <div style={{ marginTop: 12 }}>
            <Link to="/dashboard" className="btn btn-primary btn-sm">
              العودة للداشبورد
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card info">
              <div className="kpi-label">عدد المحاولات</div>
              <div className="kpi-value">{kpis.totalAttempts}</div>
              <div className="kpi-sub">في النطاق المحدد</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">أول محاولة</div>
              <div className="kpi-value" style={{ color: scoreText(kpis.firstScore) }}>
                {kpis.firstScore}%
              </div>
              <div className="kpi-sub">نقطة الانطلاق</div>
            </div>
            <div className="kpi-card good">
              <div className="kpi-label">آخر محاولة</div>
              <div className="kpi-value">{kpis.latestScore}%</div>
              <div className="kpi-sub">مستواك الحالي</div>
            </div>
            <div className="kpi-card warn">
              <div className="kpi-label">صافي التحسن</div>
              <div className="kpi-value">
                {kpis.totalGain > 0 ? "+" : ""}
                {kpis.totalGain}
              </div>
              <div className="kpi-sub">أعلى درجة {kpis.bestScore}%</div>
            </div>
          </div>

          <section className="card chart-card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <h3>📈 منحنى الدرجات عبر المحاولات</h3>
              <span className="pill pill--info">
                {view === "job" && activeProgression
                  ? `${activeProgression.jobTitle} — ${activeProgression.companyName}`
                  : "كل الوظائف"}
              </span>
            </div>
            <div className="chart-legend">
              {SERIES.map((s) => (
                <span key={s.key}>
                  <i style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            <LineChart items={chartItems} height={250} />
          </section>

          <div className="grid grid-2" style={{ marginBottom: 16 }}>
            <section className="card">
              <div className="card-head">
                <h3>🧩 تطور المحاور الأربعة (أول ← آخر محاولة)</h3>
              </div>
              {data?.categoryGrowth ? (
                <div className="grid" style={{ gap: 10 }}>
                  <GrowthCard
                    label="الدرجة الكلية"
                    first={data.categoryGrowth.overall.first}
                    latest={data.categoryGrowth.overall.latest}
                    color="#3f7dff"
                  />
                  <GrowthCard
                    label="المحور التقني"
                    first={data.categoryGrowth.technical.first}
                    latest={data.categoryGrowth.technical.latest}
                    color="#21d3a4"
                  />
                  <GrowthCard
                    label="المحور السلوكي"
                    first={data.categoryGrowth.behavioral.first}
                    latest={data.categoryGrowth.behavioral.latest}
                    color="#ffb028"
                  />
                  <GrowthCard
                    label="أسئلة HR"
                    first={data.categoryGrowth.hr.first}
                    latest={data.categoryGrowth.hr.latest}
                    color="#a78bfa"
                  />
                  <GrowthCard
                    label="الثقة واللغة"
                    first={data.categoryGrowth.confidence.first}
                    latest={data.categoryGrowth.confidence.latest}
                    color="#ff7aa2"
                  />
                </div>
              ) : (
                <div className="empty-state">تحتاج محاولة واحدة على الأقل لعرض المقارنة.</div>
              )}
            </section>

            <section className="card">
              <div className="card-head">
                <h3>🎯 تقدمك لكل وظيفة</h3>
                <span className="pill">{progressions.length} وظيفة</span>
              </div>
              {progressions.length === 0 ? (
                <div className="empty-state">لا توجد وظائف مرتبطة بمحاولات بعد.</div>
              ) : (
                <div className="grid" style={{ gap: 10 }}>
                  {progressions.map((p) => (
                    <div className="growth-item" key={p.jobKey}>
                      <div className="g-head">
                        <span>
                          {p.jobTitle} · <small>{p.companyName}</small>
                        </span>
                        <span className={`delta ${p.netImprovement > 0 ? "up" : p.netImprovement < 0 ? "down" : "flat"}`}>
                          {p.netImprovement > 0 ? "+" : ""}
                          {p.netImprovement} نقطة
                        </span>
                      </div>
                      <div className="growth-bars">
                        <div className="gb">
                          <span>أول</span>
                          <span className="track">
                            <i style={{ width: `${p.firstScore}%`, background: "rgba(148,165,201,0.55)" }} />
                          </span>
                          <b style={{ color: "#c7d3ea" }}>{p.firstScore}%</b>
                        </div>
                        <div className="gb">
                          <span>آخر</span>
                          <span className="track">
                            <i style={{ width: `${p.latestScore}%`, background: "#3f7dff" }} />
                          </span>
                          <b style={{ color: "#9dbeff" }}>{p.latestScore}%</b>
                        </div>
                      </div>
                      <div className="job-stats" style={{ marginTop: 6 }}>
                        <span>محاولات: <b>{p.attemptsCount}</b></span>
                        <span>أعلى: <b>{p.bestScore}%</b></span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setParams({ jobId: p.jobId });
                            setView("job");
                          }}
                        >
                          عرض تفاصيلها
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card-head">
              <h3>📊 فروق التحسن محاولة بمحاولة</h3>
              <span className="pill">{chartItems.length} محاولة</span>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الوظيفة / الشركة</th>
                    <th>النوع</th>
                    <th>الدرجة</th>
                    <th>الفرق</th>
                    <th>تقني</th>
                    <th>سلوكي</th>
                    <th>HR</th>
                    <th>ثقة</th>
                    <th>الجاهزية</th>
                    <th>التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {chartItems.map((it, i) => (
                    <tr key={it.reportId}>
                      <td>#{it.attemptNumber ?? i + 1}</td>
                      <td>
                        {it.jobTitle} · <small>{it.companyName}</small>
                      </td>
                      <td>
                        <span className="pill">
                          {it.mode === "weakness_retake" ? "إعادة ضعف" : "كاملة"}
                        </span>
                      </td>
                      <td>
                        <b style={{ color: scoreText(it.overallScore100) }}>{it.overallScore100}%</b>
                      </td>
                      <td>
                        {it.hasPrevious === false || (i === 0 && !it.hasPrevious) ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            className={`delta ${
                              (it.deltaFromPrevious || 0) > 0
                                ? "up"
                                : (it.deltaFromPrevious || 0) < 0
                                ? "down"
                                : "flat"
                            }`}
                          >
                            {(it.deltaFromPrevious || 0) > 0 ? "+" : ""}
                            {it.deltaFromPrevious || 0}
                          </span>
                        )}
                      </td>
                      <td>{it.technical}%</td>
                      <td>{it.behavioral}%</td>
                      <td>{it.hr}%</td>
                      <td>{it.confidence}%</td>
                      <td>{it.readinessVerdict === "ready" ? "متمكن" : it.readinessVerdict === "almost_ready" ? "قريب" : "يحتاج تدريب"}</td>
                      <td>
                        {new Date(it.createdAt).toLocaleDateString("ar-EG", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link to="/dashboard" className="btn btn-ghost btn-sm">
                ← الداشبورد
              </Link>
              <Link to="/" className="btn btn-ghost btn-sm">
                📝 التقارير والمذاكرة
              </Link>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
