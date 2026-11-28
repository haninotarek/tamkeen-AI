import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import "./auth.css";

/**
 * عضو 1 — شاشة تسجيل الدخول / إنشاء حساب
 * - بريد إلكتروني + كلمة مرور (تسجيل + دخول حقيقي عبر /api/auth/*)
 * - تسجيل الدخول بحساب Google (Google Identity Services إن توفر GOOGLE_CLIENT_ID
 *   وإلا التدفق التفاعلي المباشر المدعوم من الخادم)
 */
const DEMO_EMAIL = "hazem@tamkeen.ai";
const DEMO_PASSWORD = "123456";

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.8l7.8 6.1C12.3 13.6 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.1a14.5 14.5 0 0 1 0-8.2l-7.8-6.1a24 24 0 0 0 0 20.4l7.8-6.1z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.5-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.9 2.3-6.4 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, register, loginWithGoogle, googleClientId, isAuthenticated } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    headline: "",
    targetField: "",
    experienceLevel: "Fresh Graduate",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleBtnRef = useRef(null);
  const gsiInitialized = useRef(false);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  // تهيئة زر Google الرسمي عندما يتوفر GOOGLE_CLIENT_ID من الخادم
  useEffect(() => {
    if (!googleClientId || gsiInitialized.current) return;
    const scriptId = "google-gsi-script";
    if (!document.getElementById(scriptId)) {
      const s = document.createElement("script");
      s.id = scriptId;
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => mountGsi();
      document.body.appendChild(s);
    } else {
      mountGsi();
    }

    function mountGsi() {
      const g = window.google?.accounts?.id;
      if (!g || !googleBtnRef.current || gsiInitialized.current) return;
      g.initialize({
        client_id: googleClientId,
        callback: async (resp) => {
          setError("");
          setGoogleBusy(true);
          try {
            await loginWithGoogle({ credential: resp.credential });
            navigate("/dashboard", { replace: true });
          } catch (e) {
            setError(e.message);
          } finally {
            setGoogleBusy(false);
          }
        },
      });
      g.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
        locale: "ar",
      });
      gsiInitialized.current = true;
    }
  }, [googleClientId, loginWithGoogle, navigate]);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.email.trim(), form.password);
      } else {
        await register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          headline: form.headline || "خريج مستعد لسوق العمل",
          targetField: form.targetField || "تطوير البرمجيات",
          experienceLevel: form.experienceLevel,
        });
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function quickGoogle() {
    setError("");
    setGoogleBusy(true);
    try {
      // في وضع العرض التجريبي نربط حساب Google بالحساب التجريبي حتى تظهر بياناته
      await loginWithGoogle({
        email: DEMO_EMAIL,
        name: "مستخدم Google",
        googleSub: "demo-google-sub",
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setGoogleBusy(false);
    }
  }

  function fillDemo() {
    setMode("login");
    setForm((f) => ({ ...f, email: DEMO_EMAIL, password: DEMO_PASSWORD }));
    setError("");
  }

  return (
    <div className="auth-screen">
      <section className="auth-hero">
        <span className="pill pill--info">منصة جاهز · تمكين AI</span>
        <h1>
          استعد للمقابلة الحقيقية
          <br />
          <span className="grad">بتدريب ذكي وتقييم حقيقي</span>
        </h1>
        <p>
          سجّل حسابك لمتابعة كل محاولاتك، ومعرفة نقاط قوتك وضعفك، ورؤية تطور درجاتك
          خطوة بخطوة حتى تصل إلى جاهزية كاملة قبل التقديم.
        </p>

        <div className="auth-features">
          <div className="auth-feature">
            <span className="emoji">🎯</span>
            <div>
              <strong>وظائف مستهدفة</strong>
              <div className="muted">أضف كل وظيفة تقدم عليها وتابع جاهزيتك لها على حدة.</div>
            </div>
          </div>
          <div className="auth-feature">
            <span className="emoji">📈</span>
            <div>
              <strong>تطور الدرجات</strong>
              <div className="muted">رسوم بيانية لمقارنة المحاولات والأربع محاور: HR، سلوكي، تقني، وثقة.</div>
            </div>
          </div>
          <div className="auth-feature">
            <span className="emoji">🔐</span>
            <div>
              <strong>حساب آمن</strong>
              <div className="muted">بريد إلكتروني أو Google، مع تشفير كلمة المرور وتوكن جلسة موقّع.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            حساب جديد
          </button>
        </div>

        {error ? <div className="alert alert--error">{error}</div> : null}

        <form onSubmit={submit}>
          {mode === "register" ? (
            <>
              <div className="field">
                <label htmlFor="name">الاسم الكامل</label>
                <input
                  id="name"
                  value={form.name}
                  onChange={update("name")}
                  placeholder="مثال: حازم أحمد"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="headline">نبذة قصيرة (اختياري)</label>
                <input
                  id="headline"
                  value={form.headline}
                  onChange={update("headline")}
                  placeholder="مثال: خريج هندسة حاسبات — باك إند"
                />
              </div>
              <div className="grid grid-2" style={{ gap: 10 }}>
                <div className="field">
                  <label htmlFor="targetField">المجال المستهدف</label>
                  <input
                    id="targetField"
                    value={form.targetField}
                    onChange={update("targetField")}
                    placeholder="تطوير البرمجيات"
                  />
                </div>
                <div className="field">
                  <label htmlFor="experienceLevel">مستوى الخبرة</label>
                  <select
                    id="experienceLevel"
                    value={form.experienceLevel}
                    onChange={update("experienceLevel")}
                  >
                    <option>Fresh Graduate</option>
                    <option>Junior</option>
                    <option>Mid-Level</option>
                    <option>Senior</option>
                  </select>
                </div>
              </div>
            </>
          ) : null}

          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={update("email")}
              placeholder="you@example.com"
              autoComplete="email"
              dir="ltr"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={update("password")}
              placeholder={mode === "register" ? "6 أحرف على الأقل" : "••••••"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              dir="ltr"
              required
              minLength={6}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <span className="spinner" /> : null}
            {mode === "login" ? "دخول إلى حسابي" : "إنشاء الحساب والبدء"}
          </button>
        </form>

        <div className="divider">أو</div>

        {googleClientId ? (
          <div ref={googleBtnRef} style={{ display: "flex", justifyContent: "center" }} />
        ) : (
          <button
            type="button"
            className="google-btn"
            onClick={quickGoogle}
            disabled={googleBusy}
          >
            {googleBusy ? <span className="spinner" style={{ borderTopColor: "#1f2430", borderColor: "rgba(0,0,0,.15)" }} /> : <GoogleGlyph />}
            المتابعة بحساب Google
          </button>
        )}

        <div className="demo-box">
          <strong>حساب تجريبي جاهز:</strong>{" "}
          <code>{DEMO_EMAIL}</code> / <code>{DEMO_PASSWORD}</code>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={fillDemo}>
              تعبئة بيانات الحساب التجريبي
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
