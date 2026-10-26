import type { ProductCopy } from "../src/copy-schema";
import type { Product } from "../src/product";
import type { GenerateRequest, GenerateResponse, LlmProvider } from "../src/providers/types";

export const blender: Product = {
  id: "liquidificador-compacto",
  name: "Liquidificador Compacto",
  category: "Cozinha > Eletroportáteis",
  brand: null,
  priceBRL: 189.9,
  attributes: { "Potência": "600 W", "Capacidade do copo": "1,5 L", "Garantia": "5 anos" },
  notes: null,
  imageUrl: "https://example.com/blender.webp",
};

export const goodCopy: ProductCopy = {
  title: "Liquidificador Compacto 600 W com Copo de 1,5 L",
  shortDescription: "Liquidificador de 600 W com copo de 1,5 L para sucos e vitaminas do dia a dia.",
  longDescription: "O Liquidificador Compacto tem 600 W de potência e copo de 1,5 L.\n\nConta com 5 anos de garantia.",
  highlights: ["Potência de 600 W", "Copo de 1,5 L", "Garantia de 5 anos"],
  seo: {
    metaTitle: "Liquidificador Compacto 600 W | Copo 1,5 L",
    metaDescription: "Liquidificador compacto de 600 W com copo de 1,5 L e 5 anos de garantia.",
    keywords: ["liquidificador", "liquidificador compacto", "liquidificador 600 w"],
  },
  visualAttributes: { colors: ["preto"], notes: "Base com botão giratório." },
  missingInfo: ["Voltagem"],
};

/** Provider that replays scripted answers (or errors) and records what it was sent. */
export class FakeProvider implements LlmProvider {
  readonly name = "fake";
  readonly requests: GenerateRequest[] = [];

  constructor(private readonly script: Array<string | Error>) {}

  async generate(request: GenerateRequest): Promise<GenerateResponse> {
    this.requests.push(request);
    const next = this.script.shift();
    if (next === undefined) throw new Error("FakeProvider ran out of scripted answers");
    if (next instanceof Error) throw next;
    return { text: next, usage: { inputTokens: 1000, outputTokens: 400, thoughtTokens: 100 }, latencyMs: 50 };
  }
}
