import axios, { AxiosError } from "axios";

const api = axios.create({
  baseURL: "/api/proxy",
  headers: {
    "Content-Type": "application/json",
  }
});

let isRedirecting = false;

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (typeof window !== "undefined" && error.response?.status === 401) {
      if (error.response.headers["x-session-expired"]) {
        if (!isRedirecting && window.location.pathname !== "/portal") {
          isRedirecting = true;
          window.location.href = "/portal?reason=expired";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;