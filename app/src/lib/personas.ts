// Who speaks in a discussion: Claude, you, and other AIs (Grok, Gemini, ChatGPT) that
// connect through the Atlas MCP server. Each connection plays one of the BOTS (prompts in
// docs/AGENT_PERSONAS.md) and passes its id as `persona` on every Atlas tool call; which AI
// it is comes from its MCP key. A seat pairs a role (for the motion, economist, devil's
// advocate…) with who fills it.

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

/** The other AIs that can connect through the Atlas MCP server. Each MCP key belongs to one. */
export const AIS = {
  grok: { name: "Grok", color: "#16161a", mark: "G" },
  gemini: { name: "Gemini", color: "#1f6feb", mark: "✦" },
  chatgpt: { name: "ChatGPT", color: "#10a37f", mark: "◎" },
  /** Claude through a Claude.ai or phone-app connector, as opposed to Claude's own CLI ("claude"). */
  claudeapp: { name: "Claude app", color: "#c4663f", mark: "✳" },
} as const;
export type AiId = keyof typeof AIS;
export const AI_IDS = Object.keys(AIS) as AiId[];
export const isAi = (x: unknown): x is AiId => typeof x === "string" && Object.hasOwn(AIS, x);

/** A bot: a persona any connected AI can take on. It passes its id as `persona` on every Atlas tool call. */
export interface Bot {
  id: string;
  name: string;
  /** The roles this bot can play. */
  roles: string[];
}

export const BOTS: Bot[] = [
  { id: "debater", name: "Debater", roles: ["proposer", "opposer"] },
  { id: "devil", name: "Devil", roles: ["devil"] },
  { id: "lawyer", name: "Lawyer", roles: ["lawyer"] },
  { id: "economist", name: "Economist", roles: ["economist"] },
  { id: "activist", name: "Activist", roles: ["activist"] },
  { id: "strategist", name: "Strategist", roles: ["strategist"] },
  { id: "administrator", name: "Administrator", roles: ["administrator"] },
  /** Reviews notes and flags doubtful passages (atlas_flag); it takes no discussion seat. */
  { id: "reviewer", name: "Reviewer", roles: [] },
];

/**
 * A seat: a role, filled by Claude or by a bot (its id). `ai` pins the seat to one AI;
 * without it, whichever AI connects first as that bot takes the turn.
 */
export interface Seat {
  role: string;
  by: string;
  ai?: AiId;
}

export const role = (id: string): Role | undefined => ROLES.find((r) => r.id === id);
export const bot = (id: string): Bot | undefined => BOTS.find((b) => b.id === id);

/** How a speaker is named in the app: "Claude", "You", the AI's name, or "AI" before one has spoken. */
export const AGENTS = {
  claude: { name: "Claude", color: "#d97757", mark: "✳" },
  me: { name: "You", color: "#4646b8", mark: "🙂" },
  ...AIS,
  ai: { name: "AI", color: "#6b6b75", mark: "✧" },
} as const;
export type Agent = keyof typeof AGENTS;

/** Who is speaking: Claude, you, the AI that posted (or the seat is pinned to), or an AI not known yet. */
export const agentOf = (by: string, ai?: string): Agent =>
  by === "claude" ? "claude" : by === "me" ? "me" : isAi(ai) ? ai : "ai";

/** "Claude · Constitutional lawyer", "Gemini · Economist". */
export const speaker = (x: { role: string; by: string; ai?: string }) =>
  `${AGENTS[agentOf(x.by, x.ai)].name} · ${role(x.role)?.label ?? x.role}`;

export const MODE_INFO: Record<Mode, { title: string; short: string; emoji: string; blurb: string }> = {
  debate: {
    title: "Debate",
    short: "Debate",
    emoji: "🎤",
    blurb: "Claude and another AI argue opposite sides over three rounds. You vote.",
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
    blurb: "Another AI attacks a claim in your note. Claude defends it, and you can join in.",
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
