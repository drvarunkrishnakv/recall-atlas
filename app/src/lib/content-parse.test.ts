import { describe, expect, it } from "vitest";
import { cardRefs, citedIn, parseFrontMatter, termsToLinks } from "./content-parse";

describe("parseFrontMatter", () => {
  it("reads JSON values and strips the block", () => {
    const { meta, body } = parseFrontMatter('---\nid: "P06"\npyqs: 7\nlive: true\n---\n\nBody text');
    expect(meta).toEqual({ id: "P06", pyqs: 7, live: true });
    expect(body).toBe("Body text");
  });
  it("keeps raw strings that are not JSON", () => {
    expect(parseFrontMatter("---\ntitle: Plain words\n---\nx").meta.title).toBe("Plain words");
  });
  it("returns the whole text when there is no front matter", () => {
    expect(parseFrontMatter("# Title").body).toBe("# Title");
  });
});

describe("card terms", () => {
  const md = "See [[case-vishaka|Vishaka (1997)]] and [[provision-art-15-3|Art 15(3)]], then [[case-vishaka|again]].";
  it("turns terms into card: links", () => {
    expect(termsToLinks(md)).toBe(
      "See [Vishaka (1997)](card:case-vishaka) and [Art 15(3)](card:provision-art-15-3), then [again](card:case-vishaka).",
    );
  });
  it("lists each referenced card once, in order", () => {
    expect(cardRefs(md)).toEqual(["case-vishaka", "provision-art-15-3"]);
  });
  it("computes which notes cite each card", () => {
    const map = citedIn([
      { id: "P06", body: md },
      { id: "P18", body: "Only [[case-vishaka|Vishaka]] here." },
      { id: "P10", body: "No cards." },
    ]);
    expect(map.get("case-vishaka")).toEqual(["P06", "P18"]);
    expect(map.get("provision-art-15-3")).toEqual(["P06"]);
    expect(map.has("nothing")).toBe(false);
  });
});
