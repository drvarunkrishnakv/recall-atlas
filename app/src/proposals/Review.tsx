// Reviewing proposed changes and past versions of a note. A bar at the top of the note says how
// many changes are waiting; the review drawer shows each one (old and new wording, why, the
// source) with Approve and Reject; the history drawer lists past versions with what changed
// and Restore. The work itself happens in the save API (src/lib/approve.ts).
import { useCallback, useEffect, useState } from "react";
import { api, type Collection } from "../content/store";
import { blocksToMarkdown, type Block, type PageDoc } from "../lib/blocks";
import type { HistoryEntry } from "../lib/cloud-docs";
import { changedHunks, diffLines } from "../lib/diff";
import { preview, type Proposal } from "../lib/proposals";

export function useProposals(collection: Collection, id: string) {
  const path = `/api/proposals/${collection}/${id}`;
  const [list, setList] = useState<Proposal[]>([]);
  const reload = useCallback(async () => {
    try {
      const { proposals } = (await api(path)) as { proposals: Proposal[] };
      setList((cur) => (JSON.stringify(cur) === JSON.stringify(proposals) ? cur : proposals));
    } catch {
      /* offline: keep what we have */
    }
  }, [path]);
  useEffect(() => {
    void reload();
    const t = window.setInterval(() => document.visibilityState === "visible" && void reload(), 60_000);
    window.addEventListener("focus", reload);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("focus", reload);
    };
  }, [reload]);
  const reject = async (proposalId: string) => {
    const { proposals } = (await api(path, { method: "POST", body: JSON.stringify({ op: "reject", proposalId }) })) as {
      proposals: Proposal[];
    };
    setList(proposals);
  };
  return { list, setList, reload, reject };
}

const KIND: Record<Proposal["kind"], string> = {
  edit: "Change wording",
  add: "New line",
  row: "New table row",
  check: "New open check",
};

function origin(p: Proposal): string {
  if (p.origin.startsWith("flag:")) return "From an AI flag Claude confirmed";
  if (p.origin.startsWith("feed:")) return "From the official-source feed";
  return "From Claude";
}

const day = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/** The bar at the top of a note when changes are waiting. */
export function ProposalsBar({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (!count) return null;
  return (
    <button type="button" className="proposals-bar" onClick={onOpen}>
      <span className="pb-icon" aria-hidden>
        ✎
      </span>
      <b>
        {count} {count === 1 ? "change" : "changes"} proposed
      </b>
      <span>Review</span>
    </button>
  );
}

function ProposalCard({
  p,
  blocks,
  section,
  onApprove,
  onReject,
  onShow,
}: {
  p: Proposal;
  blocks: Block[];
  section: string;
  onApprove: () => Promise<void>;
  onReject: () => Promise<void>;
  onShow: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { before, after } = preview(blocks, p);
  const act = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`proposal ${p.status}`}>
      <header>
        <span className="pr-kind">{KIND[p.kind]}</span>
        {section && (
          <button type="button" className="linkish pr-section" onClick={onShow}>
            {section} ↓
          </button>
        )}
        {p.status !== "pending" && <span className={`pr-status ${p.status}`}>{p.status}</span>}
      </header>
      <div className="pr-diff">
        {before && <del>{before}</del>}
        {after && <ins>{after}</ins>}
        {!after && p.kind === "edit" && <ins className="empty">(removed)</ins>}
      </div>
      <p className="pr-why">{p.reason}</p>
      <div className="pr-meta">
        <a className="pr-src" href={p.source.url} target="_blank" rel="noopener noreferrer" title={p.source.url}>
          {p.source.label} ↗
        </a>
        {p.source.date && <span>{day(p.source.date)}</span>}
        <span>{origin(p)}</span>
        {p.verification === "secondary" && <span className="pr-warn">Digest only: confirm in a primary source</span>}
      </div>
      {p.note && <p className="pr-note">{p.note}</p>}
      {error && <p className="error">{error}</p>}
      {p.status === "pending" && (
        <div className="pr-actions">
          <button type="button" className="pill-btn go small" disabled={busy} onClick={act(onApprove)}>
            ✓ Approve
          </button>
          <button type="button" className="chip-btn" disabled={busy} onClick={act(onReject)}>
            ✕ Reject
          </button>
        </div>
      )}
    </article>
  );
}

/** The review drawer: pending changes first, then what was decided. */
export function ReviewPanel({
  proposals,
  blocks,
  sectionOf,
  onApprove,
  onReject,
  onShow,
  onClose,
}: {
  proposals: Proposal[];
  blocks: Block[];
  sectionOf: (blockId: string) => string;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onShow: (blockId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"pending" | "done">("pending");
  const pending = proposals.filter((p) => p.status === "pending");
  const done = proposals.filter((p) => p.status !== "pending").reverse();
  const shown = tab === "pending" ? pending : done;
  return (
    <>
      <div className="sheet-scrim panel-scrim" onClick={onClose} />
      <aside className="comments-panel review-panel" aria-label="Proposed changes">
        <div className="panel-head">
          <b>Proposed changes</b>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "pending"} onClick={() => setTab("pending")}>
            To review <span className="n">{pending.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "done"} onClick={() => setTab("done")}>
            Decided <span className="n">{done.length}</span>
          </button>
        </div>
        <div className="panel-list">
          {shown.length === 0 && (
            <p className="empty">
              {tab === "pending"
                ? "Nothing to review. Claude proposes changes from flags and the official-source feed."
                : "Nothing decided yet."}
            </p>
          )}
          {shown.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              blocks={blocks}
              section={sectionOf(p.blockId)}
              onApprove={() => onApprove(p.id)}
              onReject={() => onReject(p.id)}
              onShow={() => onShow(p.blockId)}
            />
          ))}
        </div>
      </aside>
    </>
  );
}

const when = (ms: number) =>
  new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The history drawer: past versions, what each changed compared with now, and Restore. */
export function HistoryPanel({
  collection,
  id,
  current,
  onRestore,
  onClose,
}: {
  collection: Collection;
  id: string;
  current: Block[];
  onRestore: (historyId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<HistoryEntry[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [old, setOld] = useState<PageDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/api/history/${collection}/${id}`)
      .then((r) => setVersions((r as { versions: HistoryEntry[] }).versions))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [collection, id]);
  const show = async (h: HistoryEntry) => {
    if (open === h.id) return setOpen(null);
    setOpen(h.id);
    setOld(null);
    try {
      setOld((await api(`/api/history/${collection}/${id}/${h.id}`)) as PageDoc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const hunks = old ? changedHunks(diffLines(blocksToMarkdown(old.blocks ?? []), blocksToMarkdown(current))) : [];
  return (
    <>
      <div className="sheet-scrim panel-scrim" onClick={onClose} />
      <aside className="comments-panel history-panel" aria-label="Version history">
        <div className="panel-head">
          <b>Version history</b>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="panel-list">
          {error && <p className="error">{error}</p>}
          {!versions && !error && <p className="empty">Loading…</p>}
          {versions?.length === 0 && (
            <p className="empty">
              No past versions yet. One is kept every few minutes of editing and on every approval.
            </p>
          )}
          {versions?.map((h) => (
            <div key={h.id} className={`version${open === h.id ? " open" : ""}`}>
              <button type="button" className="version-head" onClick={() => void show(h)}>
                <b>v{h.version}</b>
                <span>{when(h.savedAt)}</span>
                {h.reason && <em>{h.reason}</em>}
              </button>
              {open === h.id && (
                <div className="version-body">
                  {!old ? (
                    <p className="empty">Loading…</p>
                  ) : hunks.length === 0 ? (
                    <p className="empty">Same text as now.</p>
                  ) : (
                    <div className="diff" aria-label="Changes since this version">
                      {hunks.map((l, k) =>
                        l === null ? (
                          <div key={k} className="d-fold">
                            ⋯
                          </div>
                        ) : (
                          <div key={k} className={`d-${l.kind}`}>
                            {l.kind === "added" ? "+ " : l.kind === "removed" ? "− " : "  "}
                            {l.text || " "}
                          </div>
                        ),
                      )}
                    </div>
                  )}
                  <p className="d-legend">− in v{h.version}, + now</p>
                  <button
                    type="button"
                    className="chip-btn"
                    disabled={busy || !old}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await onRestore(h.id);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : String(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Restore v{h.version}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
