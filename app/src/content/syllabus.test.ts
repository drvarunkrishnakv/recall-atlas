import { describe, expect, it } from "vitest";
import { locateNote } from "./syllabus";

describe("locateNote", () => {
  it("places a planned note under its paper, subject and topic", () => {
    const loc = locateNote("P06");
    expect([loc?.paper.id, loc?.subject.id, loc?.topic.id, loc?.parent]).toEqual(["gs2", "polity", "t01", undefined]);
  });

  it("places a study file under its parent note", () => {
    const loc = locateNote("P06-study", "P06");
    expect([loc?.topic.id, loc?.parent?.id]).toEqual(["t01", "P06"]);
  });

  it("returns null for pages outside the tree", () => {
    expect(locateNote("X99")).toBeNull();
    expect(locateNote("X99-study", "X99")).toBeNull();
  });
});
