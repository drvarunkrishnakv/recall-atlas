// Content access for the app. In M1 the content is bundled at build time from
// ATLAS_CONTENT_DIR (or the fixture); M2 swaps this module for Firestore reads.
import { notes as rawNotes, cards as rawCards } from "virtual:atlas-content";
import { citedIn } from "../lib/content-parse";

export interface Note {
  id: string;
  title: string;
  topic: string;
  status: string;
  pyqs: number;
  updated: string;
  body: string;
}
export interface Card {
  id: string;
  kind: string;
  title: string;
  summary: string;
  body: string;
}

export const NOTES = new Map<string, Note>(rawNotes.map((n) => [n.id, n as unknown as Note]));
export const CARDS = new Map<string, Card>(rawCards.map((c) => [c.id, c as unknown as Card]));
export const CITED_IN = citedIn([...NOTES.values()]);

export const STATUS_LABEL: Record<string, string> = {
  draft: "Drafting",
  "in-review": "In review",
  live: "Live",
};
