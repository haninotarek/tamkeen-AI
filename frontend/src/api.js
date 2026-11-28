/**
 * ملف الاتصال الموحد بالـ Backend (frontend/src/api.js)
 * عضو 1 — النواة المشتركة للمشروع
 *
 * - يستخدم مسارات نسبية (/api/...) ليتوافق مع Vite Proxy ومع أي بيئة استضافة
 * - يحقن تلقائياً توكن الدخول (Bearer) في كل الطلبات المسجلة
 * - عند انتهاء الجلسة (401) يمسح التوكن ويطلق حدثاً موحداً لكل الواجهات
 */

export const TOKEN_KEY = "tamkeen_token";
export const USER_KEY = "tamkeen_user";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function saveSession(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* التخزين غير متاح (وضع تصفح خاص) */
  }
  if (token || user) {
    window.dispatchEvent(new CustomEvent("tamkeen:auth-changed"));
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* تجاهل */
  }
  window.dispatchEvent(new CustomEvent("tamkeen:auth-changed"));
}

export function readCachedUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch (networkErr) {
    throw new Error("تعذّر الوصول إلى الخادم — تأكد من تشغيل الواجهة الخلفية (Backend).");
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && !path.includes("/api/auth/login") && !path.includes("/api/auth/register")) {
    clearSession();
    window.dispatchEvent(new CustomEvent("tamkeen:unauthorized"));
  }

  if (!res.ok) {
    const detail = data.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail) && detail[0]?.msg
        ? detail[0].msg
        : data.error || `حدث خطأ في الاتصال بالخادم (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/* ===================== عضو 1: الحسابات والداشبورد ===================== */
export const authApi = {
  register: (payload) =>
    request("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (email, password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  googleLogin: (payload) =>
    request("/api/auth/google", { method: "POST", body: JSON.stringify(payload || {}) }),
  me: () => request("/api/auth/me"),
  updateProfile: (payload) =>
    request("/api/auth/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  dashboard: () => request("/api/auth/dashboard"),
  progress: (jobId) =>
    request(`/api/auth/progress${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`),
  createJob: (payload) =>
    request("/api/auth/jobs", { method: "POST", body: JSON.stringify(payload) }),
  updateJob: (jobId, payload) =>
    request(`/api/auth/jobs/${jobId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteJob: (jobId) => request(`/api/auth/jobs/${jobId}`, { method: "DELETE" }),
  recordAttempt: (payload) =>
    request("/api/auth/attempts", { method: "POST", body: JSON.stringify(payload) }),
  health: () => request("/api/health"),
};

/* ===================== عضو 6: التقييم والمذاكرة ===================== */
export const reportApi = {
  listReports: () => request("/api/report"),
  getReport: (id) => request(`/api/report/${id}`),
  deleteReport: (id) => request(`/api/report/${id}`, { method: "DELETE" }),
  generateReport: (payload) =>
    request("/api/report/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  evaluateAnswer: (payload) =>
    request("/api/report/evaluate-answer", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateStudyProgress: (reportId, payload) =>
    request(`/api/report/${reportId}/study-progress`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  evaluatePracticeQuestion: (reportId, payload) =>
    request(`/api/report/${reportId}/practice-eval`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createWeaknessRetake: (reportId, selectedWeaknessIds) =>
    request(`/api/report/${reportId}/retake`, {
      method: "POST",
      body: JSON.stringify(
        selectedWeaknessIds?.length ? { selectedWeaknessIds } : {}
      ),
    }),
  getRetakeSession: (sessionId) =>
    request(`/api/report/retake-session/${sessionId}`),
  getLLMStatus: () => request("/api/report/llm/status"),
  saveLLMConfig: (payload) =>
    request("/api/report/llm/config", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export default request;
