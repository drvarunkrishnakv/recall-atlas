// The comments UI: a composer, thread cards, a Docs-style margin on wide screens, and a
// panel (side drawer / bottom sheet) everywhere. Three kinds of thread:
//   comment  — a note or doubt; ✓ resolves it and it disappears from view
//   sticky   — a permanent sticky note that never resolves (unpin to make it a comment)
//   claude   — "Ask Claude": Claude replies on its next run; pin the answer or resolve it
//   flag     — raised by an AI reviewer bot on a doubtful passage; Claude checks it and replies
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AtlasThreadStore } from "./threadStore";
import { isWaitingForClaude, type FlagLevel, type StoredThread, type ThreadKind } from "../lib/threads";
import { AGENTS, AIS, agentOf, bot, isAi } from "../lib/personas";
import { useSwipeToClose } from "../components/gestures";

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

/** A round avatar for whoever wrote a comment: Claude, you, or the AI (its own colour and mark). */
function Avatar({ userId, size = 22 }: { userId: string; size?: number }) {
  const agent = agentOf(userId === "claude" || userId === "me" ? userId : "bot", userId);
  return (
    <span className={`ds-orb ${agent}`} style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      {AGENTS[agent].mark}
    </span>
  );
}

const STAMP: Record<FlagLevel, string> = { wrong: "✕", outdated: "⟳", unsourced: "?", uncertain: "~" };

/** Claude's verdict on a flag, read from its reply: "Confirmed…" or "Not supported…". */
function verdictOf(t: StoredThread): "confirmed" | "rejected" | null {
  const last = t.comments.filter((c) => c.userId === "claude").at(-1)?.body ?? "";
  return /^confirmed/i.test(last) ? "confirmed" : /^not supported/i.test(last) ? "rejected" : null;
}

/** Where a flag stands: raised, checked by Claude, decided by you, closed. */
function FlagTrail({ t }: { t: StoredThread }) {
  const firstClaude = t.comments.findIndex((c) => c.userId === "claude");
  const steps = [
    { label: "Raised", done: true },
    { label: "Checked", done: firstClaude >= 0 },
    {
      label: "You decide",
      done: t.resolved || (firstClaude >= 0 && t.comments.slice(firstClaude).some((c) => c.userId === "me")),
    },
    { label: t.resolved && verdictOf(t) === "rejected" ? "Dismissed" : "Applied", done: t.resolved },
  ];
  return (
    <ol className="th-trail" aria-label="Progress">
      {steps.map((s) => (
        <li key={s.label} className={s.done ? "done" : ""}>
          {s.label}
        </li>
      ))}
    </ol>
  );
}

const hash = (id: string) => [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
/** Small deterministic tilt for sticky notes, so a stack of them looks like paper. */
const tilt = (id: string) => [-1.6, 1.1, -0.7, 1.4, -1.1, 0.6][hash(id) % 6];
/** Each sticky note keeps one of six paper colours (index.css --paper-0…5), chosen by its id. */
export const PAPERS = 6;
export const paperOf = (id: string) => (hash(id) >>> 3) % PAPERS;

export function ThreadCard({
  thread,
  store,
  selected,
  onSelect,
  style,
  cardRef,
  linked = false,
  onHover,
}: {
  thread: StoredThread;
  store: AtlasThreadStore;
  selected: boolean;
  onSelect: (id: string | undefined) => void;
  style?: React.CSSProperties;
  cardRef?: (el: HTMLDivElement | null) => void;
  /** Its highlighted text is being pointed at. */
  linked?: boolean;
  /** Pointing at the card lights up its highlight in the text. */
  onHover?: (id: string | undefined) => void;
}) {
  // A kind this build doesn't know (added by a newer app or server) shows as a plain comment.
  const info = KIND_INFO[thread.kind] ?? KIND_INFO.comment;
  const waiting = isWaitingForClaude(thread);
  const sticky = thread.kind === "sticky";
  const full = selected || sticky;
  const [first, ...replies] = thread.comments;
  const shownReplies = full ? replies : [];
  const more = replies.length - shownReplies.length;
  const verdict = thread.kind === "flag" ? verdictOf(thread) : null;
  const act = (e: React.MouseEvent, fn: () => Promise<unknown>) => {
    e.stopPropagation();
    void fn();
  };
  return (
    <div
      ref={cardRef}
      className={`thread kind-${thread.kind}${sticky ? ` paper-${paperOf(thread.id)}` : ""}${selected ? " selected" : ""}${linked ? " linked" : ""}${thread.resolved ? " resolved" : ""}`}
      style={sticky ? ({ ...style, "--tilt": `${tilt(thread.id)}deg` } as React.CSSProperties) : style}
      data-thread={thread.id}
      aria-label={sticky ? info.label : undefined}
      onClick={() => onSelect(thread.id)}
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover?.(thread.id)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover?.(undefined)}
    >
      {sticky ? (
        thread.detached && (
          <div className="paper-head">
            <span className="badge muted">Text removed</span>
          </div>
        )
      ) : (
        <div className="thread-head">
          {first && <Avatar userId={first.userId} />}
          <span className="th-who">{first ? who(thread, first.userId) : info.label}</span>
          {first && <time>{when(first.createdAt)}</time>}
          <span className="th-tags">
            {thread.flag ? (
              <>
                <span className="badge th-kind">{info.label}</span>
                <span className={`badge level ${thread.flag.level}`}>
                  <span aria-hidden>{STAMP[thread.flag.level]}</span> {LEVEL[thread.flag.level]}
                </span>
              </>
            ) : (
              thread.kind !== "comment" && (
                <span className="badge th-kind">
                  {info.icon} {info.label}
                </span>
              )
            )}
            {thread.resolved && <span className="badge muted">Resolved</span>}
            {thread.detached && <span className="badge muted">Text removed</span>}
          </span>
        </div>
      )}
      {thread.anchor.quote && <blockquote className="quote">{thread.anchor.quote}</blockquote>}
      {first && (
        <div className={`comment first by-${first.userId}`}>
          <div className="text">{first.body}</div>
          {sticky && (
            <div className="paper-foot">
              <Avatar userId={first.userId} size={18} />
              <span>{who(thread, first.userId)}</span>
              <time>{when(first.createdAt)}</time>
            </div>
          )}
          {thread.flag && thread.flag.sources.length > 0 && (
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
      )}
      {verdict && (
        <div className={`th-verdict ${verdict}`}>
          <Avatar userId="claude" size={18} />
          <b>{verdict === "confirmed" ? "Claude: Confirmed" : "Claude: Not supported"}</b>
          {!selected && <span>· tap to read</span>}
        </div>
      )}
      {shownReplies.length > 0 && (
        <div className="th-replies">
          {shownReplies.map((c) => (
            <div key={c.id} className={`comment by-${c.userId}`}>
              <div className="who">
                <Avatar userId={c.userId} size={18} />
                {who(thread, c.userId)} <time>{when(c.createdAt)}</time>
              </div>
              <div className="text">{c.body}</div>
            </div>
          ))}
        </div>
      )}
      {more > 0 && <div className="more-replies">{more === 1 ? "1 reply" : `${more} replies`}</div>}
      {thread.kind === "flag" && <FlagTrail t={thread} />}
      {waiting && (
        <div className="waiting">
          <span className="ds-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
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
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  useSwipeToClose(at ? null : sheet, onCancel);
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
        ref={setSheet}
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
  hoverId,
  onHover,
}: {
  threads: StoredThread[];
  store: AtlasThreadStore;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  root: HTMLElement | null;
  hoverId?: string;
  onHover?: (id: string | undefined) => void;
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
          linked={t.id === hoverId}
          onHover={onHover}
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
  const list = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);
  useSwipeToClose(sheet, onClose);
  // The note you tapped glides into view in the list.
  useEffect(() => {
    if (!selectedId) return;
    const el = list.current?.querySelector(`[data-thread="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [selectedId, filter]);
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
      <aside className="comments-panel" aria-label="Comments" ref={setSheet}>
        <div className="sheet-grab" aria-hidden="true" />
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
        <div className="panel-list" ref={list}>
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
