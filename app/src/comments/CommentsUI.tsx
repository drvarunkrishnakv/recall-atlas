// The comments UI: a composer, thread cards, a Docs-style margin on wide screens, and a
// panel (side drawer / bottom sheet) everywhere. Three kinds of thread:
//   comment  — a note or doubt; ✓ resolves it and it disappears from view
//   sticky   — a permanent sticky note that never resolves (unpin to make it a comment)
//   claude   — "Ask Claude": Claude replies on its next run; pin the answer or resolve it
//   flag     — raised by an AI reviewer bot on a doubtful passage; Claude checks it and replies
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AtlasThreadStore } from "./threadStore";
import { isWaitingForClaude, type FlagLevel, type StoredThread, type ThreadKind } from "../lib/threads";
import { AIS, bot, isAi } from "../lib/personas";

export const KIND_INFO: Record<ThreadKind, { label: string; icon: string; hint: string }> = {
  comment: { label: "Comment", icon: "💬", hint: "Closes when you tick ✓" },
  sticky: { label: "Sticky note", icon: "📌", hint: "Stays on the page for good" },
  claude: { label: "Ask Claude", icon: "✦", hint: "Claude replies on its next run" },
  flag: { label: "AI flag", icon: "⚑", hint: "Raised by an AI reviewer; Claude checks it" },
};

const LEVEL: Record<FlagLevel, string> = {
  wrong: "Looks wrong",
  outdated: "Out of date",
  unsourced: "No source",
  uncertain: "Uncertain",
};
/** "Claude", "You", or the AI and its bot: "Gemini · Reviewer". */
const who = (t: StoredThread, userId: string) =>
  userId === "claude"
    ? "Claude"
    : isAi(userId)
      ? `${AIS[userId].name}${t.flag ? ` · ${bot(t.flag.by)?.name ?? t.flag.by}` : ""}`
      : "You";

const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso: string) => fmt.format(new Date(iso));

export function useStoredThreads(store: AtlasThreadStore): StoredThread[] {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.stored,
  );
}

function Submit({
  onSubmit,
  placeholder,
  autoFocus,
}: {
  onSubmit: (text: string) => Promise<unknown>;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(text.trim());
      setText("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reply">
      <textarea
        value={text}
        placeholder={placeholder}
        rows={2}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void go();
          }
        }}
      />
      {text.trim() && (
        <button type="button" className="chip-btn primary" disabled={busy} onClick={() => void go()}>
          Reply
        </button>
      )}
    </div>
  );
}

export function ThreadCard({
  thread,
  store,
  selected,
  onSelect,
  style,
  cardRef,
}: {
  thread: StoredThread;
  store: AtlasThreadStore;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
  style?: React.CSSProperties;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const info = KIND_INFO[thread.kind];
  const waiting = isWaitingForClaude(thread);
  const full = selected || thread.kind === "sticky";
  const shown = full ? thread.comments : thread.comments.slice(0, 1);
  const more = thread.comments.length - shown.length;
  const act = (e: React.MouseEvent, fn: () => Promise<unknown>) => {
    e.stopPropagation();
    void fn();
  };
  return (
    <div
      ref={cardRef}
      className={`thread kind-${thread.kind}${selected ? " selected" : ""}${thread.resolved ? " resolved" : ""}`}
      style={style}
      data-thread={thread.id}
      onClick={() => onSelect(thread.id)}
    >
      <div className="thread-head">
        <span className="badge">
          {info.icon} {info.label}
        </span>
        {thread.flag && <span className={`badge level ${thread.flag.level}`}>{LEVEL[thread.flag.level]}</span>}
        {thread.resolved && <span className="badge muted">Resolved</span>}
        {thread.detached && <span className="badge muted">Text removed</span>}
      </div>
      {thread.anchor.quote && <blockquote className="quote">{thread.anchor.quote}</blockquote>}
      {shown.map((c, i) => (
        <div key={c.id} className={`comment by-${c.userId}`}>
          <div className="who">
            {who(thread, c.userId)} <time>{when(c.createdAt)}</time>
          </div>
          <div className="text">{c.body}</div>
          {i === 0 && thread.flag && thread.flag.sources.length > 0 && (
            <div className="flag-srcs">
              {thread.flag.sources.map((s, j) => (
                <a
                  key={j}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={s.url}
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.label} ↗
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
      {more > 0 && <div className="more-replies">{more === 1 ? "1 reply" : `${more} replies`}</div>}
      {waiting && (
        <div className="waiting">
          {thread.kind === "flag" ? "Claude checks this on its next run" : "Waiting for Claude's next run"}
        </div>
      )}
      {selected && (
        <>
          <Submit placeholder="Reply…" onSubmit={(t) => store.reply(thread.id, t)} />
          <div className="actions">
            {thread.kind !== "sticky" && !thread.resolved && (
              <button
                type="button"
                className="chip-btn"
                onClick={(e) => act(e, () => store.resolveThread({ threadId: thread.id }))}
              >
                ✓ Resolve
              </button>
            )}
            {thread.resolved && (
              <button
                type="button"
                className="chip-btn"
                onClick={(e) => act(e, () => store.unresolveThread({ threadId: thread.id }))}
              >
                Reopen
              </button>
            )}
            {thread.kind !== "sticky" ? (
              <button
                type="button"
                className="chip-btn"
                onClick={(e) => act(e, () => store.setKind(thread.id, "sticky"))}
              >
                📌 Pin as sticky
              </button>
            ) : (
              <button
                type="button"
                className="chip-btn"
                onClick={(e) => act(e, () => store.setKind(thread.id, "comment"))}
              >
                Unpin
              </button>
            )}
            {thread.kind === "comment" && (
              <button
                type="button"
                className="chip-btn"
                onClick={(e) => act(e, () => store.setKind(thread.id, "claude"))}
              >
                ✦ Ask Claude
              </button>
            )}
            <button
              type="button"
              className="chip-btn danger"
              onClick={(e) =>
                act(e, async () => {
                  await store.deleteThread({ threadId: thread.id });
                  onSelect(undefined);
                })
              }
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** New-thread composer. Rendered as a floating card near the selection, or a sheet on phones. */
export function Composer({
  quote,
  at,
  onSubmit,
  onCancel,
}: {
  quote: string;
  at: { top: number; left: number } | null;
  onSubmit: (kind: ThreadKind, text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ThreadKind>("comment");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit(kind, text.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <>
      {!at && <div className="sheet-scrim" onClick={onCancel} />}
      <div
        className={`composer${at ? "" : " sheet"}`}
        style={at ? { top: at.top, left: at.left } : undefined}
        role="dialog"
        aria-label="New comment"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <blockquote className="quote">{quote}</blockquote>
        <div className="kinds" role="radiogroup" aria-label="Kind">
          {(Object.keys(KIND_INFO) as ThreadKind[])
            .filter((k) => k !== "flag")
            .map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={kind === k ? "on" : ""}
                onClick={() => setKind(k)}
              >
                {KIND_INFO[k].icon} {KIND_INFO[k].label}
              </button>
            ))}
        </div>
        <p className="hint">{KIND_INFO[kind].hint}</p>
        <textarea
          autoFocus
          rows={3}
          value={text}
          placeholder={
            kind === "claude"
              ? "What should Claude explain, check or add?"
              : kind === "sticky"
                ? "Context to keep beside this text"
                : "Your comment"
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="chip-btn primary"
            disabled={!text.trim() || busy}
            onClick={() => void submit()}
          >
            {kind === "claude" ? "Ask Claude" : kind === "sticky" ? "Add sticky note" : "Comment"}
          </button>
          <button type="button" className="chip-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

/** Thread cards in the right margin, each level with its highlighted text (wide screens). */
export function CommentMargin({
  threads,
  store,
  selectedId,
  onSelect,
  root,
}: {
  threads: StoredThread[];
  store: AtlasThreadStore;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  root: HTMLElement | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [tops, setTops] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const visible = threads.filter((t) => !t.detached && (!t.resolved || t.id === selectedId));
  // Re-stack when a card itself changes height (fonts, sources, replies), not only the page.
  const cardResize = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => setTick((n) => n + 1));
    cardResize.current = ro;
    cards.current.forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!root) return;
    const bump = () => setTick((n) => n + 1);
    const ro = new ResizeObserver(bump);
    ro.observe(root);
    window.addEventListener("resize", bump);
    const mo = new MutationObserver(bump);
    mo.observe(root, { subtree: true, childList: true, characterData: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", bump);
    };
  }, [root]);

  useLayoutEffect(() => {
    if (!root || !box.current) return;
    const base = box.current.getBoundingClientRect().top;
    const want = visible
      .map((t) => {
        const mark = root.querySelector(`[data-bn-thread-id="${t.id}"]`);
        return { id: t.id, top: mark ? mark.getBoundingClientRect().top - base : null };
      })
      .filter((x): x is { id: string; top: number } => x.top !== null)
      .sort((a, b) => a.top - b.top);
    // Stack downwards so cards never overlap; the selected card keeps its place.
    const next: Record<string, number> = {};
    let floor = 0;
    for (const w of want) {
      const top = Math.max(w.top, floor);
      next[w.id] = top;
      floor = top + (cards.current.get(w.id)?.offsetHeight ?? 80) + 10;
    }
    if (JSON.stringify(next) !== JSON.stringify(tops)) setTops(next);
  });

  void tick;
  return (
    <div className="margin" ref={box} aria-label="Comments">
      {visible.map((t) => (
        <ThreadCard
          key={t.id}
          thread={t}
          store={store}
          selected={t.id === selectedId}
          onSelect={onSelect}
          cardRef={(el) => {
            const prev = cards.current.get(t.id);
            if (prev && prev !== el) cardResize.current?.unobserve(prev);
            if (el) {
              cards.current.set(t.id, el);
              cardResize.current?.observe(el);
            } else cards.current.delete(t.id);
          }}
          style={{ top: tops[t.id] ?? 0, visibility: t.id in tops ? "visible" : "hidden" }}
        />
      ))}
    </div>
  );
}

type Filter = "open" | "flags" | "sticky" | "claude" | "resolved";

/** Every thread on the page, filtered. A drawer on the right, or a bottom sheet on phones. */
export function CommentsPanel({
  threads,
  store,
  selectedId,
  onSelect,
  onClose,
}: {
  threads: StoredThread[];
  store: AtlasThreadStore;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("open");
  const counts: Record<Filter, StoredThread[]> = {
    open: threads.filter((t) => !t.resolved),
    flags: threads.filter((t) => t.kind === "flag" && !t.resolved),
    sticky: threads.filter((t) => t.kind === "sticky"),
    claude: threads.filter((t) => t.kind === "claude" && !t.resolved),
    resolved: threads.filter((t) => t.resolved),
  };
  const LABEL: Record<Filter, string> = {
    open: "Open",
    flags: "Flags",
    sticky: "Sticky",
    claude: "Claude",
    resolved: "Resolved",
  };
  return (
    <>
      <div className="sheet-scrim panel-scrim" onClick={onClose} />
      <aside className="comments-panel" aria-label="Comments">
        <div className="panel-head">
          <b>Comments</b>
          <button type="button" className="iconbtn" aria-label="Close comments" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="tabs" role="tablist">
          {(Object.keys(LABEL) as Filter[]).map((f) => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}>
              {LABEL[f]} <span className="n">{counts[f].length}</span>
            </button>
          ))}
        </div>
        <div className="panel-list">
          {counts[filter].length === 0 && (
            <p className="empty">
              {filter === "open" ? "No open comments. Select text on the page to add one." : "Nothing here."}
            </p>
          )}
          {counts[filter].map((t) => (
            <ThreadCard key={t.id} thread={t} store={store} selected={t.id === selectedId} onSelect={onSelect} />
          ))}
        </div>
      </aside>
    </>
  );
}
