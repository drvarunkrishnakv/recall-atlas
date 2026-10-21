import { describe, expect, it } from "vitest";
import { impliedOption, markable, optionCount, optionVector, statementTruth } from "./statements";

describe("statement options", () => {
  it("read which statements an option names, in Arabic or Roman numerals", () => {
    expect(optionVector("1 only", 2)).toEqual([true, false]);
    expect(optionVector("Both 1 and 2", 2)).toEqual([true, true]);
    expect(optionVector("Neither 1 nor 2", 2)).toEqual([false, false]);
    expect(optionVector("1 and 3 only", 3)).toEqual([true, false, true]);
    expect(optionVector("I, II and III", 3)).toEqual([true, true, true]);
    expect(optionVector("II only", 2)).toEqual([false, true]);
  });
  it("read 'all' and 'none', and refuse counts that don't say which", () => {
    expect(optionVector("All three", 3)).toEqual([true, true, true]);
    expect(optionVector("None", 3)).toEqual([false, false, false]);
    expect(optionVector("Only two", 3)).toBeNull();
    expect(optionVector("Only one", 4)).toBeNull();
  });
  it("read Statement-I / Statement-II options", () => {
    expect(
      optionVector("Both Statement-I and Statement-II are correct and Statement-II explains Statement-I", 2),
    ).toEqual([true, true]);
    expect(optionVector("Statement-I is correct but Statement-II is incorrect", 2)).toEqual([true, false]);
    expect(optionVector("Statement-I is incorrect but Statement-II is correct", 2)).toEqual([false, true]);
  });
  it("give each statement's truth from the right option, and the option your marks point to", () => {
    const options = ["1 only", "2 only", "Both 1 and 2", "Neither 1 nor 2"];
    expect(statementTruth(options, 1, 2)).toEqual([false, true]);
    expect(impliedOption(options, [true, true])).toBe(2);
    expect(impliedOption(options, [true, null])).toBeNull();
    expect(optionVector("4 only", 3)).toBeNull();
  });
  it("read 'how many' options, and point your marks to the count", () => {
    const options = ["Only one", "Only two", "All three", "None"];
    expect(optionCount("Only two", 3)).toBe(2);
    expect(optionCount("All three", 3)).toBe(3);
    expect(optionCount("None", 3)).toBe(0);
    expect(optionCount("Mustard", 3)).toBeNull();
    expect(impliedOption(options, [true, false, true])).toBe(1);
    expect(impliedOption(options, [false, false, false])).toBe(3);
  });
  it("offer marks only when every option is about the statements", () => {
    expect(markable(["1 only", "2 only", "Both 1 and 2", "Neither 1 nor 2"], 2)).toBe(true);
    expect(markable(["Only one", "Only two", "All three", "None"], 3)).toBe(true);
    expect(markable(["Mustard", "Cotton", "Pepper", "Tobacco"], 4)).toBe(false);
    // Options that name a third statement when only two were read.
    expect(markable(["1 and 2 only", "2 and 3 only", "3 only", "1, 2 and 3"], 2)).toBe(false);
  });
});
