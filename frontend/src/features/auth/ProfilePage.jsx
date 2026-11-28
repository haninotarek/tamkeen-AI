import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../../api";
import { useAuth } from "./AuthContext";
import "./auth.css";

/**
 * عضو 1 — صفحة الملف الشخصي: تعديل بيانات المستخدم فعلياً في قاعدة البيانات
 * (PATCH /api/auth/profile) مع عرض ملخص النشاط من الداشبورد.
 */
const LEVELS = ["Fresh Graduate", "Junior", "Mid-Level", "Senior"];

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, setUser, isAuthenticated, initializing } = useAuth();
  const [form, setForm] = useState({
    name: "",
    headline: "",
    targetField: "",
    experienceLevel: "Fresh Graduate",
  });
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initializing && !isAuthenticated) navigate("/login", { replace: true });
  }, [initializing, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        headline: user.headline || "",
        targetField: user.targetField || "",
        experienceLevel: user.experienceLevel || "Fresh Graduate",
      });
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated) return;
    authApi
      .dashboard()
      .then((d) => setStats(d.summary))
      .catch(() => {});
  }, [isAuthenticated]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const res = await authApi.updateProfile(form);
      setUser(res.user);
      setMsg("تم تحديث بياناتك بنجاح ✅");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (initializing || !user) {
    return <div className="skeleton" style={{ height: 200 }} />;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>ملفي الشخصي</h1>
          <p>حدّث بياناتك المستخدمة في تخصيص المقابلات وتحليل الجاهزية.</p>
        </div>
      </div>

      {msg ? <div className="alert alert--success">{msg}</div> : null}
      {error ? <div className="alert alert--error">{error}</div> : null}

      <div className="grid grid-2">
        <section className="card">
          <div className="card-head">
            <h3>البيانات الأساسية</h3>
            <span className="pill pill--info">
              {user.authProvider === "google" ? "حساب Google" : "بريد إلكتروني"}
            </span>
          </div>
          <form onSubmit={save}>
            <div className="field">
              <label>الاسم الكامل</label>
              <input value={form.name} onChange={set("name")} required />
            </div>
            <div className="field">
              <label>البريد الإلكتروني (غير قابل للتعديل)</label>
              <input value={user.email} dir="ltr" disabled />
            </div>
            <div className="field">
              <label>نبذة قصيرة</label>
              <input value={form.headline} onChange={set("headline")} placeholder="مثال: باك إند .NET / Python" />
            </div>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="field">
                <label>المجال المستهدف</label>
                <input value={form.targetField} onChange={set("targetField")} />
              </div>
              <div className="field">
                <label>مستوى الخبرة</label>
                <select value={form.experienceLevel} onChange={set("experienceLevel")}>
                  {LEVELS.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? <span className="spinner" /> : null} حفظ التعديلات
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>ملخص نشاطي</h3>
          </div>
          {stats ? (
            <div className="grid" style={{ gap: 10 }}>
              <div className="growth-item">
                <div className="g-head">
                  <span>الوظائف المستهدفة</span>
                  <b>{stats.totalJobs}</b>
                </div>
                <div className="growth-bars">
                  <div className="gb">
                    <span>جاهزة</span>
                    <span className="track">
                      <i
                        style={{
                          width: `${stats.totalJobs ? (stats.readyJobs / stats.totalJobs) * 100 : 0}%`,
                          background: "#21d3a4",
                        }}
                      />
                    </span>
                    <b>{stats.readyJobs}</b>
                  </div>
                </div>
              </div>
              <div className="job-stats">
                <span>المحاولات: <b>{stats.totalAttempts}</b></span>
                <span>أعلى درجة: <b>{stats.bestScore}%</b></span>
                <span>المتوسط: <b>{stats.averageScore}%</b></span>
              </div>
              <div className="job-stats">
                <span>السير الذاتية: <b>{stats.totalCvs}</b></span>
                <span>أفضل ATS: <b>{stats.bestAtsScore}%</b></span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <Link to="/dashboard" className="btn btn-ghost btn-sm">
                  الداشبورد
                </Link>
                <Link to="/progress" className="btn btn-ghost btn-sm">
                  تطور الأداء
                </Link>
              </div>
            </div>
          ) : (
            <div className="empty-state">جارٍ تحميل الملخص…</div>
          )}
          <div style={{ marginTop: 14 }}>
            <small>
              تاريخ إنشاء الحساب:{" "}
              {user.createdAt
                ? new Date(user.createdAt).toLocaleString("ar-EG")
                : "—"}
            </small>
          </div>
        </section>
      </div>
    </div>
  );
}
