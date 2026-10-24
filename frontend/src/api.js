import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("hcm.accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshRequest;
api.interceptors.response.use((response) => response, async (error) => {
  const original = error.config;
  if (error.response?.status !== 401 || original?._retried || original?.url?.includes("/auth/")) throw error;
  const refreshToken = localStorage.getItem("hcm.refreshToken");
  if (!refreshToken) throw error;
  original._retried = true;
  refreshRequest ||= axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken })
    .then(({ data }) => {
      localStorage.setItem("hcm.accessToken", data.accessToken);
      localStorage.setItem("hcm.refreshToken", data.refreshToken);
      return data.accessToken;
    })
    .finally(() => { refreshRequest = undefined; });
  const token = await refreshRequest;
  original.headers.Authorization = `Bearer ${token}`;
  return api(original);
});

export function messageFromError(error) {
  return error.response?.data?.message || error.message || "Something went wrong.";
}

export default api;
