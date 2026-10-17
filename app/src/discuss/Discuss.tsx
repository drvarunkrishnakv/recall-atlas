// The Discuss sidebar: a Notion-style panel that floats over the note (it never pushes the
// text). Three tabs — Debate, Roundtable, Devil's advocate — list the questions Claude
// prepared for this note, plus any you add. Opening one shows Claude and Grok's bots talking
// it through, turn by turn, ending in Claude's conclusion. Turns arrive on a timer through
// the Atlas MCP server and Claude's scheduled task; this panel shows them as they land.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, type Collection } from "../content/store";
import { anchorFor } from "../comments/anchors";
import type { AtlasEditor } from "../editor/schema";
import type { Anchor } from "../lib/threads";
import { nextUp, progress, ROUND_NAMES, type Discussion, type DiscussionOp, type Turn } from "../lib/discussions";
import { AGENTS, agentOf, DEFAULT_SEATS, MODE_INFO, role, speaker, type Mode, type Seat } from "../lib/personas";

const uid = () => crypto.randomUUID().slice(0, 12);
const MODES: Mode[] = ["debate", "roundtable", "devil"];

function useDiscussions(collection: Collection, id: string, fast: boolean) {
  const path = `/api/discussions/${collection}/${id}`;
  const [list, setList] = useState<Discussion[]>([]);
  const load = useCallback(async () => {
    try {
      const { discussions } = (await api(path)) as { discussions: Discussion[] };
      setList((cur) => (JSON.stringify(cur) === JSON.stringify(discussions) ? cur : discussions));
    } catch {
      /* server stopped: keep what we have */
    }
  }, [path]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), fast ? 5000 : 60_000);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", load);
    };
  }, [load, fast]);
  const send = useCallback(
    async (op: DiscussionOp) => {
      const { discussions } = (await api(path, { method: "POST", body: JSON.stringify(op) })) as {
        discussions: Discussion[];
      };
      setList(discussions);
      return discussions;
    },
    [path],
  );
  return { list, send };
}

/** What a question you add starts from: the selected text, else the section heading nearest the top of the screen. */
function pickContext(
  editor: AtlasEditor,
  root: HTMLElement | null,
): { anchor: Anchor | null; quote?: string; section?: string } {
  const view = editor.prosemirrorView;
  const sel = window.getSelection();
  const selected = !!(view && sel && !sel.isCollapsed && view.dom.contains(sel.anchorNode));
  const heads = root ? [...root.querySelectorAll<HTMLElement>('[data-content-type="heading"]')] : [];
  const above = selected
    ? heads.filter((h) => h.compareDocumentPosition(sel!.anchorNode!) & Node.DOCUMENT_POSITION_FOLLOWING).at(-1)
    : (heads.filter((h) => h.getBoundingClientRect().top < 180).at(-1) ?? heads[0]);
  const section = above?.textContent?.trim() || undefined;
  if (view && sel && selected) {
    try {
      const range = sel.getRangeAt(0);
      const r = anchorFor(
        view.state.doc,
        view.posAtDOM(range.startContainer, range.startOffset),
        view.posAtDOM(range.endContainer, range.endOffset),
      );
      if (r) return { anchor: r.anchor, quote: r.anchor.quote, section };
    } catch {
      /* fall through to the section */
    }
  }
  const blockId = above?.closest<HTMLElement>("[data-id]")?.dataset.id;
  return { anchor: blockId && section ? { blockId, quote: section } : null, section };
}

/** Claude's or Grok's mark (or yours), as a small round avatar. */
function Orb({ by, size = 30 }: { by: string; size?: number }) {
  const agent = agentOf(by);
  return (
    <span className={`ds-orb ${agent}`} style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      {agent === "claude" ? "✳" : agent === "grok" ? "G" : "🙂"}
    </span>
  );
}

function Who({ seat }: { seat: Seat }) {
  const agent = agentOf(seat.by);
  const r = role(seat.role);
  return (
    <span className="ds-who">
      <b>{AGENTS[agent].name}</b>
      {r && (
        <span className={`ds-role ${seat.role}`}>
          {r.emoji} {r.label}
        </span>
      )}
    </span>
  );
}

function Sources({ list }: { list: { label: string; url: string }[] }) {
  return (
    <>
      {list.map((s, i) => (
        <a key={i} className="ds-src" href={s.url} target="_blank" rel="noopener noreferrer" title={s.url}>
          {s.label} ↗
        </a>
      ))}
    </>
  );
}

const side = (d: Discussion, t: Pick<Turn, "by" | "role">) =>
  t.by === "me" ? "me" : d.mode === "debate" && t.role === "opposer" ? "right" : "left";

function Message({ d, t, onPin }: { d: Discussion; t: Turn; onPin: (t: Turn) => void }) {
  const s = side(d, t);
  return (
    <div className={`ds-msg ${s} ${agentOf(t.by)}`}>
      {s !== "me" && <Orb by={t.by} />}
      <div className="ds-bubble">
        <div className="ds-head">{s === "me" ? <b>You</b> : <Who seat={{ role: t.role, by: t.by }} />}</div>
        {t.body.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {(t.sources.length > 0 || s !== "me") && (
          <div className="ds-foot">
            <Sources list={t.sources} />
            {s !== "me" && (
              <button
                type="button"
                className="ds-pin"
                onClick={() => onPin(t)}
                title="Ask Claude to work this point into the note"
              >
                📌 To note
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Waiting({ d }: { d: Discussion }) {
  const up = nextUp(d);
  const [copied, setCopied] = useState(false);
  if (!up) return null;
  const grok = agentOf(up.seat.by) === "grok";
  const prompt = `It's your turn in Mains Atlas discussion ${d.id}. Read it with atlas_get_discussion (persona "${up.seat.by}"), then post with atlas_post_turn.`;
  return (
    <div className={`ds-msg ${side(d, up.seat)} ${agentOf(up.seat.by)} waiting`}>
      <Orb by={up.seat.by} />
      <div className="ds-bubble">
        <div className="ds-head">
          <Who seat={up.seat} />
        </div>
        <span className="ds-dots" aria-label="Waiting">
          <i />
          <i />
          <i />
        </span>
        <span className="ds-hint">
          {up.kind === "conclusion"
            ? "Claude writes the conclusion on its next run."
            : grok
              ? "Grok answers on its next routine run."
              : "Claude answers on its next run."}
        </span>
        {grok && (
          <button
            type="button"
            className="ds-nudge"
            onClick={() => {
              void navigator.clipboard?.writeText(prompt).then(() => setCopied(true));
              window.setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "Copied ✓" : "Copy a nudge for Grok Bot"}
          </button>
        )}
      </div>
    </div>
  );
}

function Conversation({
  d,
  send,
  onPin,
  onBack,
}: {
  d: Discussion;
  send: (op: DiscussionOp) => Promise<unknown>;
  onPin: (d: Discussion, body: string, sources: { label: string; url: string }[], who: string) => Promise<void>;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const info = MODE_INFO[d.mode];
  const { done, total } = progress(d);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [d.turns.length, d.conclusion]);

  const pinned = (p: Promise<void>) =>
    void p.then(() => {
      setToast("Sent to Claude's inbox for the note ✓");
      window.setTimeout(() => setToast(""), 2400);
    });

  const post = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await send({ op: "turn", discussionId: d.id, turn: { id: uid(), by: "me", body: draft } });
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  const items: ReactNode[] = [];
  let round = -1;
  for (const t of d.turns) {
    if (t.round !== undefined && t.round !== round) {
      round = t.round;
      items.push(
        <div key={`r${round}`} className="ds-round">
          {round === 0 ? "Opening" : ROUND_NAMES[d.mode][round - 1]}
        </div>,
      );
    }
    items.push(<Message key={t.id} d={d} t={t} onPin={(x) => pinned(onPin(d, x.body, x.sources, speaker(x)))} />);
  }

  return (
    <div className="ds-convo">
      <div className={`ds-topic ${d.mode}`}>
        <button type="button" className="ds-back" onClick={onBack} aria-label="All questions">
          ←
        </button>
        <div>
          <span className="ds-kicker">
            {info.emoji} {info.title} · {done}/{total}
            {d.status === "closed" ? " · closed" : ""}
          </span>
          <p className="ds-motion">{d.topic}</p>
          {d.why && <p className="ds-why">{d.why}</p>}
          <div className="ds-cast">
            {d.seats.map((s, i) => (
              <span key={i} className="ds-chip">
                <Orb by={s.by} size={18} />
                {speaker(s).replace(/^(\w+) · /, "$1 · ")}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="ds-feed">
        {items}
        <Waiting d={d} />
        {d.conclusion && (
          <div className="ds-conclusion">
            <div className="ds-conc-head">
              <Orb by="claude" size={26} />
              <b>Conclusion</b>
              <span>by Claude</span>
            </div>
            {d.conclusion.body.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <div className="ds-foot">
              <Sources list={d.conclusion.sources} />
              <button
                type="button"
                className="ds-pin"
                onClick={() => pinned(onPin(d, d.conclusion!.body, d.conclusion!.sources, "Claude's conclusion"))}
              >
                📌 To note
              </button>
            </div>
          </div>
        )}
        {d.conclusion && d.mode === "debate" && (
          <div className="ds-vote">
            <b>{d.vote ? "Your verdict" : "Who convinced you?"}</b>
            <div>
              {(["for", "draw", "against"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={d.vote === v ? "on" : ""}
                  onClick={() => void send({ op: "vote", discussionId: d.id, vote: d.vote === v ? null : v })}
                >
                  {v === "for"
                    ? `👍 ${AGENTS[agentOf(d.seats[0].by)].name}`
                    : v === "against"
                      ? `👎 ${AGENTS[agentOf(d.seats[1].by)].name}`
                      : "🤝 Draw"}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {toast && <div className="ds-toast">{toast}</div>}

      {d.status === "open" ? (
        <div className="ds-compose">
          <textarea
            value={draft}
            rows={2}
            placeholder={
              d.mode === "devil" ? "Join the defence, or push back…" : "Join in: add a point or ask them something…"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && void post()}
          />
          <div className="ds-actions">
            <button type="button" className="ds-ghost" onClick={() => void send({ op: "close", discussionId: d.id })}>
              Close
            </button>
            <button type="button" className="ds-send" disabled={busy || !draft.trim()} onClick={() => void post()}>
              Send
            </button>
          </div>
        </div>
      ) : (
        <div className="ds-compose ds-row">
          <button type="button" className="ds-ghost" onClick={() => void send({ op: "reopen", discussionId: d.id })}>
            Reopen
          </button>
          <button
            type="button"
            className="ds-ghost danger"
            onClick={() =>
              window.confirm("Delete this discussion?") && void send({ op: "delete", discussionId: d.id }).then(onBack)
            }
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function Card({ d, onOpen }: { d: Discussion; onOpen: () => void }) {
  const up = nextUp(d);
  const { done, total } = progress(d);
  const state =
    d.status === "closed"
      ? "Closed"
      : d.conclusion
        ? "Conclusion ready"
        : done === 0
          ? `Starting soon · ${speaker(up!.seat)} opens`
          : `${speaker(up!.seat)} is up`;
  const cast = [...new Map(d.seats.map((s) => [s.by, s])).values()];
  return (
    <button type="button" className={`ds-card${d.conclusion ? " done" : ""}`} onClick={onOpen}>
      <span className="ds-card-topic">{d.topic}</span>
      {d.why && <span className="ds-card-why">{d.why}</span>}
      <span className="ds-meter" style={{ "--p": `${(done / total) * 100}%` } as CSSProperties} />
      <span className="ds-card-meta">
        <span className="ds-faces">
          {cast.map((s) => (
            <Orb key={s.by} by={s.by} size={20} />
          ))}
        </span>
        {state}
      </span>
    </button>
  );
}

function AddYourOwn({
  mode,
  ctx,
  onStart,
}: {
  mode: Mode;
  ctx: ReturnType<typeof pickContext>;
  onStart: (topic: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [err, setErr] = useState("");
  if (!open)
    return (
      <button
        type="button"
        className="ds-add"
        onClick={() => {
          setTopic(mode === "devil" ? (ctx.quote ?? "") : "");
          setOpen(true);
        }}
      >
        + Ask your own {mode === "debate" ? "motion" : mode === "roundtable" ? "question" : "claim to attack"}
      </button>
    );
  return (
    <form
      className="ds-addform"
      onSubmit={(e) => {
        e.preventDefault();
        setErr("");
        onStart(topic)
          .then(() => setOpen(false))
          .catch((x: Error) => setErr(x.message));
      }}
    >
      <textarea
        value={topic}
        rows={3}
        autoFocus
        placeholder={
          mode === "debate"
            ? "e.g. This House would rotate reserved seats every election"
            : mode === "roundtable"
              ? "e.g. Why do parties still field so few women?"
              : "Select a sentence in the note first, or type the claim"
        }
        onChange={(e) => setTopic(e.target.value)}
      />
      <span className="ds-cast">
        {DEFAULT_SEATS[mode].map((s, i) => (
          <span key={i} className="ds-chip">
            <Orb by={s.by} size={18} />
            {speaker(s)}
          </span>
        ))}
      </span>
      {ctx.section && <span className="ds-hint">About the section “{ctx.section}”</span>}
      {err && <span className="ds-err">{err}</span>}
      <div className="ds-actions">
        <button type="button" className="ds-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="submit" className="ds-send" disabled={topic.trim().length < 3}>
          Start
        </button>
      </div>
    </form>
  );
}

/** The top-bar button and the floating sidebar it opens. */
export function Discuss({
  collection,
  id,
  title,
  editor,
  root,
  onPin,
}: {
  collection: Collection;
  id: string;
  title: string;
  editor: AtlasEditor;
  root: HTMLElement | null;
  /** Sends a point to Claude as an "Ask Claude" thread on the passage. */
  onPin: (anchor: Anchor | null, text: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("debate");
  const [view, setView] = useState<string | null>(null);
  const [ctx, setCtx] = useState<ReturnType<typeof pickContext>>({ anchor: null });
  const { list, send } = useDiscussions(collection, id, open);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const counts = useMemo(() => {
    const out = { debate: 0, roundtable: 0, devil: 0 } as Record<Mode, number>;
    for (const d of list) if (d.status === "open" || d.conclusion) out[d.mode]++;
    return out;
  }, [list]);
  const ready = list.filter((d) => d.conclusion).length;

  const pin = (d: Discussion, body: string, sources: { label: string; url: string }[], who: string) =>
    onPin(
      d.anchor,
      `From the ${MODE_INFO[d.mode].title.toLowerCase()} on “${d.topic}”, ${who} said:\n\n${body}` +
        (sources.length ? `\n\nSources: ${sources.map((s) => `${s.label} ${s.url}`).join(" · ")}` : "") +
        "\n\nCan this go into the note? Check the facts first.",
    );

  const start = async (topic: string) => {
    const did = uid();
    await send({
      op: "create",
      discussion: { id: did, mode, topic, anchor: ctx.anchor, section: ctx.section, seats: DEFAULT_SEATS[mode] },
    });
    setView(did);
  };

  const mine = list
    .filter((d) => d.mode === mode)
    .sort((a, b) => Number(!!b.conclusion) - Number(!!a.conclusion) || a.createdAt.localeCompare(b.createdAt));
  const current = list.find((d) => d.id === view);

  return (
    <>
      <button
        type="button"
        className={`chip-btn ds-toggle${open ? " on" : ""}`}
        aria-pressed={open}
        aria-label="Discuss with Claude and Grok"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!open) setCtx(pickContext(editor, root));
          setOpen((v) => !v);
        }}
      >
        <span className="ds-toggle-icon">✦</span> Discuss
        {ready > 0 && <span className="ds-badge">{ready}</span>}
      </button>

      {open &&
        createPortal(
          <aside className="ds-panel" aria-label="Discuss">
            <header className="ds-top">
              <div>
                <b>Discuss</b>
                <span className="ds-sub">
                  <Orb by="claude" size={15} /> Claude and <Orb by="grok" size={15} /> Grok on “{title}”
                </span>
              </div>
              <button type="button" className="ds-close" aria-label="Close" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <div className="ds-tabs" role="tablist">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  className={m}
                  onClick={() => {
                    setMode(m);
                    setView(null);
                  }}
                >
                  {MODE_INFO[m].emoji} <span className="long">{MODE_INFO[m].title}</span>
                  <span className="short">{MODE_INFO[m].short}</span>
                  {counts[m] > 0 && <span className="ds-n">{counts[m]}</span>}
                </button>
              ))}
            </div>

            {current ? (
              <Conversation d={current} send={send} onPin={pin} onBack={() => setView(null)} />
            ) : (
              <div className="ds-list">
                <p className="ds-blurb">{MODE_INFO[mode].blurb}</p>
                {mine.length === 0 && (
                  <p className="ds-empty">
                    Claude hasn't prepared any {MODE_INFO[mode].title.toLowerCase()} questions for this note yet.
                  </p>
                )}
                {mine.map((d) => (
                  <Card key={d.id} d={d} onOpen={() => setView(d.id)} />
                ))}
                <AddYourOwn key={mode} mode={mode} ctx={ctx} onStart={start} />
              </div>
            )}
          </aside>,
          document.body,
        )}
    </>
  );
}
