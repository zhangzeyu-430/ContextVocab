function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const fromEnv = import.meta.env.VITE_API_BASE_URL;
  if (fromEnv && fromEnv.trim()) {
    return normalizeBaseUrl(fromEnv);
  }
  return "";
}

export function buildApiUrl(path: string) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${safePath}` : safePath;
}

