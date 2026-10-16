// The syllabus tree: GS paper → subject → syllabus topic → planned notes.
// This is public structure (topic names, planned note titles, PYQ counts), not note content.

export interface PlannedNote {
  id: string;
  title: string;
  pyqs: number;
}
export interface Topic {
  id: string;
  n: string;
  title: string;
  meaning: string;
  notes: PlannedNote[];
}
export interface Subject {
  id: string;
  title: string;
  topics: Topic[];
}
export interface Paper {
  id: string;
  title: string;
  subjects: Subject[];
  comingSubjects: string[];
}

/** A subject's colours: `color` for fills (white text on it), `tint` and `ink` for soft chips. */
export interface SubjectStyle {
  color: string;
  tint: string;
  ink: string;
  shape: string;
}
const STYLES: Record<string, SubjectStyle> = {
  polity: { color: "#5b5bd6", tint: "#e6e6fb", ink: "#34348f", shape: "#7c7cf0" },
  governance: { color: "#138a7e", tint: "#d7f1ee", ink: "#0d5f57", shape: "#23a597" },
  "social-justice": { color: "#c2477f", tint: "#fbe3ee", ink: "#86224f", shape: "#d9699b" },
  "international-relations": { color: "#d9542f", tint: "#fbe3db", ink: "#93361b", shape: "#ee7a59" },
  economy: { color: "#c98408", tint: "#fcefd3", ink: "#7a4d00", shape: "#e7a52c" },
  history: { color: "#8b4fb3", tint: "#f0e3f8", ink: "#5e2c80", shape: "#a86fd0" },
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
export const subjectStyle = (idOrTitle: string): SubjectStyle =>
  STYLES[slug(idOrTitle)] ?? { color: "#5f6068", tint: "#ebe9e1", ink: "#33343b", shape: "#7a7b83" };

/** Subjects not planned yet, for the home page and sidebar. */
export const COMING_SUBJECTS: { title: string; paper: string }[] = [
  { title: "Governance", paper: "GS2" },
  { title: "Social Justice", paper: "GS2" },
  { title: "International Relations", paper: "GS2" },
  { title: "Economy", paper: "GS3" },
  { title: "History", paper: "GS1" },
];

const polity: Topic[] = [
  {
    id: "t01",
    n: "01",
    title: "Constitution & its foundations",
    meaning: "Origins, rights and limits on change",
    notes: [
      { id: "P01", title: "Constitutional history & making", pyqs: 2 },
      { id: "P02", title: "Preamble, constitutional values & constitutional morality", pyqs: 3 },
      { id: "P03", title: "Fundamental Rights & their judicial expansion", pyqs: 8 },
      { id: "P04", title: "DPSP, Fundamental Duties & UCC", pyqs: 1 },
      { id: "P05", title: "Amendment power & basic structure", pyqs: 5 },
      { id: "P06", title: "Women's political representation & reservation", pyqs: 7 },
      { id: "P07", title: "Special provisions, UTs & asymmetric federalism", pyqs: 5 },
      { id: "P08", title: "Emergency provisions & Article 356", pyqs: 2 },
    ],
  },
  {
    id: "t02",
    n: "02",
    title: "Federalism & local government",
    meaning: "Sharing power, responsibilities and finances",
    notes: [
      { id: "P09", title: "Federalism & Centre–State relations", pyqs: 8 },
      { id: "P10", title: "Fiscal federalism: Finance Commission, GST & devolution", pyqs: 10 },
      { id: "P11", title: "Inter-state relations & water disputes", pyqs: 1 },
      { id: "P12", title: "Local government: Panchayats & urban local bodies", pyqs: 7 },
    ],
  },
  {
    id: "t03",
    n: "03",
    title: "Separation of powers",
    meaning: "Checks, balances and dispute resolution",
    notes: [
      { id: "P13", title: "Separation of powers, judicial activism & ordinances", pyqs: 5 },
      { id: "P14", title: "Dispute resolution & access to justice", pyqs: 3 },
    ],
  },
  {
    id: "t04",
    n: "04",
    title: "Comparing constitutions",
    meaning: "Indian design alongside other systems",
    notes: [{ id: "P15", title: "Comparing constitutions: USA, UK, France", pyqs: 8 }],
  },
  {
    id: "t05",
    n: "05",
    title: "Parliament & State legislatures",
    meaning: "Representation, lawmaking and accountability",
    notes: [
      { id: "P16", title: "Parliament: structure, houses & privileges", pyqs: 6 },
      { id: "P17", title: "Parliamentary accountability & committees", pyqs: 6 },
      { id: "P18", title: "Presiding officers & anti-defection", pyqs: 3 },
    ],
  },
  {
    id: "t06",
    n: "06",
    title: "Executive, judiciary & groups",
    meaning: "Institutions and participation in politics",
    notes: [
      { id: "P19", title: "Executive: President, Governor & Council of Ministers", pyqs: 2 },
      { id: "P20", title: "Judiciary: appointments, independence & PIL", pyqs: 4 },
      { id: "P21", title: "Pressure groups & party system", pyqs: 7 },
    ],
  },
  {
    id: "t07",
    n: "07",
    title: "Elections & representation",
    meaning: "The framework for representative elections",
    notes: [{ id: "P22", title: "Elections, RPA & electoral reforms", pyqs: 7 }],
  },
  {
    id: "t08",
    n: "08",
    title: "Constitutional posts & bodies",
    meaning: "Appointments, mandates and accountability",
    notes: [{ id: "P23", title: "Constitutional bodies: ECI, CAG, AG & commissions", pyqs: 9 }],
  },
  {
    id: "t09",
    n: "09",
    title: "Statutory & regulatory bodies",
    meaning: "Institutions created and empowered by law",
    notes: [{ id: "P24", title: "Statutory, regulatory & quasi-judicial bodies", pyqs: 10 }],
  },
];

export const PAPERS: Paper[] = [
  {
    id: "gs2",
    title: "GS Paper 2",
    subjects: [{ id: "polity", title: "Polity", topics: polity }],
    comingSubjects: ["Governance", "Social Justice", "International Relations"],
  },
];
export const COMING_PAPERS = ["GS Paper 1", "GS Paper 3"];

/** Where a planned note sits in the tree. */
export function locateNote(noteId: string) {
  for (const paper of PAPERS)
    for (const subject of paper.subjects)
      for (const topic of subject.topics)
        if (topic.notes.some((n) => n.id === noteId)) return { paper, subject, topic };
  return null;
}

export function findTopic(paperId: string, subjectId: string, topicId: string) {
  const paper = PAPERS.find((p) => p.id === paperId);
  const subject = paper?.subjects.find((s) => s.id === subjectId);
  const topic = subject?.topics.find((t) => t.id === topicId);
  return paper && subject && topic ? { paper, subject, topic } : null;
}
