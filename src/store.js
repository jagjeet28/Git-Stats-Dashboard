// Zustand global store: bookmarks (CRUD, persisted) + rate-limit info
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { session } from "./api";

export const useStore = create(
  persist(
    (set) => ({
      bookmarks: [],
      rate: null,
      addBookmark: (b) => set((s) => (s.bookmarks.some((x) => x.login === b.login) ? s : { bookmarks: [...s.bookmarks, { ...b, note: "" }] })),
      updateNote: (login, note) => set((s) => ({ bookmarks: s.bookmarks.map((b) => (b.login === login ? { ...b, note } : b)) })),
      removeBookmark: (login) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.login !== login) })),
    }),
    { name: "git-stats", partialize: (s) => ({ bookmarks: s.bookmarks }) }
  )
);

session.onRate = (h) => {
  if (h["x-ratelimit-remaining"] != null)
    useStore.setState({ rate: { remaining: +h["x-ratelimit-remaining"], limit: +h["x-ratelimit-limit"] } });
};
