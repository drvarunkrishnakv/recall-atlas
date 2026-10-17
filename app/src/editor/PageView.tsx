// One note or card as a Notion-like page: an editable title, the BlockNote editor with the
// Atlas blocks, autosave with a version check, comments, and backlinks. Used for full pages
// and inside the side peek.
import "@blocknote/mantine/style.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router";
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { CommentsExtension } from "@blocknote/core/comments";
import { BlockNoteView } from "@blocknote/mantine";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { schema, type AtlasEditor, type AtlasPartialBlock } from "./schema";
import {
  allPages,
  ConflictError,
  createPage,
  KIND_LABEL,
  linksTo,
  getPage,
  refreshPage,
  api,
  savePage,
  STATUS_LABEL,
  usePage,
  type Collection,
  type Page,
} from "../content/store";
import { locateNote } from "../content/syllabus";
import { headings, pageCites, type Block } from "../lib/blocks";
import { markRevised, noteOpened, setPageThreads, undoRevised, useStudy } from "../content/study";
import { dueLabel, nextDue, today } from "../lib/progress";
import { ConfidenceSelect } from "../dashboard";
import { Icon } from "../components/Icon";
import { AtlasThreadStore } from "../comments/threadStore";
import { anchorFor, attachMarks, changedAnchors, findAnchor, markRange } from "../comments/anchors";
import { CommentMargin, CommentsPanel, Composer, useStoredThreads } from "../comments/CommentsUI";
import type { Anchor, ThreadKind } from "../lib/threads";
import { openPeek } from "../components/peek";
import { useResolvedTheme } from "../components/ThemeToggle";
import { Discuss } from "../discuss/Discuss";
import { AI_IDS, AIS } from "../lib/personas";
import { HistoryPanel, ProposalsBar, ReviewPanel, useProposals } from "../proposals/Review";

const USERS = [
  { id: "me", username: "You", avatarUrl: "" },
  { id: "claude", username: "Claude", avatarUrl: "" },
  ...AI_IDS.map((id) => ({ id, username: AIS[id].name, avatarUrl: "" })),
];

const isNarrow = () => window.innerWidth < 1280;
const isPhone = () => window.innerWidth < 700;
const prefersReading = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;

function readEditPref(): boolean {
  try {
    const v = localStorage.getItem("atlas-editing");
    if (v === "on") return true;
    if (v === "off") return false;
  } catch {
    /* storage unavailable */
  }
  return !prefersReading();
}

function useWidth() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("resize", cb);
      return () => window.removeEventListener("resize", cb);
    },
    () => window.innerWidth,
  );
}

/** Counts web-font loads (fonts ready, then each later batch), so text can be re-measured. */
function useFontsLoaded() {
  const [loads, setLoads] = useState(0);
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts) return;
    let live = true;
    const bump = () => live && setLoads((n) => n + 1);
    void fonts.ready.then(bump);
    fonts.addEventListener("loadingdone", bump);
    return () => {
      live = false;
      fonts.removeEventListener("loadingdone", bump);
    };
  }, []);
  return loads;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "card";

function slashItems(editor: AtlasEditor): DefaultReactSuggestionItem[] {
  const media = new Set(["Image", "Video", "Audio", "File", "Emoji", "Page Break"]);
  const defaults = getDefaultReactSlashMenuItems(editor).filter((i) => !media.has(i.title));
  const atlas: DefaultReactSuggestionItem[] = [
    {
      title: "Chart",
      subtext: "Line, bar or timeline from a table of figures",
      aliases: ["graph", "evidence", "data"],
      group: "Atlas",
      icon: <span className="slash-ic">▁▃▆</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "chart" }),
    },
    {
      title: "Flowchart",
      subtext: "A process or chain of events (Mermaid)",
      aliases: ["mermaid", "diagram", "process", "flow"],
      group: "Atlas",
      icon: <span className="slash-ic">⇢</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "flowchart" }),
    },
    {
      title: "Prelims box",
      subtext: "Short facts: Articles, numbers, bodies",
      aliases: ["prelims", "facts", "box"],
      group: "Atlas",
      icon: <span className="slash-ic">P</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout", props: { tone: "prelims" } }),
    },
    {
      title: "Callout",
      subtext: "A highlighted note",
      aliases: ["note", "callout", "info"],
      group: "Atlas",
      icon: <span className="slash-ic">!</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout", props: { tone: "note" } }),
    },
    {
      title: "Cite a source",
      subtext: "A numbered source marker after the sentence",
      aliases: ["source", "cite", "citation", "reference"],
      group: "Atlas",
      icon: <span className="slash-ic">¹</span>,
      onItemClick: () => {
        const url = window.prompt("Source link (https://…)")?.trim();
        if (!url || !/^https?:\/\//.test(url)) return;
        const label = window.prompt("Short label, e.g. PRS, Gazette, SC judgment")?.trim() || new URL(url).hostname;
        editor.insertInlineContent([{ type: "cite", props: { label, url } }]);
      },
    },
    {
      title: "Link to card or note",
      subtext: "Type @ anywhere to link a concept card or note",
      aliases: ["link", "card", "mention", "@"],
      group: "Atlas",
      icon: <span className="slash-ic">@</span>,
      onItemClick: () => editor.insertInlineContent("@"),
    },
  ];
  return [...atlas, ...defaults];
}

const CARD_TEMPLATE: AtlasPartialBlock[] = [
  { type: "heading", props: { level: 3 }, content: "Key facts" },
  { type: "bulletListItem" },
  { type: "heading", props: { level: 3 }, content: "How to use it in Mains" },
  { type: "bulletListItem" },
  { type: "heading", props: { level: 3 }, content: "Sources" },
  { type: "bulletListItem" },
];

function mentionItems(editor: AtlasEditor, query: string, self: string): DefaultReactSuggestionItem[] {
  const q = query.toLowerCase();
  const insert = (kind: "card" | "note", id: string, label: string) =>
    editor.insertInlineContent([{ type: "term", props: { kind, id, label } }, " "]);
  const pages = allPages()
    .filter((p) => `${p.collection}:${p.id}` !== self && (p.title + " " + p.id).toLowerCase().includes(q))
    .slice(0, 12)
    .map((p): DefaultReactSuggestionItem => ({
      title: p.title,
      subtext: p.collection === "notes" ? `Note ${p.id}` : (KIND_LABEL[String(p.kind)] ?? "Card"),
      group: p.collection === "notes" ? "Notes" : "Concept cards",
      onItemClick: () => insert(p.collection === "notes" ? "note" : "card", p.id, p.title),
    }));
  if (query.trim().length > 1)
    pages.push({
      title: `New card “${query.trim()}”`,
      subtext: "Create a concept card and link it here",
      group: "Create",
      onItemClick: () => {
        const title = query.trim();
        let id = slug(title);
        while (getPage("cards", id)) id += "-2";
        insert("card", id, title);
        void createPage({
          collection: "cards",
          id,
          title,
          kind: "concept",
          summary: "",
          blocks: CARD_TEMPLATE as Block[],
        });
      },
    });
  return pages;
}

type SaveState = "saved" | "saving" | "error" | "conflict";

/** The page's citations, numbered in the same order as the markers in the text. */
function SourcesList({ blocks }: { blocks: Block[] }) {
  const cites = pageCites(blocks ?? []);
  if (!cites.length) return null;
  return (
    <details className="sources">
      <summary>Sources ({cites.length})</summary>
      <ol>
        {cites.map((c, i) => (
          <li key={i}>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {c.label}
            </a>{" "}
            <span className="muted">{c.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

export function PageView({ collection, id, inPeek = false }: { collection: Collection; id: string; inPeek?: boolean }) {
  const page = usePage(collection, id);
  if (!page) return null;
  return <PageEditor key={`${collection}:${id}`} page={page} inPeek={inPeek} />;
}

function PageEditor({ page: initial, inPeek }: { page: Page; inPeek: boolean }) {
  const theme = useResolvedTheme();
  const width = useWidth();
  const location = useLocation();
  const pageRef = useRef<Page>(initial);
  const [meta, setMeta] = useState({
    title: initial.title,
    summary: String(initial.summary ?? ""),
    status: String(initial.status ?? ""),
    kind: String(initial.kind ?? ""),
  });
  const [editing, setEditing] = useState(readEditPref);
  const [save, setSave] = useState<SaveState>("saved");
  const [composer, setComposer] = useState<null | {
    quote: string;
    anchor: Anchor;
    at: { top: number; left: number } | null;
  }>(null);
  const [bubble, setBubble] = useState<null | { top: number; left: number }>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [panel, setPanel] = useState(false);
  const [showMargin, setShowMargin] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const ready = useRef(false);
  const lastSaved = useRef(JSON.stringify(initial.blocks ?? []));
  const timer = useRef(0);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const fontsLoaded = useFontsLoaded();

  // Grow the title field to fit, only when the title, width or fonts change (resizing on
  // every render shifts the page and makes the browser jump the scroll position). The
  // heading font loads after the first paint, and a long title can wrap only once it has.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [meta.title, editing, width, fontsLoaded]);

  const store = useMemo(() => new AtlasThreadStore(initial.collection, initial.id), [initial.collection, initial.id]);
  const threads = useStoredThreads(store);
  const { progress } = useStudy();
  const [contents, setContents] = useState<null | { id: string; level: number; text: string }[]>(null);

  // Opening a note marks it read (starting its revision cycle) and lists it under Continue reading.
  // A study file is revised with its parent note, so it has no cycle of its own.
  const studyFile = !!initial.parent;
  useEffect(() => {
    if (initial.collection === "notes" && !inPeek && !studyFile) noteOpened(initial.id);
  }, [initial.collection, initial.id, inPeek, studyFile]);
  useEffect(
    () => setPageThreads(`${initial.collection}:${initial.id}`, threads),
    [threads, initial.collection, initial.id],
  );
  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: initial.blocks?.length ? (initial.blocks as AtlasPartialBlock[]) : undefined,
      extensions: [
        CommentsExtension({ threadStore: store, resolveUsers: async (ids) => USERS.filter((u) => ids.includes(u.id)) }),
      ],
      tables: { splitCells: true, cellBackgroundColor: false, cellTextColor: false, headers: true },
    },
    [store],
  );
  const comments = editor.getExtension(CommentsExtension);
  // Compare against the editor's normalised blocks, so opening a page doesn't save it.
  useEffect(() => {
    lastSaved.current = JSON.stringify(editor.document);
  }, [editor]);

  // ---- saving ----
  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const blocks = editor.document as unknown as Block[];
    const json = JSON.stringify(blocks);
    const p = pageRef.current;
    const metaChanged =
      meta.title !== p.title ||
      (p.collection === "cards" && (meta.summary !== String(p.summary ?? "") || meta.kind !== String(p.kind ?? ""))) ||
      (p.collection === "notes" && meta.status !== String(p.status ?? ""));
    if (json === lastSaved.current && !metaChanged) return;
    setSave("saving");
    try {
      const next: Page = { ...p, title: meta.title.trim() || p.title };
      if (p.collection === "cards") Object.assign(next, { summary: meta.summary, kind: meta.kind });
      else Object.assign(next, { status: meta.status });
      pageRef.current = await savePage(next, blocks);
      lastSaved.current = json;
      setSave("saved");
      if (ready.current) {
        const moved = changedAnchors(editor, store.stored);
        if (Object.keys(moved).length) await store.syncAnchors(moved);
      }
    } catch (e) {
      setSave(e instanceof ConflictError ? "conflict" : "error");
    }
  }, [editor, meta, store]);

  const schedule = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 900);
  }, [flush]);

  useEffect(() => {
    if (
      meta.title !== pageRef.current.title ||
      meta.summary !== String(pageRef.current.summary ?? "") ||
      meta.status !== String(pageRef.current.status ?? "") ||
      meta.kind !== String(pageRef.current.kind ?? "")
    )
      schedule();
  }, [meta, schedule]);

  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && void flush();
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      void flush();
    };
  }, [flush]);

  // ---- comments: load threads, restore highlights, poll for Claude's replies ----
  useEffect(() => {
    let alive = true;
    const sync = async () => {
      try {
        // Pick up edits made outside the app (Claude's CLI) when nothing here is unsaved.
        const p = pageRef.current;
        if (ready.current && JSON.stringify(editor.document) === lastSaved.current) {
          const fresh = await refreshPage(p.collection, p.id);
          if (fresh && alive) {
            pageRef.current = fresh;
            editor.replaceBlocks(editor.document, fresh.blocks as AtlasPartialBlock[]);
            lastSaved.current = JSON.stringify(editor.document);
            setMeta({
              title: fresh.title,
              summary: String(fresh.summary ?? ""),
              status: String(fresh.status ?? ""),
              kind: String(fresh.kind ?? ""),
            });
          }
        }
        await store.load();
        if (!alive) return;
        attachMarks(editor, store.stored);
        if (!ready.current) {
          ready.current = true;
          const moved = changedAnchors(editor, store.stored);
          if (Object.keys(moved).length) await store.syncAnchors(moved);
        }
      } catch {
        /* offline or server stopped: keep what we have */
      }
    };
    void sync();
    const poll = window.setInterval(() => document.visibilityState === "visible" && void sync(), 30_000);
    window.addEventListener("focus", sync);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", sync);
    };
  }, [editor, store]);

  // Sticky notes and Claude threads get their own highlight colour.
  const markCss = threads
    .filter((t) => t.kind !== "comment")
    .map((t) => `.bn-thread-mark[data-bn-thread-id="${t.id}"]:not([data-orphan]){background:var(--mark-${t.kind})}`)
    .join("\n");

  // Clicking highlighted text selects its thread (BlockNote tracks this in its store).
  useEffect(() => {
    if (!comments) return;
    return comments.store.subscribe(() => {
      const s = comments.store.state;
      if (s.pendingComment) {
        comments.stopPendingComment();
        openComposer();
      }
      if (s.selectedThreadId && s.selectedThreadId !== selectedId) {
        setSelectedId(s.selectedThreadId);
        if (isNarrow() || inPeek || !showMargin) setPanel(true);
      }
    });
  });

  const select = (tid: string | undefined) => {
    setSelectedId(tid);
    comments?.selectThread(tid, true);
  };

  const openComposer = () => {
    const view = editor.prosemirrorView;
    if (!view) return;
    // While reading, the editor isn't editable, so take the range from the browser selection.
    let { from, to } = view.state.selection;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && view.dom.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      try {
        from = view.posAtDOM(range.startContainer, range.startOffset);
        to = view.posAtDOM(range.endContainer, range.endOffset);
      } catch {
        /* fall back to the editor's selection */
      }
    }
    if (from === to) return;
    const r = anchorFor(view.state.doc, from, to);
    if (!r) return;
    const c = view.coordsAtPos(r.to);
    const left = Math.min(Math.max(16, c.left - 140), window.innerWidth - 356);
    setBubble(null);
    setComposer({
      quote: r.anchor.quote,
      anchor: r.anchor,
      at: isPhone() ? null : { top: c.bottom + window.scrollY + 10, left },
    });
  };

  // A bot's point sent from a discussion becomes an "Ask Claude" thread on its passage.
  const pinToClaude = async (anchor: Anchor | null, text: string) => {
    const first = headings(editor.document as unknown as Block[]).find((h) => h.text);
    const a = anchor ?? (first ? { blockId: first.id, quote: first.text } : null);
    if (!a) throw new Error("This note has no heading to attach the point to");
    const tid = await store.create("claude", a, text);
    const r = findAnchor(editor.prosemirrorView!.state.doc, a);
    if (r) markRange(editor, tid, r.from, r.to);
  };

  const submitComment = async (kind: ThreadKind, text: string) => {
    if (!composer) return;
    const tid = await store.create(kind, composer.anchor, text);
    const r = findAnchor(editor.prosemirrorView!.state.doc, composer.anchor);
    if (r) markRange(editor, tid, r.from, r.to);
    setComposer(null);
    window.getSelection()?.removeAllRanges();
    select(tid);
    if (isNarrow() || inPeek) setPanel(true);
  };

  // While reading (not editing), selecting text shows a small "Comment" button — unless
  // BlockNote shows its own toolbar with "Add comment" (it does on touch devices).
  useEffect(() => {
    if (editing) return setBubble(null);
    let t = 0;
    const onSel = () => {
      window.clearTimeout(t);
      const sel = window.getSelection();
      const el = rootRef.current;
      if (!sel || sel.isCollapsed || !el || !sel.anchorNode || !el.contains(sel.anchorNode)) return setBubble(null);
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      t = window.setTimeout(() => {
        if (document.querySelector('.bn-formatting-toolbar [data-test="addcomment"]')) return setBubble(null);
        setBubble({
          top: rect.bottom + window.scrollY + 8,
          left: Math.min(rect.left + window.scrollX, window.innerWidth - 130),
        });
      }, 120);
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("selectionchange", onSel);
    };
  }, [editing]);

  // Opened from search: scroll to the matching block.
  useEffect(() => {
    const block = (location.state as { block?: string } | null)?.block;
    if (!block || inPeek) return;
    const t = window.setTimeout(() => {
      const el = rootRef.current?.querySelector(`[data-id="${block}"]`);
      el?.scrollIntoView({ block: "center" });
      el?.classList.add("flash");
      window.setTimeout(() => el?.classList.remove("flash"), 1600);
    }, 60);
    return () => window.clearTimeout(t);
  }, [location.state, inPeek]);

  // ---- proposed changes and version history ----
  const proposals = useProposals(initial.collection, initial.id);
  const pendingProposals = proposals.list.filter((x) => x.status === "pending");
  const [review, setReview] = useState(() => new URLSearchParams(location.search).has("review"));
  const [history, setHistory] = useState(false);

  /** Puts a version saved by the API (approval, restore) into the editor. */
  const takeServerVersion = async () => {
    const pg = pageRef.current;
    const fresh = await refreshPage(pg.collection, pg.id);
    if (!fresh) return;
    pageRef.current = fresh;
    editor.replaceBlocks(editor.document, fresh.blocks as AtlasPartialBlock[]);
    lastSaved.current = JSON.stringify(editor.document);
    await store.load();
    attachMarks(editor, store.stored);
  };
  const approve = async (proposalId: string) => {
    await flush();
    const pg = pageRef.current;
    const r = (await api(`/api/proposals/${pg.collection}/${pg.id}`, {
      method: "POST",
      body: JSON.stringify({ op: "approve", proposalId }),
    }).catch(async (e: unknown) => {
      await proposals.reload(); // it may have gone stale
      throw e;
    })) as { proposals: typeof proposals.list };
    proposals.setList(r.proposals);
    await takeServerVersion();
  };
  const restore = async (historyId: string) => {
    await flush();
    const pg = pageRef.current;
    await api(`/api/history/${pg.collection}/${pg.id}`, { method: "POST", body: JSON.stringify({ historyId }) });
    await takeServerVersion();
    setHistory(false);
  };
  /** The heading a block sits under, for the review card. */
  const sectionOf = (blockId: string) => {
    let last = "";
    let found = "";
    const walk = (bs: Block[]) => {
      for (const b of bs) {
        if (found) return;
        if (b.type === "heading") last = headings([b])[0]?.text ?? last;
        if (b.id === blockId) found = last || "Top of the note";
        if (b.children) walk(b.children);
      }
    };
    walk(editor.document as unknown as Block[]);
    return found;
  };
  const showBlock = (blockId: string) => {
    if (width < 1280) setReview(false);
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-id="${blockId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.classList.add("flash");
    window.setTimeout(() => el?.classList.remove("flash"), 1600);
  };
  // Blocks with a pending change get a dashed outline in the text.
  const proposalCss = pendingProposals
    .map(
      (x) =>
        `.bn-block-outer[data-id="${x.blockId}"]>.bn-block>.bn-block-content{outline:2px dashed var(--accent);outline-offset:3px;border-radius:6px}`,
    )
    .join("\n");

  const toggleEditing = () => {
    const next = !editing;
    setEditing(next);
    try {
      localStorage.setItem("atlas-editing", next ? "on" : "off");
    } catch {
      /* storage unavailable */
    }
  };

  const p = pageRef.current;
  const loc = p.collection === "notes" ? locateNote(p.id, p.parent) : null;
  const self = `${p.collection}:${p.id}`;
  const open = threads.filter((t) => !t.resolved).length;
  const wide = width >= 1280 && !inPeek && showMargin;
  const backlinks = linksTo(p.collection === "notes" ? "note" : "card", p.id);

  return (
    <article className={`page doc${wide && threads.some((t) => !t.resolved && !t.detached) ? " with-margin" : ""}`}>
      {markCss && <style>{markCss}</style>}
      {proposalCss && <style>{proposalCss}</style>}
      <div className="doc-bar">
        <div className="meta">
          {p.collection === "notes" ? (
            <>
              {editing ? (
                <select
                  className="pill select"
                  value={meta.status}
                  aria-label="Status"
                  onChange={(e) => setMeta((m) => ({ ...m, status: e.target.value }))}
                >
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={`pill ${meta.status === "live" ? "live" : meta.status === "in-review" ? "review" : ""}`}
                >
                  {STATUS_LABEL[meta.status] ?? meta.status}
                </span>
              )}
              {loc && (
                <span className="pill">
                  {loc.paper.title.replace("GS Paper ", "GS")} · {loc.subject.title} · {loc.topic.n}
                </span>
              )}
              {p.pyqs ? <span className="pill">{String(p.pyqs)} Mains PYQs</span> : null}
            </>
          ) : editing ? (
            <select
              className="pill select"
              value={meta.kind}
              aria-label="Card kind"
              onChange={(e) => setMeta((m) => ({ ...m, kind: e.target.value }))}
            >
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <span className="pill">Concept card · {KIND_LABEL[meta.kind] ?? meta.kind}</span>
          )}
          <span className="pill">Updated {p.updated || "today"}</span>
        </div>
        <div className="doc-actions">
          <div className="contents-wrap">
            <button
              type="button"
              className={`chip-btn${contents ? " on" : ""}`}
              aria-expanded={!!contents}
              onClick={() =>
                setContents((c) =>
                  c ? null : headings(editor.document as unknown as Block[]).filter((h) => h.level <= 2 && h.text),
                )
              }
            >
              <Icon name="list" />
              Contents
            </button>
            {contents && (
              <div className="contents-menu" role="menu">
                {contents.length === 0 && <span className="muted">No headings yet</span>}
                {contents.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setContents(null);
                      rootRef.current
                        ?.querySelector(`[data-id="${h.id}"]`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {h.text}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className={`save-state ${save}`} aria-live="polite">
            {save === "saving"
              ? "Saving…"
              : save === "error"
                ? "Not saved — retrying"
                : save === "conflict"
                  ? ""
                  : editing
                    ? "Saved"
                    : ""}
          </span>
          {p.collection === "notes" && !inPeek && (
            <Discuss
              collection={p.collection}
              id={p.id}
              title={meta.title}
              editor={editor}
              root={root}
              onPin={pinToClaude}
            />
          )}
          <button
            type="button"
            className={`chip-btn${panel ? " on" : ""}`}
            aria-pressed={panel}
            onClick={() => (width >= 1280 && !inPeek ? setShowMargin((v) => !v) : setPanel((v) => !v))}
          >
            💬 {open}
          </button>
          {!inPeek && (
            <button
              type="button"
              className={`chip-btn${history ? " on" : ""}`}
              aria-pressed={history}
              aria-label="History"
              onClick={() => setHistory((v) => !v)}
            >
              <Icon name="history" />
              <span className="wide-only">History</span>
            </button>
          )}
          <button
            type="button"
            className={`chip-btn${editing ? " on" : ""}`}
            aria-pressed={editing}
            onClick={toggleEditing}
          >
            {editing ? "Editing" : "Reading"}
          </button>
        </div>
      </div>

      {!inPeek && <ProposalsBar count={pendingProposals.length} onOpen={() => setReview(true)} />}

      {p.collection === "notes" && !studyFile && (
        <div className="study-bar">
          {(() => {
            const np = progress.notes[p.id];
            const due = nextDue(np);
            const revisedToday = np?.revisions.at(-1) === today();
            return (
              <>
                <span className="study-state">
                  {np?.revisions.length ? `Revised ${np.revisions.length}×` : np?.readAt ? "Read once" : "Not read yet"}
                  {due && <> · next due {dueLabel(due)}</>}
                </span>
                <ConfidenceSelect noteId={p.id} value={np?.confidence} />
                {revisedToday ? (
                  <button type="button" className="pill-btn small" onClick={() => void undoRevised(p.id)}>
                    Revised today · undo
                  </button>
                ) : (
                  <button type="button" className="pill-btn go small" onClick={() => void markRevised(p.id)}>
                    <Icon name="check" />
                    Mark revised
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

      {save === "conflict" && (
        <div className="banner">
          This page was changed somewhere else, so your last edit wasn't saved.{" "}
          <button type="button" className="chip-btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )}

      {editing ? (
        <textarea
          className="title-input"
          value={meta.title}
          rows={1}
          aria-label="Title"
          onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value.replace(/\n/g, " ") }))}
          ref={titleRef}
        />
      ) : (
        <h1>{meta.title}</h1>
      )}
      {p.collection === "cards" &&
        (editing ? (
          <textarea
            className="summary-input"
            value={meta.summary}
            placeholder="One-line summary (shown when you hover the term)"
            rows={2}
            aria-label="Summary"
            onChange={(e) => setMeta((m) => ({ ...m, summary: e.target.value }))}
          />
        ) : (
          meta.summary && <p className="summary">{meta.summary}</p>
        ))}

      <div
        className="doc-body"
        ref={(el) => {
          rootRef.current = el;
          if (el !== root) setRoot(el);
        }}
      >
        <BlockNoteView
          editor={editor}
          editable={editing}
          theme={theme}
          slashMenu={false}
          comments={false}
          onChange={schedule}
          className="atlas-editor"
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (q) => filterSuggestionItems(slashItems(editor), q)}
          />
          <SuggestionMenuController triggerCharacter="@" getItems={async (q) => mentionItems(editor, q, self)} />
        </BlockNoteView>
        {wide && (
          <CommentMargin threads={threads} store={store} selectedId={selectedId} onSelect={select} root={root} />
        )}
      </div>

      <SourcesList blocks={pageRef.current.blocks} />

      {backlinks.length > 0 && (
        <section className="backlinks">
          <h3>{p.collection === "cards" ? "Cited in" : "Linked from"}</h3>
          <ul>
            {backlinks.map((b) => (
              <li key={`${b.collection}:${b.id}`}>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => openPeek(b.collection === "notes" ? "note" : "card", b.id)}
                >
                  {getPage(b.collection, b.id)?.title ?? b.id}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {bubble &&
        !composer &&
        createPortal(
          <button
            type="button"
            className="comment-bubble"
            style={{ top: bubble.top, left: bubble.left }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={openComposer}
          >
            💬 Comment
          </button>,
          document.body,
        )}
      {composer &&
        createPortal(
          <Composer
            quote={composer.quote}
            at={composer.at}
            onSubmit={submitComment}
            onCancel={() => setComposer(null)}
          />,
          document.body,
        )}
      {review &&
        createPortal(
          <ReviewPanel
            proposals={proposals.list}
            blocks={editor.document as unknown as Block[]}
            sectionOf={sectionOf}
            onApprove={approve}
            onReject={proposals.reject}
            onShow={showBlock}
            onClose={() => setReview(false)}
          />,
          document.body,
        )}
      {history &&
        createPortal(
          <HistoryPanel
            collection={p.collection}
            id={p.id}
            current={editor.document as unknown as Block[]}
            onRestore={restore}
            onClose={() => setHistory(false)}
          />,
          document.body,
        )}
      {panel &&
        createPortal(
          <CommentsPanel
            threads={threads}
            store={store}
            selectedId={selectedId}
            onSelect={select}
            onClose={() => setPanel(false)}
          />,
          document.body,
        )}
    </article>
  );
}
