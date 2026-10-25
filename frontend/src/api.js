import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api" });
const clearSession = () => {
  ["hcm.accessToken", "hcm.refreshToken", "hcm.user"].forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new Event("hcm:session-expired"));
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("hcm.accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest;
api.interceptors.response.use((response) => response, async (error) => {
  const original = error.config;
  const isLoginOrRefresh = /\/auth\/(login|refresh)(?:\?|$)/.test(original?.url || "");
  if (error.response?.status !== 401 || !original || original._retried || isLoginOrRefresh) throw error;
  const refreshToken = localStorage.getItem("hcm.refreshToken");
  if (!refreshToken) {
    clearSession();
    throw error;
  }
  original._retried = true;
  refreshRequest ||= axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
    .then(({ data }) => {
      localStorage.setItem("hcm.accessToken", data.accessToken);
      localStorage.setItem("hcm.refreshToken", data.refreshToken);
      return data.accessToken;
    })
    .catch((refreshError) => {
      clearSession();
      throw refreshError;
    })
    .finally(() => { refreshRequest = undefined; });
  let token;
  try {
    token = await refreshRequest;
  } catch {
    throw error;
  }
  original.headers.Authorization = `Bearer ${token}`;
  return api(original);
});

export function messageFromError(error) {
  return error.response?.data?.message || error.message || "Something went wrong.";
}

export default api;
