// Who speaks in a discussion. Two AIs take part: Claude, and Grok through Grok Bot. Each
// Grok Bot bot is one of GROK_BOTS (created from the prompts in docs/AGENT_PERSONAS.md) and
// passes its id as `persona` on every Atlas tool call. A seat pairs a role (for the motion,
// economist, devil's advocate…) with who fills it.

export type Mode = "debate" | "roundtable" | "devil";

export interface Role {
  id: string;
  label: string;
  emoji: string;
  modes: Mode[];
}

export const ROLES: Role[] = [
  { id: "proposer", label: "For the motion", emoji: "👍", modes: ["debate"] },
  { id: "opposer", label: "Against the motion", emoji: "👎", modes: ["debate"] },
  { id: "devil", label: "Devil's advocate", emoji: "😈", modes: ["devil"] },
  { id: "defender", label: "Defends the note", emoji: "🛡️", modes: ["devil"] },
  { id: "moderator", label: "Moderator", emoji: "🎙️", modes: ["roundtable"] },
  { id: "lawyer", label: "Constitutional lawyer", emoji: "⚖️", modes: ["roundtable"] },
  { id: "economist", label: "Economist", emoji: "📊", modes: ["roundtable"] },
  { id: "activist", label: "Gender and rights activist", emoji: "✊", modes: ["roundtable"] },
  { id: "strategist", label: "Political strategist", emoji: "🗳️", modes: ["roundtable"] },
  { id: "administrator", label: "Former civil servant", emoji: "🏛️", modes: ["roundtable"] },
];

export interface GrokBot {
  id: string;
  name: string;
  /** The roles this bot can play. */
  roles: string[];
}

export const GROK_BOTS: GrokBot[] = [
  { id: "debater", name: "Grok Debater", roles: ["proposer", "opposer"] },
  { id: "devil", name: "Grok Devil", roles: ["devil"] },
  { id: "lawyer", name: "Grok Lawyer", roles: ["lawyer"] },
  { id: "economist", name: "Grok Economist", roles: ["economist"] },
  { id: "activist", name: "Grok Activist", roles: ["activist"] },
  { id: "strategist", name: "Grok Strategist", roles: ["strategist"] },
  { id: "administrator", name: "Grok Administrator", roles: ["administrator"] },
  /** Reviews notes and flags doubtful passages (atlas_flag); it takes no discussion seat. */
  { id: "reviewer", name: "Grok Reviewer", roles: [] },
];

/** A seat: a role, filled by Claude or by a Grok Bot bot (its id). */
export interface Seat {
  role: string;
  by: string;
}

export const role = (id: string): Role | undefined => ROLES.find((r) => r.id === id);
export const grokBot = (id: string): GrokBot | undefined => GROK_BOTS.find((b) => b.id === id);
export const agentOf = (by: string): "claude" | "grok" | "me" =>
  by === "claude" ? "claude" : by === "me" ? "me" : "grok";

/** How a speaker is named in the app: "Claude", "Grok", "You". */
export const AGENTS = {
  claude: { name: "Claude", color: "#d97757" },
  grok: { name: "Grok", color: "#16161a" },
  me: { name: "You", color: "#4646b8" },
} as const;

/** "Claude · Constitutional lawyer", "Grok · Economist". */
export const speaker = (seat: Seat) => `${AGENTS[agentOf(seat.by)].name} · ${role(seat.role)?.label ?? seat.role}`;

export const MODE_INFO: Record<Mode, { title: string; short: string; emoji: string; blurb: string }> = {
  debate: {
    title: "Debate",
    short: "Debate",
    emoji: "🎤",
    blurb: "Claude and Grok argue opposite sides over three rounds. You vote.",
  },
  roundtable: {
    title: "Roundtable",
    short: "Roundtable",
    emoji: "☕",
    blurb: "Experts each bring one dimension, then answer each other. Claude moderates and concludes.",
  },
  devil: {
    title: "Devil's advocate",
    short: "Devil",
    emoji: "😈",
    blurb: "Grok attacks a claim in your note. Claude defends it, and you can join in.",
  },
};

/** Seats for a question you add yourself. */
export const DEFAULT_SEATS: Record<Mode, Seat[]> = {
  debate: [
    { role: "proposer", by: "claude" },
    { role: "opposer", by: "debater" },
  ],
  roundtable: [
    { role: "moderator", by: "claude" },
    { role: "lawyer", by: "claude" },
    { role: "economist", by: "economist" },
    { role: "activist", by: "activist" },
    { role: "strategist", by: "strategist" },
  ],
  devil: [
    { role: "devil", by: "devil" },
    { role: "defender", by: "claude" },
  ],
};
