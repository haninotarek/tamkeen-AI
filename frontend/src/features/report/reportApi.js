const RAW_BASE =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_URL) ||
  "";
const BASE_PREFIX = RAW_BASE.replace(/\/$/, "");
const API_BASE = `${BASE_PREFIX}/api/report`;

async function request(path = "", options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.error || `خطأ في الخادم (${res.status})`);
  }
  return data;
}

export const reportApi = {
  listReports: () => request(""),
  getReport: (id) => request(`/${id}`),
  deleteReport: (id) => request(`/${id}`, { method: "DELETE" }),
  generateReport: (payload) =>
    request("/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  evaluateSingleAnswer: (payload) =>
    request("/evaluate-answer", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateStudyProgress: (reportId, payload) =>
    request(`/${reportId}/study`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  evaluatePracticeQuestion: (reportId, payload) =>
    request(`/${reportId}/practice-eval`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createWeaknessRetake: (reportId, weaknessIds = null) =>
    request(`/${reportId}/retake`, {
      method: "POST",
      body: JSON.stringify(weaknessIds ? { weaknessIds } : {}),
    }),
  getRetakeSession: (sessionId) => request(`/retake/${sessionId}`),
  getLLMStatus: () => request("/llm/status"),
  saveLLMConfig: (payload) =>
    request("/llm/config", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export default reportApi;
