import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink, Navigate, Outlet, useNavigate, useParams, useOutletContext, useLocation } from "react-router-dom";
import html2canvas from "html2canvas";
import { ToastProvider, AuthProvider, useToast, useAuth } from "./context";
import { useStore } from "./store";
import { useDebounce, useProfile } from "./hooks";
import { searchUsers, session } from "./api";
import { Input, Modal, Dropdown, ProfileCard, LangChart, ActivityChart, Heatmap, fmt, langColor } from "./components";

/* ---------- layout (multi-page SPA shell) ---------- */
function Layout() {
  const rate = useStore((s) => s.rate);
  const { user, logout } = useAuth();
  const cls = rate ? (rate.remaining / rate.limit <= 0.15 ? "crit" : rate.remaining / rate.limit <= 0.4 ? "warn" : "") : "";
  return (
    <div className="app">
      <header className="terminal-bar">
        <div className="dots"><span className="dot red" /><span className="dot yellow" /><span className="dot grn" /></div>
        <div className="terminal-title">git-stats — developer analytics dashboard</div>
        <div className={`rate-badge ${cls}`}>{rate ? `rate ${rate.remaining}/${rate.limit}` : "rate --/--"}</div>
      </header>
      <nav className="nav">
        <NavLink to="/" end>home</NavLink>
        <NavLink to="/compare">compare</NavLink>
        <NavLink to="/bookmarks">bookmarks</NavLink>
        <span className="sp" />
        {user ? <a href="#logout" onClick={(e) => { e.preventDefault(); logout(); }}>logout ({user})</a> : <NavLink to="/login">login</NavLink>}
      </nav>
      <Outlet />
      <footer className="foot"><span>data via api.github.com</span></footer>
    </div>
  );
}

/* ---------- home: validated search + debounced autocomplete ---------- */
const USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
function Home() {
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [sugg, setSugg] = useState([]);
  const ref = useRef(null);
  const nav = useNavigate();
  const debounced = useDebounce(q, 400);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    if (debounced.length < 3 || !USER_RE.test(debounced)) return setSugg([]);
    searchUsers(debounced).then((r) => setSugg(r.map((u) => u.login))).catch(() => setSugg([]));
  }, [debounced]);
  const submit = (e) => {
    e.preventDefault();
    if (!USER_RE.test(q.trim())) return setErr("Enter a valid GitHub username (letters, numbers, single hyphens).");
    nav(`/user/${q.trim()}`);
  };
  return (
    <section className="hero">
      <p className="eyebrow">// pass a username, get the whole graph</p>
      <h1>git-stats<span className="cursor">_</span></h1>
      <p className="sub">Repos, languages, activity and contribution history for any public GitHub account.</p>
      <form className="cmd-line suggest" onSubmit={submit} autoComplete="off">
        <span className="prompt">$</span>
        <input id="username-input" ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setErr(""); }} placeholder="enter your github username" spellCheck="false" />
        <button id="run-btn" type="submit">run</button>
        {sugg.length > 0 && <ul>{sugg.map((s) => <li key={s} onClick={() => nav(`/user/${s}`)}>{s}</li>)}</ul>}
      </form>
      {err && <p className="ferr" style={{ marginTop: 8 }}>{err}</p>}
      <div className="options-row">
        <details className="token-details">
          <summary>optional access token</summary>
          <div className="token-body">
            <input id="token-input" type="password" placeholder="ghp_… (raises rate limit)" onChange={(e) => (session.token = e.target.value.trim())} />
            <p className="hint">Kept only in memory. Sent only to api.github.com.</p>
          </div>
        </details>
      </div>
    </section>
  );
}

/* ---------- user page: dynamic route + nested tabs; state lifted via Outlet context ---------- */
function Status({ p }) {
  if (p.loading) return <div className="status-line"><span className="spin">◐</span> fetching data…</div>;
  if (p.error) return (
    <div className="status-line err">✕ {p.error.message} <button className="btn ghost" onClick={p.reload}>retry</button></div>
  );
  return null;
}

function UserLayout() {
  const { username } = useParams();
  const p = useProfile(username);
  const toast = useToast();
  const add = useStore((s) => s.addBookmark);
  const reportRef = useRef(null);
  useEffect(() => { if (p.error) toast(p.error.message, "error"); }, [p.error]);
  const exportPng = async () => {
    const c = await html2canvas(reportRef.current, { backgroundColor: "#0a0e14", scale: 2 });
    const a = document.createElement("a"); a.download = `${username}-report.png`; a.href = c.toDataURL(); a.click();
  };
  if (p.loading || p.error) return <Status p={p} />;
  return (
    <div className="results" ref={reportRef}>
      <div className="profiles-grid single"><ProfileCard user={p.user} /></div>
      <div className="page-pad" style={{ paddingTop: 0, display: "flex", gap: 8 }}>
        <button className="btn" onClick={() => { add({ login: p.user.login, avatar: p.user.avatar_url }); toast(`Bookmarked ${p.user.login}`); }}>★ bookmark</button>
        <button className="btn ghost" onClick={exportPng}>export PNG</button>
        {p.cached && <span className="cache-indicator" style={{ alignSelf: "center" }}>⟳ served from cache</span>}
      </div>
      <div className="tabs">
        <NavLink to="" end>overview</NavLink>
        <NavLink to="repos">repositories</NavLink>
      </div>
      <Outlet context={p} />
    </div>
  );
}

function Overview() {
  const p = useOutletContext();
  return (
    <>
      <div className="charts-grid">
        <div className="panel"><div className="panel-header"><h2><span className="idx">02</span> language distribution</h2></div><LangChart totals={p.langs} /></div>
        <div className="panel"><div className="panel-header"><h2><span className="idx">03</span> activity, last 14 days</h2></div><ActivityChart events={p.events} /></div>
      </div>
      <div className="panel"><Heatmap events={p.events} /></div>
    </>
  );
}

/* ---------- repos: search + filter + sort + pagination + modal ---------- */
const PAGE = 8;
function Repos() {
  const { repos } = useOutletContext();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("stars");
  const [lang, setLang] = useState("all");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(null);
  const q = useDebounce(search, 300);
  const langs = useMemo(() => [...new Set(repos.map((r) => r.language).filter(Boolean))].sort(), [repos]);
  const list = useMemo(() => {
    const f = repos.filter((r) => (lang === "all" || r.language === lang) && r.name.toLowerCase().includes(q.toLowerCase()));
    const s = { stars: (a, b) => b.stargazers_count - a.stargazers_count, forks: (a, b) => b.forks_count - a.forks_count, updated: (a, b) => new Date(b.updated_at) - new Date(a.updated_at), name: (a, b) => a.name.localeCompare(b.name) }[sort];
    return f.sort(s);
  }, [repos, q, sort, lang]);
  useEffect(() => setPage(1), [q, sort, lang]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  return (
    <div className="panel">
      <div className="panel-header">
        <h2><span className="idx">01</span> repositories ({list.length})</h2>
        <div className="controls">
          <input className="second-input" placeholder="search repos…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Dropdown value={sort} onChange={setSort} options={[["stars", "sort: stars"], ["forks", "sort: forks"], ["updated", "sort: updated"], ["name", "sort: name"]]} />
          <Dropdown value={lang} onChange={setLang} options={[["all", "language: all"], ...langs.map((l) => [l, `language: ${l}`])]} />
        </div>
      </div>
      <div className="repo-list">
        {list.length === 0 && <p className="empty-note">No repositories match.</p>}
        {list.slice((page - 1) * PAGE, page * PAGE).map((r) => (
          <div key={r.id} className="repo-row" onClick={() => setSel(r)}>
            <div><span className="rname">{r.name}</span>{r.description && <span className="rdesc">{r.description}</span>}</div>
            <div className="rlang">{r.language ? <><span className="lang-dot" style={{ background: langColor(r.language) }} />{r.language}</> : "—"}</div>
            <div className="rstat">★ <b>{fmt(r.stargazers_count)}</b></div>
            <div className="rstat">⑂ <b>{fmt(r.forks_count)}</b></div>
          </div>
        ))}
      </div>
      <div className="pager">
        <button className="btn ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>prev</button>
        <span>{page} / {pages}</span>
        <button className="btn ghost" disabled={page === pages} onClick={() => setPage(page + 1)}>next</button>
      </div>
      <Modal open={!!sel} onClose={() => setSel(null)}>
        {sel && (<>
          <h3>{sel.full_name}</h3>
          <p className="bio">{sel.description || "No description."}</p>
          <p className="rstat">★ {sel.stargazers_count} · ⑂ {sel.forks_count} · issues {sel.open_issues_count} · updated {new Date(sel.updated_at).toLocaleDateString()}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <a className="btn" href={sel.html_url} target="_blank" rel="noreferrer">open on GitHub</a>
            <button className="btn ghost" onClick={() => setSel(null)}>close</button>
          </div>
        </>)}
      </Modal>
    </div>
  );
}

/* ---------- compare: two dynamic params ---------- */
function CompareForm() {
  const [a, setA] = useState(""); const [b, setB] = useState(""); const [err, setErr] = useState("");
  const nav = useNavigate();
  const go = (e) => { e.preventDefault(); if (!USER_RE.test(a) || !USER_RE.test(b)) return setErr("Both usernames must be valid."); nav(`/compare/${a}/${b}`); };
  return (
    <form className="form-box" onSubmit={go}>
      <Input label="first username" value={a} onChange={(e) => { setA(e.target.value); setErr(""); }} />
      <Input label="second username" value={b} onChange={(e) => { setB(e.target.value); setErr(""); }} error={err} />
      <button className="btn">compare</button>
    </form>
  );
}
function Compare() {
  const { a, b } = useParams();
  const pa = useProfile(a); const pb = useProfile(b);
  if (pa.loading || pb.loading) return <div className="status-line"><span className="spin">◐</span> fetching both profiles…</div>;
  const err = pa.error || pb.error;
  if (err) return <div className="status-line err">✕ {err.message}</div>;
  const sum = (r, k) => r.reduce((s, x) => s + x[k], 0);
  const rows = [["followers", pa.user.followers, pb.user.followers], ["public repos", pa.user.public_repos, pb.user.public_repos], ["total stars", sum(pa.repos, "stargazers_count"), sum(pb.repos, "stargazers_count")], ["total forks", sum(pa.repos, "forks_count"), sum(pb.repos, "forks_count")]];
  return (
    <div className="results">
      <div className="profiles-grid"><ProfileCard user={pa.user} /><ProfileCard user={pb.user} /></div>
      <div className="panel"><div className="panel-header"><h2><span className="idx">05</span> head to head</h2></div>
        <div className="compare-table">{rows.map(([l, x, y]) => (
          <div className="crow" key={l}><div className={`val left ${x > y ? "win" : ""}`}>{fmt(x)}</div><div className="label">{l}</div><div className={`val right ${y > x ? "win" : ""}`}>{fmt(y)}</div></div>
        ))}</div>
      </div>
    </div>
  );
}

/* ---------- auth: validated login form + protected route ---------- */
function Login() {
  const { login } = useAuth(); const nav = useNavigate(); const loc = useLocation(); const toast = useToast();
  const [f, setF] = useState({ name: "", pass: "" }); const [errs, setErrs] = useState({});
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (f.name.trim().length < 3) er.name = "Name must be at least 3 characters.";
    if (f.pass.length < 6) er.pass = "Password must be at least 6 characters.";
    setErrs(er);
    if (Object.keys(er).length) return;
    login(f.name.trim()); toast(`Welcome, ${f.name.trim()}`);
    nav(loc.state?.from || "/bookmarks", { replace: true });
  };
  return (
    <form className="form-box" onSubmit={submit} noValidate>
      <Input label="name" value={f.name} error={errs.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <Input label="password" type="password" value={f.pass} error={errs.pass} onChange={(e) => setF({ ...f, pass: e.target.value })} />
      <button className="btn">login</button>
    </form>
  );
}
function RequireAuth({ children }) {
  const { user } = useAuth(); const loc = useLocation();
  return user ? children : <Navigate to="/login" state={{ from: loc.pathname }} replace />;
}

/* ---------- bookmarks: full CRUD on the Zustand store ---------- */
function Bookmarks() {
  const { bookmarks, updateNote, removeBookmark } = useStore();
  const toast = useToast();
  return (
    <div className="panel">
      <div className="panel-header"><h2><span className="idx">06</span> saved developers</h2></div>
      {bookmarks.length === 0 && <p className="empty-note">Nothing saved yet. Open a profile and press ★ bookmark.</p>}
      <div className="repo-list">{bookmarks.map((b) => (
        <div className="repo-row" style={{ gridTemplateColumns: "1fr auto auto", cursor: "default" }} key={b.login}>
          <div><Link className="rname" to={`/user/${b.login}`}>@{b.login}</Link>
            <input className="note-input" placeholder="add a note…" value={b.note} onChange={(e) => updateNote(b.login, e.target.value)} /></div>
          <Link className="btn ghost" to={`/user/${b.login}`}>open</Link>
          <button className="btn danger" onClick={() => { removeBookmark(b.login); toast(`Removed ${b.login}`, "error"); }}>delete</button>
        </div>
      ))}</div>
    </div>
  );
}

const NotFound = () => <div className="form-box"><h3 style={{ color: "#eef2f6" }}>404</h3><p className="bio">Page not found.</p><Link className="btn" to="/">go home</Link></div>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider><ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="user/:username" element={<UserLayout />}>
              <Route index element={<Overview />} />
              <Route path="repos" element={<Repos />} />
            </Route>
            <Route path="compare" element={<CompareForm />} />
            <Route path="compare/:a/:b" element={<Compare />} />
            <Route path="login" element={<Login />} />
            <Route path="bookmarks" element={<RequireAuth><Bookmarks /></RequireAuth>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ToastProvider></AuthProvider>
    </BrowserRouter>
  );
}
