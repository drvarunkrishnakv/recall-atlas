// The Claude inbox in the Board look (the chosen design: Claude inbox 1 · Table + drawer). The same
// items as before (changes to approve, Claude's replies, AI reviewers' flags, questions waiting
// for Claude, and what Claude filed from your scratch pad), grouped into "Needs you" and "For your
// information", with a drawer per item. A proposed change shows its exact line, its section, why,
// its source, Claude's confidence and whether it was checked; "Verify, then add" is the main action.
import { useState, type ReactNode } from "react";
import { api, getPage, refreshPage, type Collection } from "../content/store";
import { deleteCapture, refreshStudy, useStudy } from "../content/study";
import { Link } from "../components/nav";
import { AIS, bot, isAi } from "../lib/personas";
import { blockText, type Block } from "../lib/blocks";
import { preview, type Proposal } from "../lib/proposals";
import type { StoredThread } from "../lib/threads";
import type { Capture } from "../lib/progress";
import { dayLabel, Drawer, useSelection, useTitle } from "./parts";
import "../prelims/prelims.css";
import "./mains-extra.css";

type Kind = "change" | "reply" | "flag" | "waiting" | "capture" | "filed";
const KIND: Record<Kind, { group: "needs" | "info"; heading: string; label: string }> = {
  change: { group: "needs", heading: "Changes to approve", label: "Note update" },
  reply: { group: "needs", heading: "Replies from Claude", label: "Claude replied" },
  flag: { group: "needs", heading: "Flags from AI reviewers", label: "AI flag" },
  waiting: { group: "info", heading: "Waiting for Claude", label: "Ask Claude" },
  capture: { group: "info", heading: "Waiting for Claude", label: "Scratch pad" },
  filed: { group: "info", heading: "Filed from your scratch pad", label: "Filed" },
};
const ORDER: Kind[] = ["change", "reply", "flag", "waiting", "capture", "filed"];

interface Item {
  id: string;
  kind: Kind;
  /** `notes:P06`, for page items. */
  key?: string;
  note: string;
  date?: string;
  p?: Proposal;
  t?: StoredThread;
  c?: Capture;
}

const pageOf = (key: string) => {
  const [c, id] = key.split(":");
  return { collection: (c === "notes" ? "notes" : "cards") as Collection, id };
};
const titleOf = (key: string) => {
  const { collection, id } = pageOf(key);
  return getPage(collection, id)?.title ?? id;
};
const hrefOf = (key: string) => `/${key.split(":")[0]}/${key.split(":")[1]}`;

/** The heading a block sits under, for "Add to P10 · <section>". */
function sectionOf(blocks: Block[] | undefined, blockId: string): string {
  let last = "";
  let found = "";
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      if (found) return;
      if (b.type === "heading") last = blockText(b) || last;
      if (b.id === blockId) found = last || "Top of the note";
      if (b.children) walk(b.children);
    }
  };
  walk(blocks ?? []);
  return found;
}

/** Everything the inbox lists, worked out exactly as before the Board look. */
function useItems(): Item[] {
  const { threads, captures, proposals } = useStudy();
  const items: Item[] = [];
  for (const [key, list] of Object.entries(proposals))
    for (const p of list.filter((x) => x.status === "pending"))
      items.push({ id: `p-${key}-${p.id}`, kind: "change", key, note: pageOf(key).id, date: p.createdAt, p });
  for (const [key, ts] of Object.entries(threads))
    for (const t of ts) {
      const note = pageOf(key).id;
      const date = t.comments.at(-1)?.createdAt ?? t.updatedAt;
      if (t.kind === "claude" && !t.resolved)
        items.push({
          id: `t-${t.id}`,
          kind: t.comments.at(-1)?.userId === "claude" ? "reply" : "waiting",
          key,
          note,
          date,
          t,
        });
      else if (t.kind === "flag" && !t.resolved) items.push({ id: `t-${t.id}`, kind: "flag", key, note, date, t });
    }
  for (const c of captures)
    items.push({
      id: `c-${c.id}`,
      kind: c.status === "open" ? "capture" : "filed",
      note: c.status === "done" ? (c.note ?? "—") : "—",
      date: c.doneAt ?? c.createdAt,
      c,
    });
  return items;
}

const verdictOf = (t: StoredThread) => t.comments.filter((c) => c.userId === "claude").at(-1)?.body;
const aiOf = (t: StoredThread) => {
  const author = t.comments[0]?.userId;
  return isAi(author) ? AIS[author].name : "AI";
};

/** The row's main text and the line under it. */
function rowText(it: Item): { main: ReactNode; sub?: ReactNode; tone?: string } {
  switch (it.kind) {
    case "change": {
      const { after, before } = preview([], it.p!);
      return {
        main: after || before,
        sub: it.p!.verifyRequested
          ? "Goes in once the primary source matches"
          : `✎ ${titleOf(it.key!)} · ${it.p!.source.label}`,
        tone: it.p!.verifyRequested ? "up" : undefined,
      };
    }
    case "reply":
      return { main: `You: ${it.t!.comments[0]?.body ?? ""}`, sub: `Claude: ${it.t!.comments.at(-1)?.body ?? ""}` };
    case "flag": {
      const v = verdictOf(it.t!);
      return {
        main: `${aiOf(it.t!)}: ${it.t!.comments[0]?.body ?? ""}`,
        sub: v ? `Claude: ${v}` : `${it.t!.flag?.level ?? "flag"} · Claude will check this`,
      };
    }
    case "waiting":
      return { main: it.t!.comments[0]?.body ?? "", sub: `Ask Claude · ${titleOf(it.key!)}` };
    case "capture":
      return { main: it.c!.text, sub: "Scratch pad · Claude files it on its next run" };
    case "filed":
      return { main: it.c!.text, sub: it.c!.note ? `Filed into ${it.c!.note}` : "Done", tone: "up" };
  }
}

type Tab = "all" | "needs" | "info";

export default function InboxBoard() {
  useTitle("Claude inbox");
  const items = useItems();
  const [tab, setTab] = useState<Tab>("all");
  const [sel, select] = useSelection("item");
  const [status, setStatus] = useState<Record<string, { text: string; tone: string }>>({});
  const [kept, setKept] = useState<Record<string, Item>>({});
  // An item you just acted on stays in the list (dimmed, with what happened) until you leave.
  const shown = [...items, ...Object.values(kept).filter((k) => !items.some((i) => i.id === k.id))];
  const needs = shown.filter((i) => KIND[i.kind].group === "needs");
  const info = shown.filter((i) => KIND[i.kind].group === "info");
  const current = shown.find((i) => i.id === sel);
  const groups: [string, Item[]][] = [];
  if (tab !== "info") groups.push(["Needs you", needs]);
  if (tab !== "needs") groups.push(["For your information", info]);
  const act =
    (it: Item) =>
    (text: string, tone = "up") => {
      setKept((k) => ({ ...k, [it.id]: it }));
      setStatus((s) => ({ ...s, [it.id]: { text, tone } }));
    };

  return (
    <article className="dash wide mx-page mx-inbox">
      <header className="mx-head">
        <div>
          <h1>Claude inbox</h1>
          <span className="mx-sub">
            What Claude found, made or needs you to decide. Nothing reaches your notes without you.
          </span>
        </div>
        <div className="mx-stats" role="tablist" aria-label="Filter">
          {(
            [
              ["all", "All", shown.length],
              ["needs", "Needs you", needs.filter((i) => !status[i.id]).length],
              ["info", "For your information", info.length],
            ] as [Tab, string, number][]
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`mx-pill${tab === k ? " on" : ""}`}
              onClick={() => setTab(k)}
            >
              {label} <span className={k === "needs" && n ? "t-mode" : "mx-muted"}>&nbsp;{n}</span>
            </button>
          ))}
        </div>
      </header>

      <div className={`mx-split${current ? " has-drawer" : ""}`}>
        <section className="mx-table cols-inbox" aria-label="Items">
          <div className="mx-thead" aria-hidden="true">
            <span>Note</span>
            <span>Item</span>
            <span className="mx-c-wide">Confidence</span>
            <span className="mx-c-wide">Date</span>
          </div>
          {groups.map(([name, list]) => (
            <div key={name} role="rowgroup">
              <div className="mx-group tone big">
                {name} <span className="mx-muted">· {list.length}</span>
              </div>
              {list.length === 0 && (
                <p className="mx-empty small">{name === "Needs you" ? "Nothing needs you." : "Nothing waiting."}</p>
              )}
              {ORDER.filter((k) => KIND[k].group === (name === "Needs you" ? "needs" : "info"))
                .map((k) => [k, list.filter((i) => i.kind === k)] as const)
                .filter(([, l]) => l.length)
                .reduce<[string, Item[]][]>((acc, [k, l]) => {
                  // "Waiting for Claude" holds both questions and scratch-pad captures.
                  const h = KIND[k].heading;
                  const at = acc.find(([x]) => x === h);
                  if (at) at[1].push(...l);
                  else acc.push([h, [...l]]);
                  return acc;
                }, [])
                .map(([heading, l]) => (
                  <div key={heading} role="rowgroup">
                    <div className="mx-subhead">{heading}</div>
                    {l.map((it) => {
                      const tx = rowText(it);
                      const st = status[it.id];
                      return (
                        <div
                          key={it.id}
                          className={`mx-row inbox-card k-${it.kind}${it.id === sel ? " on" : ""}${st ? " done" : ""}`}
                          onClick={() => select(it.id)}
                        >
                          <span className="mx-small b mx-muted">{it.note}</span>
                          <span className="mx-main mx-stack">
                            <button
                              type="button"
                              className="mx-row-open ellipsis"
                              onClick={(e) => (e.stopPropagation(), select(it.id))}
                            >
                              <span>{tx.main}</span>
                            </button>
                            {(st || tx.sub) && (
                              <span
                                className={`mx-small b ellipsis ${st ? `t-${st.tone}` : tx.tone ? `t-${tx.tone}` : "mx-muted"}`}
                              >
                                {st ? st.text : tx.sub}
                              </span>
                            )}
                          </span>
                          <span className={`mx-c-wide mx-small b t-conf-${it.p?.confidence ?? "none"}`}>
                            {it.p?.confidence ?? "—"}
                          </span>
                          <span className="mx-c-wide mx-small mx-muted b">{dayLabel(it.date)}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          ))}
        </section>
        {current && (
          <ItemDrawer it={current} status={status[current.id]} onAct={act(current)} onClose={() => select(null)} />
        )}
      </div>
    </article>
  );
}

function ItemDrawer({
  it,
  status,
  onAct,
  onClose,
}: {
  it: Item;
  status?: { text: string; tone: string };
  onAct: (text: string, tone?: string) => void;
  onClose: () => void;
}) {
  const k = KIND[it.kind];
  const kicker = `${k.label} · ${it.note} · ${dayLabel(it.date)}${it.p?.confidence ? ` · ${it.p.confidence} confidence` : ""}`;
  const title =
    it.kind === "change"
      ? `${it.p!.kind === "edit" ? "Change wording in" : it.p!.kind === "row" ? "New row in" : it.p!.kind === "check" ? "New open check in" : "New line in"} ${titleOf(it.key!)}`
      : it.kind === "capture" || it.kind === "filed"
        ? "From your scratch pad"
        : titleOf(it.key!);
  return (
    <Drawer label="Item" onClose={onClose} kicker={kicker} title={title}>
      {status && <div className={`mx-status t-${status.tone}`}>{status.text}</div>}
      {it.kind === "change" && <ProposalBody it={it} done={!!status} onAct={onAct} />}
      {(it.kind === "reply" || it.kind === "waiting" || it.kind === "flag") && it.t && (
        <div className="mx-block">
          <blockquote className="mx-quote">{it.t.anchor.quote}</blockquote>
          {it.kind === "flag" ? (
            <>
              <span className="mx-label">
                ⚑ {aiOf(it.t)} · {bot(it.t.flag?.by ?? "")?.name ?? "Reviewer"} · {it.t.flag?.level}
              </span>
              <span>
                {aiOf(it.t)}: {it.t.comments[0]?.body}
              </span>
              {it.t.flag?.sources.map((s) => (
                <a key={s.url} className="mx-src" href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.label} ↗
                </a>
              ))}
              <span className={verdictOf(it.t) ? "" : "mx-muted"}>
                {verdictOf(it.t) ? `Claude: ${verdictOf(it.t)}` : "Claude will check this on its next run."}
              </span>
            </>
          ) : (
            <>
              <span>You: {it.t.comments[0]?.body}</span>
              {it.kind === "reply" ? (
                <span className="mx-claude-box">Claude: {it.t.comments.at(-1)?.body}</span>
              ) : (
                <span className="mx-muted">Claude replies in the thread on its next run.</span>
              )}
            </>
          )}
          <Link className="board-btn" to={hrefOf(it.key!)}>
            Open {it.note}
          </Link>
        </div>
      )}
      {it.kind === "capture" && it.c && (
        <div className="mx-block">
          <span>{it.c.text}</span>
          <span className="mx-muted">Claude files it into the right note on its next run and reports here.</span>
        </div>
      )}
      {it.kind === "filed" && it.c && (
        <div className="mx-block">
          <span className="mx-label">{it.c.note ? `Filed into ${it.c.note}` : "Done"}</span>
          <span>You: {it.c.text}</span>
          <span className="mx-claude-box">Claude: {it.c.reply}</span>
          <span className="mx-actions-row">
            {it.c.note && (
              <Link className="board-btn small" to={`/notes/${it.c.note}`}>
                Open {it.c.note}
              </Link>
            )}
            <button
              type="button"
              className="board-btn quiet small"
              disabled={!!status}
              onClick={() => {
                onAct("Cleared", "muted");
                void deleteCapture(it.c!.id);
              }}
            >
              Clear
            </button>
          </span>
        </div>
      )}
    </Drawer>
  );
}

function ProposalBody({ it, done, onAct }: { it: Item; done: boolean; onAct: (text: string, tone?: string) => void }) {
  const p = it.p!;
  const { collection, id } = pageOf(it.key!);
  const page = getPage(collection, id);
  const { before, after } = preview(page?.blocks ?? [], p);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(
    p.kind === "row" ? (p.cells ?? []).join(" | ") : p.kind === "edit" ? (p.replace ?? "") : (p.text ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const path = `/api/proposals/${collection}/${id}`;
  const post = (body: unknown) => api(path, { method: "POST", body: JSON.stringify(body) });
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refreshStudy();
      await refreshPage(collection, id).catch(() => null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refreshStudy();
    } finally {
      setBusy(false);
    }
  };
  const verifyThenAdd = run(async () => {
    if (p.verification === "primary") {
      await post({ op: "approve", proposalId: p.id });
      onAct(`Added to ${id}: its primary source was already checked`);
    } else {
      await post({ op: "verify", proposalId: p.id });
      onAct("Goes in once Claude finds the primary source and it matches");
    }
  });
  const addNow = run(async () => {
    await post({ op: "unverified", proposalId: p.id });
    await post({ op: "approve", proposalId: p.id });
    onAct(`Added to ${id}, marked unverified`, "gold");
  });
  const reject = run(async () => {
    await post({ op: "reject", proposalId: p.id });
    onAct("Rejected and logged", "muted");
  });
  const saveEdit = run(async () => {
    await post(
      p.kind === "row"
        ? { op: "revise", proposalId: p.id, cells: text.split("|").map((c) => c.trim()) }
        : p.kind === "edit"
          ? { op: "revise", proposalId: p.id, replace: text }
          : { op: "revise", proposalId: p.id, text },
    );
    setEditing(false);
    onAct("Your wording is saved; it goes in after the source check");
  });
  const checked =
    p.verification === "primary"
      ? "Checked against a primary source"
      : p.verification === "secondary"
        ? "From a digest only: not yet checked against a primary source"
        : "Not yet checked against a primary source";
  const live = p.status === "pending" && !done;
  return (
    <div className="mx-block">
      <span className="mx-label">
        {p.kind === "edit" ? "Change in" : "Add to"} {id} · {sectionOf(page?.blocks, p.blockId) || "its section"}
      </span>
      {editing ? (
        <div className="mx-list">
          <label className="mx-sr" htmlFor={`edit-${p.id}`}>
            Edit the line
          </label>
          <textarea
            id={`edit-${p.id}`}
            className="mx-input"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {p.kind === "row" && <span className="mx-tiny mx-muted">Separate the cells with |</span>}
          <span className="mx-actions-row">
            <button type="button" className="board-btn small" disabled={busy || !text.trim()} onClick={saveEdit}>
              Save my wording
            </button>
            <button type="button" className="board-btn quiet small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </span>
        </div>
      ) : (
        <div className="mx-diff">
          {before && <del>{before}</del>}
          {after ? <ins>+ {after}</ins> : p.kind === "edit" ? <ins className="empty">(removed)</ins> : null}
        </div>
      )}
      <span>
        <b>Why:</b> {p.reason}
      </span>
      <span className="mx-small">
        <b>From:</b>{" "}
        <a href={p.source.url} target="_blank" rel="noopener noreferrer">
          {p.source.label} ↗
        </a>
        {p.source.date ? ` · ${dayLabel(p.source.date)}` : ""}
      </span>
      <span className="mx-small">
        <b>Confidence:</b> {p.confidence ?? "not given"}
      </span>
      <span className={`mx-small b ${p.verification === "primary" ? "t-up" : "t-gold"}`}>{checked}</span>
      {p.verifyRequested && !done && (
        <span className="mx-small b t-up">
          You asked Claude to verify it; it goes in once the primary source matches.
        </span>
      )}
      {error && <span className="mx-error">{error}</span>}
      {live && !editing && (
        <>
          <div className="mx-actions-row">
            <button
              type="button"
              className="board-btn grow"
              disabled={busy || !!p.verifyRequested}
              onClick={verifyThenAdd}
            >
              Verify, then add
            </button>
            <button type="button" className="board-btn quiet" disabled={busy} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="board-btn quiet danger" disabled={busy} onClick={reject}>
              Reject
            </button>
          </div>
          <button type="button" className="mx-link-btn" disabled={busy} onClick={addNow}>
            Add it now, marked unverified
          </button>
        </>
      )}
      <Link className="mx-link-btn" to={`${hrefOf(it.key!)}?review=1`}>
        Open it in the note →
      </Link>
    </div>
  );
}
