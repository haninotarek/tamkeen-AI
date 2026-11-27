import React from "react";
import * as Member5Module from "../behavior/BehaviorCharts.jsx";

class BehaviorErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function BuiltInBehaviorCharts({ evaluations = [], behaviorDataSource = "estimated" }) {
  if (!evaluations.length) return null;

  const count = evaluations.length;
  const avg = (fn) =>
    Math.round(evaluations.reduce((s, q) => s + fn(q.behaviorMetrics || {}), 0) / count);

  const avgConfidence = avg((m) => m.confidenceLevel ?? 70);
  const avgFocus = avg((m) => m.focusLevel ?? 75);
  const avgStress = avg((m) => m.stressLevel ?? 35);
  const avgEye = avg((m) => m.eyeContactPercent ?? 72);
  const totalFillers = evaluations.reduce(
    (s, q) => s + (q.behaviorMetrics?.fillerWordsCount ?? 0),
    0
  );

  return (
    <section className="rp-card rp-stack-md">
      <div className="rp-section-head">
        <div>
          <h3 className="rp-h2">📊 مؤشرات السلوك ولغة الجسد والصوت</h3>
          <p className="rp-muted">
            تحليل الثقة والتركيز والتوتر والتواصل البصري عبر مراحل المقابلة (بالتكامل مع موديول عضو 5)
          </p>
        </div>
        <span
          className={`rp-badge ${
            behaviorDataSource === "member5" ? "rp-badge-emerald" : "rp-badge-amber"
          }`}
        >
          {behaviorDataSource === "member5"
            ? "بيانات عضو 5 المباشرة (MediaPipe + الصوت)"
            : "تقدير ذكي تلقائي من النص"}
        </span>
      </div>

      <div className="rp-kpi-grid">
        <div className="rp-kpi-box">
          <div className="rp-kpi-label">متوسط الثقة</div>
          <div className="rp-kpi-value rp-text-emerald">{avgConfidence}%</div>
        </div>
        <div className="rp-kpi-box">
          <div className="rp-kpi-label">مستوى التركيز</div>
          <div className="rp-kpi-value">{avgFocus}%</div>
        </div>
        <div className="rp-kpi-box">
          <div className="rp-kpi-label">التواصل البصري</div>
          <div className="rp-kpi-value">{avgEye}%</div>
        </div>
        <div className="rp-kpi-box">
          <div className="rp-kpi-label">التوتر / التلعثم</div>
          <div className="rp-kpi-value rp-text-amber">
            {avgStress}% <span className="rp-muted-xs">({totalFillers} لزمات)</span>
          </div>
        </div>
      </div>

      <div className="rp-stack-sm">
        {evaluations.map((ev) => {
          const bm = ev.behaviorMetrics || {};
          return (
            <div key={ev.id} className="rp-behavior-row">
              <div className="rp-between">
                <strong>
                  س{ev.questionIndex}: {ev.topic}
                </strong>
                <span className="rp-muted-xs">
                  التعبير السائد: <strong>{bm.dominantExpression || "متزن"}</strong> • السرعة:{" "}
                  {bm.wordsPerMinute || 120} كلمة/دقيقة • التلعثم: {bm.fillerWordsCount ?? 0}
                </span>
              </div>

              <div className="rp-bars-3">
                <div>
                  <div className="rp-between rp-muted-xs">
                    <span>الثقة</span>
                    <span>{bm.confidenceLevel ?? 70}%</span>
                  </div>
                  <div className="rp-progress-track">
                    <div
                      className="rp-progress-fill rp-fill-emerald"
                      style={{ width: `${bm.confidenceLevel ?? 70}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="rp-between rp-muted-xs">
                    <span>التركيز</span>
                    <span>{bm.focusLevel ?? 75}%</span>
                  </div>
                  <div className="rp-progress-track">
                    <div
                      className="rp-progress-fill rp-fill-blue"
                      style={{ width: `${bm.focusLevel ?? 75}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="rp-between rp-muted-xs">
                    <span>التوتر</span>
                    <span>{bm.stressLevel ?? 35}%</span>
                  </div>
                  <div className="rp-progress-track">
                    <div
                      className="rp-progress-fill rp-fill-rose"
                      style={{ width: `${bm.stressLevel ?? 35}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * يتكامل تلقائياً مع frontend/src/features/behavior/BehaviorCharts.jsx عند كتابته بواسطة (عضو 5)،
 * ويعرض المخطط المدمج بأمان تام إذا كان ملف عضو 5 لا يزال قيد الإنشاء (0 bytes).
 */
export default function BehaviorSection({ evaluations = [], behaviorDataSource = "estimated" }) {
  const fallback = (
    <BuiltInBehaviorCharts
      evaluations={evaluations}
      behaviorDataSource={behaviorDataSource}
    />
  );

  const mod = Object(Member5Module);
  const ExternalCharts = mod["default"] || mod["BehaviorCharts"] || null;

  if (typeof ExternalCharts === "function") {
    return (
      <BehaviorErrorBoundary fallback={fallback}>
        <ExternalCharts
          evaluations={evaluations}
          metrics={evaluations.map((e) => e.behaviorMetrics)}
          data={evaluations}
          behaviorDataSource={behaviorDataSource}
        />
      </BehaviorErrorBoundary>
    );
  }

  return fallback;
}
