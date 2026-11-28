import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

/**
 * عضو 1 — الهيكل العام للمنصة (App Shell) بالعربية RTL
 * شريط تنقل جانبي لكل موديولات المنصة + شارة المستخدم + تسجيل الخروج
 */

const NAV_ITEMS = [
  { to: "/dashboard", label: "لوحة التحكم", icon: "▦", tag: "عضو 1" },
  { to: "/progress", label: "تطور الأداء", icon: "📈", tag: "عضو 1" },
  { to: "/", label: "التقارير والمذاكرة", icon: "📝", tag: "عضو 6" },
  { to: "/jobs", label: "الوظائف والشركات", icon: "🏢", tag: "عضو 2" },
  { to: "/research", label: "بحث الشركة", icon: "🔎", tag: "عضو 2" },
  { to: "/interview", label: "غرفة المقابلة", icon: "🎤", tag: "عضو 3" },
  { to: "/room", label: "الأفاتار والغرفة", icon: "🧑‍💻", tag: "عضو 4" },
  { to: "/behavior", label: "تحليل السلوك", icon: "🧠", tag: "عضو 5" },
  { to: "/cv", label: "استوديو السيرة", icon: "📄", tag: "عضو 7" },
  { to: "/profile", label: "ملفي الشخصي", icon: "⚙️", tag: "عضو 1" },
];

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (to) =>
    to === "/" ? location.pathname === "/" || location.pathname.startsWith("/report") || location.pathname.startsWith("/study") : location.pathname.startsWith(to);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="brand-block">
          <span className="brand-mark">جاهز</span>
          <div>
            <strong>منصة جاهز</strong>
            <small>AI Interview &amp; CV Platform</small>
          </div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={`nav-item ${isActive(item.to) ? "active" : ""}`}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-label">{item.label}</span>
              <span className="nav-tag">{item.tag}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <a className="nav-item nav-item--docs" href="/docs" target="_blank" rel="noreferrer">
            <span className="nav-icon">🔗</span>
            <span className="nav-label">توثيق الـ API</span>
          </a>
          <small className="version-note">الإصدار 1.0 · فريق تمكين AI</small>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="القائمة"
          >
            ☰
          </button>

          <div className="topbar-title">
            <strong>منصة جاهز — تدريب مقابلات العمل بالذكاء الاصطناعي</strong>
            <small>استعد، تدرّب، قيّم، وأتمكن قبل المقابلة الحقيقية</small>
          </div>

          {user ? (
            <div className="user-chip">
              <div className="avatar" title={user.email}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} referrerPolicy="no-referrer" />
                ) : (
                  initials(user.name)
                )}
              </div>
              <div className="user-meta">
                <strong>{user.name}</strong>
                <small>{user.authProvider === "google" ? "دخول عبر Google" : user.email}</small>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>
                خروج
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              تسجيل الدخول
            </Link>
          )}
        </header>

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
