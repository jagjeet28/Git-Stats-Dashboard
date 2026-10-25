// Axios instance + interceptors + retry/backoff + TTL cache (REST + third-party API topics)
import axios from "axios";

export const session = { token: "", onRate: null };
export const api = axios.create({
  baseURL: "https://api.github.com",
  headers: { Accept: "application/vnd.github+json" },
});

// request interceptor: attach token if user typed one
api.interceptors.request.use((cfg) => {
  if (session.token) cfg.headers.Authorization = `Bearer ${session.token}`;
  return cfg;
});

// response interceptor: read rate-limit headers, normalise errors in one place
api.interceptors.response.use(
  (res) => { session.onRate?.(res.headers); return res; },
  (err) => {
    if (err.response) session.onRate?.(err.response.headers);
    return Promise.reject(normalize(err));
  }
);

function normalize(e) {
  const s = e.response?.status;
  if (s === 404) return { kind: "not_found", message: "That username doesn't exist on GitHub." };
  if (s === 403 && e.response.headers["x-ratelimit-remaining"] === "0") {
    const mins = Math.max(1, Math.ceil((Number(e.response.headers["x-ratelimit-reset"]) * 1000 - Date.now()) / 60000));
    return { kind: "rate_limited", message: `Rate limit hit. Resets in ~${mins} min. Add a token to raise it.` };
  }
  if (s === 401) return { kind: "auth", message: "Token rejected by GitHub." };
  return { kind: "network", message: "Couldn't reach GitHub. Check your connection and retry." };
}

// retry with exponential backoff (skips errors that retrying can't fix)
async function retry(fn, n = 2, ms = 600) {
  try { return await fn(); }
  catch (err) {
    if (n <= 0 || ["not_found", "rate_limited", "auth"].includes(err.kind)) throw err;
    await new Promise((r) => setTimeout(r, ms));
    return retry(fn, n - 1, ms * 2);
  }
}

const cache = new Map();
const TTL = 5 * 60 * 1000;
async function cached(key, fn) {
  const h = cache.get(key);
  if (h && Date.now() - h.t < TTL) return { data: h.v, hit: true };
  const v = await retry(fn);
  cache.set(key, { v, t: Date.now() });
  return { data: v, hit: false };
}

export const getUser = (u) => cached(`u:${u}`, () => api.get(`/users/${u}`).then((r) => r.data));
export const getRepos = (u) => cached(`r:${u}`, () => api.get(`/users/${u}/repos`, { params: { per_page: 100, sort: "updated" } }).then((r) => r.data));
export const getEvents = (u) => cached(`e:${u}`, () => api.get(`/users/${u}/events/public`, { params: { per_page: 100 } }).then((r) => r.data));
export const searchUsers = (q) => api.get("/search/users", { params: { q, per_page: 5 } }).then((r) => r.data.items);

// parallel requests (Promise.all) for the top 8 repos' language bytes
export async function getLangs(u, repos) {
  return (await cached(`l:${u}`, async () => {
    const top = repos.filter((r) => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 8);
    const res = await Promise.all(top.map((r) => api.get(`/repos/${r.owner.login}/${r.name}/languages`).then((x) => x.data).catch(() => ({}))));
    const t = {};
    res.forEach((o) => Object.entries(o).forEach(([k, v]) => (t[k] = (t[k] || 0) + v)));
    return t;
  })).data;
}
