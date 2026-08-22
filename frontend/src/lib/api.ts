import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// 1. Create configured Axios instance
const api = axios.create({
  baseURL: "/api/proxy",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Forwards HttpOnly cookies (refresh_token) through the proxy
});

// 2. Request Interceptor: Injects the active access token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 3. Response Interceptor: Catches 401s, clears state, and redirects
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (typeof window !== "undefined" && error.response?.status === 401) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("user");

      // Prevent redirect loops if the user is already on auth pages
      if (!["/login", "/register"].includes(window.location.pathname)) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;