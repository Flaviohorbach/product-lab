import { describe, expect, it } from "vitest";
import { runChecks } from "../src/checks";
import { blender, goodCopy } from "./helpers";

const failed = (copy: typeof goodCopy) => runChecks(copy, blender).filter((c) => !c.passed);

describe("runChecks", () => {
  it("passes copy that only uses facts from the spec sheet", () => {
    expect(failed(goodCopy)).toEqual([]);
  });

  it("flags numbers that are not in the spec sheet", () => {
    const copy = { ...goodCopy, highlights: ["Potência de 600 W", "Copo de 2 L", "Garantia de 5 anos"] };
    expect(failed(copy)).toEqual([{ id: "numbers-grounded", passed: false, detail: "2" }]);
  });

  it("treats 1,5 and 1.5 as the same number", () => {
    const copy = { ...goodCopy, shortDescription: "Copo de 1.5 L." };
    expect(failed(copy)).toEqual([]);
  });

  it("flags materials the spec sheet never mentions", () => {
    const copy = { ...goodCopy, longDescription: "Copo de vidro resistente com 1,5 L." };
    expect(failed(copy).map((c) => c.id)).toEqual(["materials-grounded"]);
  });

  it("does not treat generic words like 'tecido' as invented materials", () => {
    const dress = { ...blender, attributes: { "Composição": "Viscose" } };
    const copy = { ...goodCopy, highlights: ["Feito em viscose, um tecido leve", "Ideal para o verão", "Modelagem solta"] };
    const ids = runChecks(copy, dress).filter((c) => !c.passed).map((c) => c.id);
    expect(ids).not.toContain("materials-grounded");
  });

  it("flags a warranty when the spec sheet has none", () => {
    const { Garantia: _, ...attributes } = blender.attributes;
    const product = { ...blender, attributes };
    const copy = { ...goodCopy, highlights: ["Potência de 600 W", "Copo de 1,5 L", "Com garantia de fábrica"] };
    const ids = runChecks(copy, product).filter((c) => !c.passed).map((c) => c.id);
    expect(ids).toContain("warranty-grounded");
  });

  it("flags the price, marketing promises and markdown", () => {
    const copy = {
      ...goodCopy,
      shortDescription: "Por apenas R$ 189,90, o melhor liquidificador!",
      longDescription: "**Potente** e compacto.",
    };
    expect(failed(copy).map((c) => c.id).sort()).toEqual(["no-price", "no-promises", "plain-text"]);
  });

  it("ignores missingInfo and visual notes, which are not published", () => {
    const copy = { ...goodCopy, missingInfo: ["Garantia de 2 anos?", "Material do copo (vidro?)"] };
    expect(failed(copy)).toEqual([]);
  });
});
