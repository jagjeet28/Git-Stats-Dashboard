// Context API: Toast notifications + Auth (for protected routes)
import { createContext, useCallback, useContext, useState } from "react";

const ToastCtx = createContext();
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, type = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}

const AuthCtx = createContext();
export const useAuth = () => useContext(AuthCtx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => localStorage.getItem("gs-user"));
  const login = (name) => { localStorage.setItem("gs-user", name); setUser(name); };
  const logout = () => { localStorage.removeItem("gs-user"); setUser(null); };
  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}
