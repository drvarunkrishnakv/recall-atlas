import { describe, expect, it } from "vitest";
import { MODE_HOME, modeFor, modeOf, switchTarget } from "./mode";
import { daysUntil, longDate, MAINS_2027, PRELIMS_2027 } from "./exam";

describe("modes", () => {
  it("read the mode from the path: /prelims and below is Prelims, everything else Mains", () => {
    expect(modeOf("/prelims")).toBe("prelims");
    expect(modeOf("/prelims/session")).toBe("prelims");
    expect(modeOf("/prelimsx")).toBe("mains");
    expect(modeOf("/")).toBe("mains");
    expect(modeOf("/gs2/polity")).toBe("mains");
  });
  it("switch back to the last page of the other mode, or to its home", () => {
    expect(switchTarget("mains", "/notes/P06?peek=card:x")).toBe("/notes/P06?peek=card:x");
    expect(switchTarget("prelims", "/prelims")).toBe("/prelims");
    expect(switchTarget("prelims", null)).toBe(MODE_HOME.prelims);
    expect(switchTarget("mains", "/prelims")).toBe("/");
  });
  it("keep the mode you came from on a shared page like Settings", () => {
    expect(modeFor("/settings", "prelims")).toBe("prelims");
    expect(modeFor("/settings", "mains")).toBe("mains");
    expect(modeFor("/prelims", "mains")).toBe("prelims");
  });
  it("never follow a saved path off the app", () => {
    expect(switchTarget("mains", "//evil.example")).toBe("/");
    expect(switchTarget("mains", "https://evil.example")).toBe("/");
    expect(switchTarget("mains", "/\\evil.example")).toBe("/");
  });
});

describe("exam dates", () => {
  it("count the days to Prelims and Mains 2027", () => {
    expect(daysUntil(PRELIMS_2027, "2026-10-20")).toBe(215);
    expect(daysUntil(MAINS_2027, "2026-10-20")).toBe(304);
    expect(daysUntil(PRELIMS_2027, PRELIMS_2027)).toBe(0);
    expect(longDate(PRELIMS_2027)).toBe("Sunday 23 May 2027");
  });
});
