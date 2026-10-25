import { useEffect, useMemo } from "react";
import { Chart as C, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
import { Doughnut, Bar } from "react-chartjs-2";
C.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "m" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n));
const COLORS = { JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Java: "#b07219", "C++": "#f34b7d", C: "#555555", Go: "#00ADD8", HTML: "#e34c26", CSS: "#563d7c", Shell: "#89e051" };
export const langColor = (l) => {
  if (COLORS[l]) return COLORS[l];
  let h = 0;
  for (let i = 0; i < l.length; i++) h = l.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360},55%,55%)`;
};

// reusable input with validation message
export const Input = ({ label, error, ...p }) => (
  <label className="field"><span>{label}</span><input {...p} />{error && <em className="ferr">{error}</em>}</label>
);

export function Modal({ open, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Dropdown({ value, onChange, options }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}

export function ProfileCard({ user }) {
  const joined = new Date(user.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short" });
  return (
    <div className="profile-card">
      <img src={`${user.avatar_url}&s=160`} alt={`${user.login} avatar`} />
      <div className="profile-main">
        <h3>{user.name || user.login}</h3>
        <p className="login">@{user.login}</p>
        {user.bio && <p className="bio">{user.bio}</p>}
        <div className="profile-stats">
          <div><b>{fmt(user.followers)}</b><span>followers</span></div>
          <div><b>{fmt(user.following)}</b><span>following</span></div>
          <div><b>{fmt(user.public_repos)}</b><span>repos</span></div>
        </div>
        <p className="profile-meta">joined {joined}{user.location ? ` · ${user.location}` : ""}</p>
      </div>
    </div>
  );
}

export function LangChart({ totals }) {
  const e = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!e.length) return <p className="note">No language data available.</p>;
  const data = { labels: e.map((x) => x[0]), datasets: [{ data: e.map((x) => x[1]), backgroundColor: e.map((x) => langColor(x[0])), borderColor: "#0f141c", borderWidth: 2 }] };
  return <div className="chart-wrap"><Doughnut data={data} options={{ maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { color: "#c9d1d9", boxWidth: 10 } } } }} /></div>;
}

export function ActivityChart({ events }) {
  const data = useMemo(() => {
    const counts = {};
    for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); counts[d.toISOString().slice(0, 10)] = 0; }
    events.forEach((ev) => { const k = ev.created_at.slice(0, 10); if (k in counts) counts[k]++; });
    return { labels: Object.keys(counts).map((d) => d.slice(5)), datasets: [{ data: Object.values(counts), backgroundColor: "#3fb950", borderRadius: 3 }] };
  }, [events]);
  return <div className="chart-wrap"><Bar data={data} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#6e7681" }, grid: { display: false } }, y: { ticks: { color: "#6e7681", stepSize: 1 }, grid: { color: "#182029" } } } }} /></div>;
}

export function Heatmap({ events }) {
  const { days, streak, total } = useMemo(() => {
    const counts = {};
    events.forEach((ev) => { const k = ev.created_at.slice(0, 10); counts[k] = (counts[k] || 0) + 1; });
    const days = [];
    for (let i = 89; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = d.toISOString().slice(0, 10); days.push({ k, n: counts[k] || 0 }); }
    let streak = 0;
    for (let i = days.length - 1; i >= 0 && days[i].n > 0; i--) streak++;
    return { days, streak, total: days.reduce((s, d) => s + d.n, 0) };
  }, [events]);
  const max = Math.max(1, ...days.map((d) => d.n));
  const lvl = (n) => (n === 0 ? 0 : n / max > 0.75 ? 4 : n / max > 0.5 ? 3 : n / max > 0.2 ? 2 : 1);
  return (
    <>
      <div className="panel-header"><h2><span className="idx">04</span> contribution matrix</h2><div className="streak-badge">{streak}-day streak · {fmt(total)} events</div></div>
      <div className="heatmap-wrap"><div className="heatmap">{days.map((d) => <span key={d.k} className="hcell" data-lvl={lvl(d.n)} title={`${d.k}: ${d.n}`} />)}</div></div>
      <p className="note">Approximated from public events (last ~90 days).</p>
    </>
  );
}
