import { describe, expect, it } from "vitest";
import { parseFrontMatter } from "./content-parse";

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
