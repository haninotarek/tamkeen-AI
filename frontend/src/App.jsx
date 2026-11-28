import React, { Suspense, lazy } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import LoginPage from "./features/auth/LoginPage";
import Login from "./features/auth/LoginPage";
import DashboardPage from "./features/auth/DashboardPage";
import Dashboard from "./features/auth/DashboardPage";
import ProgressPage from "./features/auth/ProgressPage";
import Progress from "./features/auth/ProgressPage";
import ProfilePage from "./features/auth/ProfilePage";

/**
 * النواة المشتركة للفرونت إند (عضو 1)
 *
 * صُمم هذا الملف ليعمل بسلاسة حتى لو كانت ملفات بقية الأعضاء لا تزال فارغة (0 bytes)
 * أو لم تُنشأ بعد، بدون أي أخطاء في بناء Vite:
 * - كل صفحة تابعة لعضو آخر تُحمَّل ديناميكياً عبر React.lazy + فحص حجم الموديول.
 * - أي صفحة فارغة/غير متاحة تظهر برسالة "قيد الإنشاء" بدلاً من إسقاط التطبيق.
 * - ErrorBoundary يمنع انهيار الشاشة لو ألقى مكوّن خارجي خطأ.
 */

function Placeholder({ title, owner, note }) {
  return (
    <div className="card" style={{ maxWidth: 640, margin: "40px auto", textAlign: "center" }}>
      <div style={{ fontSize: 34, marginBottom: 8 }}>🚧</div>
      <h2 style={{ marginBottom: 6 }}>{title}</h2>
      <p className="muted" style={{ marginBottom: 4 }}>
        هذه الشاشة من مسؤولية <strong>{owner}</strong> ولم تُرفع بعد على الفرع الرئيسي.
      </p>
      <p className="muted" style={{ fontSize: 12.5 }}>
        {note || "الواجهة الخلفية والأساسيات جاهزة، وبمجرد رفع ملف العضو ستظهر الصفحة تلقائياً بدون أي تعديل."}
      </p>
      <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <Link to="/dashboard" className="btn btn-primary btn-sm">
          الداشبورد
        </Link>
        <Link to="/progress" className="btn btn-ghost btn-sm">
          تطور الأداء
        </Link>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "خطأ غير متوقع" };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.warn("[tamkeen] module crashed:", error?.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Placeholder
          title="هذه الشاشة واجهت مشكلة في العرض"
          owner={this.props.owner || "أحد الموديولات"}
          note={this.state.message}
        />
      );
    }
    return this.props.children;
  }
}

/**
 * إنشاء صفحة كسولة مع فحص حجم الموديول:
 * إذا كان الملف فارغاً (0 bytes) يظهر Placeholder بدلاً من كسر البناء.
 */
// صفحات عضو 1 تُستورد ثابتاً، لذا نستثنيها من الخريطة الديناميكية
const PAGE_MODULES = Object.fromEntries(
  Object.entries(import.meta.glob("./features/*/*.jsx")).filter(
    ([k]) => !k.includes("/features/auth/")
  )
);

/**
 * حل مسار أي صفحة من صفحات الفريق ديناميكياً.
 * إن لم يكن الملف موجوداً بعد على الفرع الرئيسي (لم يرفعه العضو المسؤول)
 * نعيد موديول فارغاً بدل كسر البناء بالكامل.
 */
function resolveModule(path) {
  const key = path.startsWith("./") ? path : `./${path}`;
  return PAGE_MODULES[key] || (async () => ({}));
}

function makePage({ path, owner, title, note, exportName }) {
  const LazyComp = lazy(async () => {
    const mod = await resolveModule(path)();
    const safe = Object(mod);
    const comp = safe["default"] || (exportName ? safe[exportName] : null);
    if (typeof comp !== "function") {
      const Empty = () => <Placeholder title={title} owner={owner} note={note} />;
      return { default: Empty };
    }
    return { default: comp };
  });

  return function Page() {
    return (
      <ErrorBoundary owner={owner}>
        <Suspense
          fallback={
            <div className="grid grid-2">
              <div className="skeleton" style={{ height: 220 }} />
              <div className="skeleton" style={{ height: 220 }} />
            </div>
          }
        >
          <LazyComp />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

function ReportRoute() {
  const { id } = useParams();
  const Page = React.useMemo(
    () =>
      makePage({
        path: "./features/report/ReportPage",
        owner: "عضو 6 — التقييم والمذاكرة",
        title: "صفحة التقرير",
      }),
    []
  );
  return <Page reportId={id} />;
}

function StudyRoute() {
  const { id } = useParams();
  const Page = React.useMemo(
    () =>
      makePage({
        path: "./features/report/StudyPage",
        owner: "عضو 6 — التقييم والمذاكرة",
        title: "صفحة المذاكرة",
      }),
    []
  );
  return <Page reportId={id} />;
}

const ReportHubPage = makePage({
  path: "./features/report/ReportHub",
  owner: "عضو 6 — التقييم والمذاكرة",
  title: "التقارير والمذاكرة",
});

const JobFormPage = makePage({
  path: "./features/job/JobFormPage",
  owner: "عضو 2 — الوظائف وبحث الشركات",
  title: "إضافة وظيفة مستهدفة",
});

const LandingPage = makePage({
  path: "./features/job/LandingPage",
  owner: "عضو 2 — الوظائف وبحث الشركات",
  title: "الصفحة التعريفية",
});

const CompanyBriefPage = makePage({
  path: "./features/job/CompanyBriefPage",
  owner: "عضو 2 — الوظائف وبحث الشركات",
  title: "ملف الشركة",
});

const InterviewReviewPage = makePage({
  path: "./features/interview/InterviewReviewPage",
  owner: "عضو 3 — محرك المقابلة",
  title: "غرفة المقابلة الذكية",
});

const DeviceCheckPage = makePage({
  path: "./features/room/DeviceCheckPage",
  owner: "عضو 4 — الأفاتار والغرفة",
  title: "فحص الأجهزة",
});

const InterviewRoomPage = makePage({
  path: "./features/room/InterviewRoomPage",
  owner: "عضو 4 — الأفاتار والغرفة",
  title: "غرفة المقابلة الافتراضية",
});

const BehaviorChartsPage = makePage({
  path: "./features/behavior/BehaviorCharts",
  owner: "عضو 5 — تحليل السلوك",
  title: "تحليل السلوك",
  exportName: "BehaviorCharts",
});

const CvBuilderPage = makePage({
  path: "./features/cv/CvBuilderPage",
  owner: "عضو 7 — استوديو السيرة الذاتية",
  title: "منشئ السيرة الذاتية",
});

const CvAnalysisPage = makePage({
  path: "./features/cv/CvAnalysisPage",
  owner: "عضو 7 — استوديو السيرة الذاتية",
  title: "تحليل السيرة الذاتية (ATS)",
});

function RequireAuth({ children }) {
  const { isAuthenticated, initializing } = useAuth();
  if (initializing) {
    return (
      <div className="grid grid-2">
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            {/* عضو 1 — الحسابات */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<LoginPage />} />

            {/* عضو 1 — الداشبورد والتقدم */}
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route path="/progress" element={<ProgressPage />} />
            <Route path="/profile" element={<ProfilePage />} />

            {/* عضو 6 — التقارير والمذاكرة (تعمل بدون تسجيل أيضاً) */}
            <Route path="/" element={<ReportHubPage />} />
            <Route path="/report" element={<ReportRoute />} />
            <Route path="/report/:id" element={<ReportRoute />} />
            <Route path="/study" element={<StudyRoute />} />
            <Route path="/study/:id" element={<StudyRoute />} />

            {/* بقية الأعضاء */}
            <Route path="/jobs" element={<JobFormPage />} />
            <Route path="/jobs/new" element={<JobFormPage />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/research" element={<CompanyBriefPage />} />
            <Route path="/company" element={<CompanyBriefPage />} />
            <Route path="/interview" element={<InterviewReviewPage />} />
            <Route path="/room" element={<DeviceCheckPage />} />
            <Route path="/room/interview" element={<InterviewRoomPage />} />
            <Route path="/behavior" element={<BehaviorChartsPage />} />
            <Route path="/cv" element={<CvBuilderPage />} />
            <Route path="/cv/builder" element={<CvBuilderPage />} />
            <Route path="/cv/analysis" element={<CvAnalysisPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}
