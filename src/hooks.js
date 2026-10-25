// Custom hooks
import { useCallback, useEffect, useState } from "react";
import { getUser, getRepos, getEvents, getLangs } from "./api";

export function useDebounce(value, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
}

// loads user + repos + events in parallel, then languages (dependent on repos)
export function useProfile(username) {
  const [state, setState] = useState({ loading: true, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null });
    (async () => {
      try {
        const [u, r, e] = await Promise.all([getUser(username), getRepos(username), getEvents(username)]);
        const langs = await getLangs(username, r.data);
        if (alive) setState({ loading: false, error: null, user: u.data, repos: r.data, events: e.data, langs, cached: u.hit && r.hit && e.hit });
      } catch (err) {
        if (alive) setState({ loading: false, error: err });
      }
    })();
    return () => { alive = false; };
  }, [username, tick]);
  return { ...state, reload };
}
