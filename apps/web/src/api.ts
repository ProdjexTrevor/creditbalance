import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3010";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cb_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
