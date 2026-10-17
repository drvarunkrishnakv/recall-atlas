// Discussions on a note, stored in `content/discussions/<collection>-<id>.json`: debates,
// roundtables and devil's-advocate rounds between Claude and other AIs' bots. Claude writes
// most of them in advance, chosen to deepen the note; you can add your own. Turns arrive on a
// timer (Claude's scheduled task, other AIs' routines through the Atlas MCP server), and
// every discussion ends with Claude's conclusion. Shared by the dev save API, the MCP server,
// the app and the Claude CLI.
import { blocksToMarkdown, type Block } from "./blocks.ts";
import type { Anchor } from "./threads.ts";
import { bot, isAi, MODE_INFO, role, speaker, type AiId, type Mode, type Seat } from "./personas.ts";

export interface Source {
  label: string;
  url: string;
}

export interface Turn {
  id: string;
  /** The seat's role, or "you" for your own turns. */
  role: string;
  /** "claude", a bot id, or "me". */
  by: string;
  /** For a bot's turn: the AI that wrote it. */
  ai?: AiId;
  body: string;
  sources: Source[];
  round?: number;
  createdAt: string;
}

export interface Discussion {
  id: string;
  mode: Mode;
  /** The motion, the question for the experts, or the claim under attack. */
  topic: string;
  /** Why this question helps with the topic, in one line. */
  why?: string;
  /** The passage it is about: a sentence or a section heading. */
  anchor: Anchor | null;
  section?: string;
  /** Speaking order. Roundtable: the moderator first, then the experts. */
  seats: Seat[];
  status: "open" | "closed";
  turns: Turn[];
  conclusion?: { body: string; sources: Source[]; createdAt: string };
  vote?: "for" | "against" | "draw";
  createdAt: string;
  updatedAt: string;
}

export type DiscussionOp =
  | {
      op: "create";
      discussion: {
        id: string;
        mode: Mode;
        topic: string;
        why?: string;
        anchor: Anchor | null;
        section?: string;
        seats: Seat[];
      };
    }
  | {
      op: "turn";
      discussionId: string;
      turn: { id: string; by: string; ai?: AiId; body: string; sources?: Source[] };
    }
  | { op: "conclude"; discussionId: string; body: string; sources?: Source[] }
  | { op: "vote"; discussionId: string; vote: "for" | "against" | "draw" | null }
  | { op: "close"; discussionId: string }
  | { op: "reopen"; discussionId: string }
  | { op: "delete"; discussionId: string };

export class DiscussionOpError extends Error {}

export const ROUND_NAMES: Record<Mode, string[]> = {
  debate: ["Opening", "Rebuttal", "Closing"],
  roundtable: ["Each expert's view", "Answering each other"],
  devil: ["Attack and defence", "Second attack", "Last word"],
};
/** Word limit per turn. */
export const WORDS: Record<Mode, number> = { debate: 170, roundtable: 140, devil: 130 };
const ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,80}$/;
const MAX_BODY = 2500;

export interface Slot {
  seat: Seat;
  round: number;
  roundName: string;
  kind: "opening" | "turn" | "conclusion";
}

/** Every turn in speaking order, not counting your own or the conclusion. */
export function schedule(d: Pick<Discussion, "mode" | "seats">): Slot[] {
  const out: Slot[] = [];
  const rounds = ROUND_NAMES[d.mode];
  if (d.mode === "roundtable") {
    out.push({ seat: d.seats[0], round: 0, roundName: "Opening", kind: "opening" });
    rounds.forEach((name, r) =>
      d.seats.slice(1).forEach((seat) => out.push({ seat, round: r + 1, roundName: name, kind: "turn" })),
    );
  } else {
    rounds.forEach((name, r) =>
      d.seats.forEach((seat) => out.push({ seat, round: r + 1, roundName: name, kind: "turn" })),
    );
  }
  return out;
}

/** Who speaks next, then Claude's conclusion; null once concluded or closed. */
export function nextUp(d: Discussion): Slot | null {
  if (d.status === "closed" || d.conclusion) return null;
  const done = d.turns.filter((t) => t.by !== "me").length;
  const plan = schedule(d);
  if (done < plan.length) return plan[done];
  return { seat: { role: "moderator", by: "claude" }, round: 0, roundName: "Conclusion", kind: "conclusion" };
}

/** Turns spoken so far out of all of them (the conclusion counts as one). */
export const progress = (d: Discussion) => ({
  done: d.turns.filter((t) => t.by !== "me").length + (d.conclusion ? 1 : 0),
  total: schedule(d).length + 1,
});

function cleanSources(list: unknown, required: boolean): Source[] {
  const arr = Array.isArray(list) ? list : [];
  const out: Source[] = [];
  for (const s of arr.slice(0, 6)) {
    const label = String((s as Source)?.label ?? "")
      .trim()
      .slice(0, 80);
    const url = String((s as Source)?.url ?? "").trim();
    let ok = false;
    try {
      ok = /^https?:$/.test(new URL(url).protocol);
    } catch {
      ok = false;
    }
    if (!label || !ok)
      throw new DiscussionOpError(`Bad source: give a short label and an http(s) link (${url || label})`);
    out.push({ label, url });
  }
  if (required && out.length === 0)
    throw new DiscussionOpError("Add at least one source (label and link) for the facts in this turn");
  return out;
}

function cleanBody(b: unknown, min = 1): string {
  const text = String(b ?? "").trim();
  if (text.length < min) throw new DiscussionOpError("Empty turn");
  if (text.length > MAX_BODY) throw new DiscussionOpError(`Too long: keep it under ${MAX_BODY} characters`);
  return text;
}

function checkSeats(mode: Mode, seats: Seat[]) {
  if (!Array.isArray(seats) || seats.length === 0) throw new DiscussionOpError("Bad seats");
  for (const s of seats) {
    const r = role(s?.role);
    if (!r || !r.modes.includes(mode))
      throw new DiscussionOpError(`${s?.role} isn't a role in a ${MODE_INFO[mode].title}`);
    if (s.by !== "claude" && !bot(s.by)?.roles.includes(s.role))
      throw new DiscussionOpError(`${s.by} can't play ${r.label}`);
    if (s.ai !== undefined && (s.by === "claude" || !isAi(s.ai))) throw new DiscussionOpError(`Bad AI for ${r.label}`);
  }
  const roles = seats.map((s) => s.role);
  const ok =
    mode === "debate"
      ? roles.join() === "proposer,opposer"
      : mode === "devil"
        ? roles.join() === "devil,defender"
        : roles[0] === "moderator" &&
          seats[0].by === "claude" &&
          seats.length >= 3 &&
          seats.length <= 6 &&
          new Set(roles.slice(1)).size === roles.length - 1 &&
          !roles.slice(1).includes("moderator");
  if (!ok)
    throw new DiscussionOpError(
      mode === "debate"
        ? "A debate has a proposer then an opposer"
        : mode === "devil"
          ? "A devil's advocate round has the devil then the defender"
          : "A roundtable has Claude moderating, then two to five different experts",
    );
}

/** Applies one operation and returns the new list. Throws DiscussionOpError for a bad op. */
export function applyDiscussionOp(list: Discussion[], op: DiscussionOp, now = new Date().toISOString()): Discussion[] {
  const find = (id: string) => {
    const d = list.find((x) => x.id === id);
    if (!d) throw new DiscussionOpError(`No discussion ${id}`);
    return d;
  };
  const update = (id: string, fn: (d: Discussion) => Discussion) =>
    list.map((d) => (d.id === id ? { ...fn(d), updatedAt: now } : d));

  switch (op.op) {
    case "create": {
      const { id, mode, topic, why, anchor, section, seats } = op.discussion;
      if (!ID.test(id) || list.some((d) => d.id === id)) throw new DiscussionOpError("Bad or duplicate id");
      if (!(mode in MODE_INFO)) throw new DiscussionOpError("Bad mode");
      checkSeats(mode, seats);
      const t = String(topic ?? "").trim();
      if (t.length < 3 || t.length > 600) throw new DiscussionOpError("Give a topic of 3–600 characters");
      const d: Discussion = {
        id,
        mode,
        topic: t,
        ...(why ? { why: String(why).trim().slice(0, 300) } : {}),
        anchor: anchor ?? null,
        ...(section ? { section: String(section).slice(0, 200) } : {}),
        seats: seats.map((s) => ({ role: s.role, by: s.by, ...(s.ai ? { ai: s.ai } : {}) })),
        status: "open",
        turns: [],
        createdAt: now,
        updatedAt: now,
      };
      return [...list, d];
    }
    case "turn": {
      const d = find(op.discussionId);
      const { id, by } = op.turn;
      if (!ID.test(id) || d.turns.some((t) => t.id === id)) throw new DiscussionOpError("Bad or duplicate turn id");
      if (d.status === "closed") throw new DiscussionOpError("This discussion is closed");
      if (by === "me") {
        const turn: Turn = {
          id,
          role: "you",
          by: "me",
          body: cleanBody(op.turn.body),
          sources: cleanSources(op.turn.sources, false),
          createdAt: now,
        };
        return update(d.id, (x) => ({ ...x, turns: [...x.turns, turn] }));
      }
      const up = nextUp(d);
      if (!up) throw new DiscussionOpError("This discussion is finished");
      if (up.kind === "conclusion") throw new DiscussionOpError("All turns are in; only Claude's conclusion is left");
      if (up.seat.by !== by)
        throw new DiscussionOpError(`It's ${speaker(up.seat)}'s turn (${up.seat.by}), not ${by}'s`);
      const ai = op.turn.ai;
      if (by !== "claude" && !isAi(ai)) throw new DiscussionOpError("A bot's turn needs the AI that wrote it");
      if (up.seat.ai && ai !== up.seat.ai)
        throw new DiscussionOpError(`This seat is ${speaker(up.seat)}'s; ${ai} can't take it`);
      const turn: Turn = {
        id,
        role: up.seat.role,
        by,
        ...(by !== "claude" ? { ai } : {}),
        body: cleanBody(op.turn.body, 20),
        sources: cleanSources(op.turn.sources, up.kind === "turn"),
        round: up.round,
        createdAt: now,
      };
      return update(d.id, (x) => ({ ...x, turns: [...x.turns, turn] }));
    }
    case "conclude": {
      const d = find(op.discussionId);
      if (nextUp(d)?.kind !== "conclusion") throw new DiscussionOpError("Not every turn is in yet");
      return update(d.id, (x) => ({
        ...x,
        conclusion: { body: cleanBody(op.body, 20), sources: cleanSources(op.sources, false), createdAt: now },
      }));
    }
    case "vote":
      find(op.discussionId);
      if (op.vote !== null && !["for", "against", "draw"].includes(op.vote)) throw new DiscussionOpError("Bad vote");
      return update(op.discussionId, (d) => {
        const { vote: _, ...rest } = d;
        return op.vote ? { ...rest, vote: op.vote } : rest;
      });
    case "close":
      find(op.discussionId);
      return update(op.discussionId, (d) => ({ ...d, status: "closed" }));
    case "reopen":
      find(op.discussionId);
      return update(op.discussionId, (d) => ({ ...d, status: "open" }));
    case "delete":
      find(op.discussionId);
      return list.filter((d) => d.id !== op.discussionId);
  }
}

const RULES = (words: number) =>
  `Write at most ${words} words, in plain teaching prose a UPSC Mains candidate could reuse. ` +
  "One idea per sentence. Name who holds a view. Never present an opinion as a court's holding. " +
  "Don't put source names inside sentences; list every source you rely on in `sources` (label and link). " +
  'Don\'t repeat a point someone already made. Speak to the others by their role ("the economist").';

/** What whoever is next should write, in plain words. */
export function turnTask(d: Discussion): string {
  const up = nextUp(d);
  if (!up) return "Nothing to do: the discussion is concluded or closed.";
  const me = speaker(up.seat);
  const last = [...d.turns].reverse().find((t) => t.by !== "me" && t.role !== up.seat.role);
  const lastName = last ? speaker(last) : "the other side";
  const yours = d.turns.filter((t) => t.by === "me").at(-1);
  const userBit = yours ? ` The user also said: "${yours.body.slice(0, 300)}". Take it into account.` : "";
  let task: string;
  if (up.kind === "conclusion") {
    task =
      "Write the conclusion for the user, in 150–220 words. Say what each side or expert got right, " +
      "where the evidence points, and a balanced view the user can write in a Mains answer. " +
      "End with one line on how this links to the note.";
    return `You are ${me}. ${task}`;
  }
  if (d.mode === "debate") {
    const side = up.seat.role === "proposer" ? "FOR" : "AGAINST";
    task =
      up.round === 1
        ? `Opening speech ${side} the motion. Give your two or three strongest arguments, from different dimensions.`
        : up.round === 2
          ? `Rebuttal, arguing ${side}. Answer ${lastName}'s points directly, then add one new argument.`
          : `Closing speech ${side}. Say why your side is stronger, in three short points.`;
  } else if (d.mode === "roundtable") {
    task =
      up.kind === "opening"
        ? "Open the roundtable in 60–90 words: frame the question, say why it matters for the topic, and name the dimensions you want the experts to cover. No sources needed."
        : up.round === 1
          ? `Give your view as the ${role(up.seat.role)?.label.toLowerCase()}. Bring the dimension only your field sees.`
          : "Respond to the other experts: agree or push back on one named expert's point, then end with what you'd do.";
  } else {
    task =
      up.seat.role === "devil"
        ? up.round === 1
          ? "Attack the claim. Find its weakest assumption and argue the opposite, with evidence."
          : `Answer the defender's reply. Press on what it didn't answer, or concede the point honestly and attack a different one.`
        : `Defend the claim against the devil's attack. Concede what is fair, then show with evidence why the note's claim still stands, or how it should be sharpened.`;
  }
  return `You are ${me}. ${up.roundName}: ${task}${userBit} ${RULES(WORDS[d.mode])}`;
}

const contains = (b: Block, id: string): boolean => b.id === id || (b.children ?? []).some((c) => contains(c, id));
const level = (b: Block) => Number((b.props as { level?: number } | undefined)?.level ?? 1);

/** The section a discussion is about: from the heading above its anchor to the next heading
 *  of the same or higher level. Without a heading, a few blocks either side. */
export function sectionBlocks(blocks: Block[], blockId: string | undefined): Block[] {
  const i = blockId ? blocks.findIndex((b) => contains(b, blockId)) : -1;
  if (i < 0) return [];
  let j = i;
  while (j >= 0 && blocks[j].type !== "heading") j--;
  if (j < 0) return blocks.slice(Math.max(0, i - 3), i + 6);
  let k = j + 1;
  while (k < blocks.length && !(blocks[k].type === "heading" && level(blocks[k]) <= level(blocks[j]))) k++;
  return blocks.slice(j, k);
}

const who = (t: Pick<Turn, "role" | "by" | "ai">) => (t.by === "me" ? "The user" : speaker(t));

/** Everything a speaker needs to take their turn: topic, seats, turns so far, the note's
 *  section, and the task if it's theirs. Used by the MCP server and the Claude CLI. */
export function briefing(
  d: Discussion,
  page: { title: string; blocks: Block[] } | null,
  ref: string,
  forBy: string,
): string {
  const up = nextUp(d);
  const section = page ? blocksToMarkdown(sectionBlocks(page.blocks, d.anchor?.blockId)).slice(0, 8000) : "";
  const lines = [
    `# ${MODE_INFO[d.mode].title} on "${page?.title ?? ref}" (${ref})`,
    `Discussion id: ${d.id} · status: ${d.status}`,
    `Topic: ${d.topic}`,
    d.why ? `Why it matters: ${d.why}` : "",
    d.anchor?.quote ? `Passage: "${d.anchor.quote.slice(0, 600)}"` : "",
    `Seats, in speaking order: ${d.seats.map((s) => `${speaker(s)}${s.by === "claude" ? "" : ` [${s.by}]`}`).join("; ")}`,
    up
      ? up.seat.by === forBy
        ? `\n## YOUR TURN (${speaker(up.seat)})\n${turnTask(d)}`
        : `\nNext: ${speaker(up.seat)}${up.kind === "conclusion" ? " (conclusion)" : ""}. It is not your turn.`
      : "\nConcluded.",
    "\n## Turns so far",
    ...(d.turns.length
      ? d.turns.map(
          (t) =>
            `- ${who(t)}${t.round ? ` · round ${t.round}` : ""}: ${t.body}` +
            (t.sources.length ? `\n  Sources: ${t.sources.map((s) => `${s.label} <${s.url}>`).join("; ")}` : ""),
        )
      : ["(none yet)"]),
    section ? `\n## The section of the note it's about\n${section}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
