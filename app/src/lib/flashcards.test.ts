import { describe, expect, it } from "vitest";
import { answerTokens, backIn, CARD_GRADE, checkTyped, clozeParts } from "./flashcards";
import { fsrsRating, validateAttempt, type FlashcardItem } from "./practice";

// Synthetic cards: the shapes only, no real content.
const src = { type: "claude" as const, checked: true, sources: [{ label: "Sample", url: "https://example.org" }] };
const card = (over: Partial<FlashcardItem>): FlashcardItem => ({
  id: "c1",
  bank: "sample-cards",
  topic: "Sample topic",
  kind: "flashcard",
  style: "qa",
  front: "Which sample schedule covers sample rules?",
  back: "The Tenth Schedule",
  source: src,
  ...over,
});

describe("the typed answer", () => {
  it("is read without case, accents, punctuation or filler, with ordinals as numbers", () => {
    expect(answerTokens("The Tenth  Schedule!")).toEqual(["10", "schedule"]);
    expect(answerTokens("10th")).toEqual(["10"]);
    expect(answerTokens("Café-Ålborg")).toEqual(["cafe", "alborg"]);
  });
  it("matches when it names what the question doesn't give away", () => {
    expect(checkTyped(card({}), "10th").verdict).toBe("match");
    expect(checkTyped(card({}), "tenth").suggest).toBe("knew");
    expect(checkTyped(card({}), "the ninth schedule").verdict).toBe("miss");
    expect(checkTyped(card({}), "  ")).toEqual({ empty: true });
  });
  it("forgives a typo in a long word, and gives partial credit", () => {
    const strait = card({ front: "Name the sample strait.", back: "Strait of Samplecca" });
    expect(checkTyped(strait, "samplecca").verdict).toBe("match");
    expect(checkTyped(strait, "sampleca").verdict).toBe("match");
    const two = card({ front: "Name the two sample hills.", back: "Alpha Range and Beta Range" });
    expect(checkTyped(two, "alpha range").verdict).toBe("partial");
    expect(checkTyped(two, "alpha range").suggest).toBe("hard");
    expect(checkTyped(two, "beta range, alpha").suggest).toBe("knew");
    expect(checkTyped(two, "gamma").suggest).toBe("forgot");
  });
  it("ticks off each list item you named", () => {
    const list = card({
      style: "list",
      front: "Name the four sample articles, by number.",
      back: "Articles 1, 2, 3 and 4",
      list: ["Art. 1 · first sample", "Art. 2 · second sample", "Art. 3 · third sample", "Art. 4 · fourth sample"],
    });
    const r = checkTyped(list, "1, 3, 4");
    expect(r.hits).toEqual([true, false, true, true]);
    expect(r.verdict).toBe("partial");
    expect(checkTyped(list, "1 2 3 4").suggest).toBe("knew");
    expect(checkTyped(list, "9").suggest).toBe("forgot");
  });
});

describe("cards", () => {
  it("split a cloze front around its blank", () => {
    expect(clozeParts("Sample rights sit under Article ___ of the sample text.")).toEqual([
      "Sample rights sit under Article ",
      " of the sample text.",
    ]);
    expect(clozeParts("No blank here")).toHaveLength(1);
  });
  it("log Forgot, Hard, Knew it and Easy as the existing grades", () => {
    expect(Object.values(CARD_GRADE).map(fsrsRating)).toEqual([1, 2, 3, 4]);
    const a = {
      id: "a1",
      itemId: "c1",
      bank: "sample-cards",
      kind: "flashcard",
      at: "2026-10-21T08:00:00.000Z",
      ms: 9000,
      mode: "practice",
      typed: "tenth",
    } as const;
    expect(validateAttempt({ ...a, correct: true, grade: CARD_GRADE.knew }).grade).toBe("good");
    expect(validateAttempt({ ...a, correct: false, grade: CARD_GRADE.forgot }).grade).toBe("forgot");
    expect(() => validateAttempt({ ...a, correct: false, grade: CARD_GRADE.hard })).toThrow(/doesn't fit/);
  });
  it("say when each grade brings a new card back", () => {
    const now = new Date("2026-10-21T08:00:00Z");
    expect(backIn("forgot", undefined, now)).toMatch(/min$/);
    expect(backIn("easy", undefined, now)).toMatch(/days$/);
  });
});
