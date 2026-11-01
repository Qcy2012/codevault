const TOKEN_KEY = "codevault_token";
const USER_KEY = "codevault_user";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth) {
    clearAuth();
  }
  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || `请求失败 (${res.status})`);
  }
  return data;
}

const authApi = {
  register: (body) => request("/api/auth/register", { method: "POST", body, auth: false }),
  login: (body) => request("/api/auth/login", { method: "POST", body, auth: false }),
  me: () => request("/api/auth/me"),
};

const snippetApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        qs.set(key, value);
      }
    });
    return request(`/api/snippets?${qs.toString()}`);
  },
  get: (id) => request(`/api/snippets/${id}`),
  create: (body) => request("/api/snippets", { method: "POST", body }),
  update: (id, body) => request(`/api/snippets/${id}`, { method: "PUT", body }),
  remove: (id) => request(`/api/snippets/${id}`, { method: "DELETE" }),
  favorite: (id) => request(`/api/snippets/${id}/favorite`, { method: "POST" }),
  unfavorite: (id) => request(`/api/snippets/${id}/favorite`, { method: "DELETE" }),
};

const tagApi = {
  list: (q) =>
    request(`/api/tags${q ? `?q=${encodeURIComponent(q)}` : ""}`, { auth: false }),
};