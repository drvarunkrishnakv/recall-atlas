import { describe, expect, it } from "vitest";
import { heatmapRecords, joinHeatmap } from "./cloud-docs";
import { heatMapProblems, monthLabel, monthRange, quadrantOf, seriesOf, storyStats, type HeatMap } from "./heatmap";

const map = (over: Partial<HeatMap> = {}): HeatMap => ({
  from: "2024-11",
  to: "2025-02",
  builtAt: "2026-10-18",
  method: "test",
  exams: [{ date: "2025-05-25", kind: "prelims" }],
  prelims: [],
  stories: [
    {
      id: "story-a",
      name: "Story A",
      area: "polity",
      months: {
        "2024-12": {
          coverage: 3,
          weight: 4,
          summary: "Something happened.",
          events: [
            { date: "2024-12-05", text: "It happened.", sources: [{ label: "PIB", url: "https://pib.gov.in/" }] },
          ],
        },
      },
    },
  ],
  ...over,
});

describe("heat map", () => {
  it("lists months across a year end and labels them", () => {
    expect(monthRange("2024-11", "2025-02")).toEqual(["2024-11", "2024-12", "2025-01", "2025-02"]);
    expect(monthRange("2025-02", "2024-11")).toEqual([]);
    expect(monthLabel("2025-05")).toBe("May 2025");
  });

  it("reads a story's series, quiet months as 0", () => {
    const s = map().stories[0];
    const months = monthRange("2024-11", "2025-02");
    expect(seriesOf(s, months, "coverage")).toEqual([0, 3, 0, 0]);
    expect(seriesOf(s, months, "weight")).toEqual([0, 4, 0, 0]);
  });

  it("measures how long and how loud, without punishing a short spike", () => {
    expect(storyStats([0, 4, 0, 0])).toMatchObject({ hot: 1, active: 1, peak: 4, first: 1, last: 1 });
    expect(storyStats([1, 4, 1, 1])).toMatchObject({ hot: 1, active: 4, peak: 4 });
    expect(storyStats([1, 1, 0, 1])).toMatchObject({ hot: 0, peak: 1 });
    expect(storyStats([2, 3, 2, 2, 2, 2, 1, 2])).toMatchObject({ hot: 7, active: 8, first: 0, last: 7 });
    expect(storyStats([2, 3, 2, 2, 2, 2, 1, 2]).peak).toBeCloseTo(7 / 3);
    expect(storyStats([0, 0])).toMatchObject({ hot: 0, peak: 0, first: -1 });
  });

  it("sorts stories into the four corners", () => {
    expect(quadrantOf({ hot: 10, peak: 3.7 })).toBe("long-loud");
    expect(quadrantOf({ hot: 1, peak: 4 })).toBe("brief-loud");
    expect(quadrantOf({ hot: 9, peak: 2.3 })).toBe("slow");
    expect(quadrantOf({ hot: 2, peak: 2 })).toBe("background");
  });

  it("finds problems before an import", () => {
    expect(heatMapProblems(map())).toEqual([]);
    const bad = map();
    bad.stories[0].months["2025-06"] = { coverage: 5, weight: 1, summary: "", events: [] };
    bad.stories[0].months["2024-12"].events[0].sources = [{ label: "x", url: "ftp://x" }];
    bad.stories.push({ ...bad.stories[0], area: "sport" as never });
    const problems = heatMapProblems(bad).join("\n");
    expect(problems).toMatch(/2025-06 is outside the range/);
    expect(problems).toMatch(/whole numbers 0–4/);
    expect(problems).toMatch(/http\(s\) sources/);
    expect(problems).toMatch(/duplicate id/);
    expect(problems).toMatch(/unknown area sport/);
  });

  it("splits a long heat map across Firestore documents and joins it back", async () => {
    const m = map();
    const parts = heatmapRecords(m, 1, 50);
    expect(parts.length).toBeGreaterThan(3);
    expect(parts[0]).toMatchObject({ id: "current", record: { parts: parts.length } });
    expect(parts[1].id).toBe("current-1");
    const read = (i: number) => Promise.resolve(parts[i]?.record);
    expect(await joinHeatmap(parts[0].record, read)).toEqual(m);
    expect(await joinHeatmap(undefined, read)).toBeNull();
    await expect(joinHeatmap(parts[0].record, async (i) => (i === 2 ? undefined : parts[i].record))).rejects.toThrow(
      /missing part 2/,
    );
  });
});
