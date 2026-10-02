import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// 1. Create configured Axios instance
const api = axios.create({
  baseURL: "/api/proxy",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Forwards HttpOnly cookies (refresh_token) through the proxy
});

// 2. Request Interceptor: Injects the active access token from sessionStorage.
// login-form.tsx L58 writes to sessionStorage ("access_token"), not localStorage.
// sessionStorage is intentionally scoped to the tab and cleared on close.
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = sessionStorage.getItem("access_token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 3. Response Interceptor: Catches 401s, clears state, and redirects to /portal.
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (typeof window !== "undefined" && error.response?.status === 401) {
      sessionStorage.removeItem("access_token");
      sessionStorage.removeItem("user_role");

      // Prevent redirect loops if the user is already on the auth portal
      if (window.location.pathname !== "/portal") {
        window.location.href = "/portal";
      }
    }
    return Promise.reject(error);
  }
);

export default api;