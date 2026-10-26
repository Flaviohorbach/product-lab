import type { ProductCopy } from "./copy-schema";
import { specSheet, type Product } from "./product";

/**
 * Deterministic quality checks. They run on every output for free, catch the
 * failures that matter most in e-commerce (invented facts) and give the same
 * answer every time, which is what you want in a regression test.
 *
 * They do not judge style or persuasiveness; that needs a human or an LLM
 * judge (module 10).
 */
export interface CheckResult {
  id: string;
  passed: boolean;
  detail?: string;
}

const MATERIALS = [
  "madeira", "bambu", "plástico", "plastico", "aço", "inox", "alumínio", "aluminio", "vidro", "cerâmica",
  "ceramica", "silicone", "metal", "couro", "algodão", "algodao", "poliéster", "poliester", "viscose",
  "linho", "borracha", "acetato", "policarbonato", "carbono", "grafite", "tecido", "nylon", "náilon",
];

const PROMISES = [
  /\bo melhor\b/i, /\bgarantid[oa]s?\b/i, /\bimbatíve(l|is)\b/i, /\blíder de mercado\b/i,
  /\bnúmero 1\b/i, /\b100% (seguro|eficaz|garantido)\b/i, /\bpara sempre\b/i, /\bnunca (quebra|estraga)\b/i,
];

/** All text a customer would read. Visual notes and missingInfo are internal. */
function publishedText(copy: ProductCopy): string {
  return [
    copy.title, copy.shortDescription, copy.longDescription, ...copy.highlights,
    copy.seo.metaTitle, copy.seo.metaDescription,
  ].join("\n");
}

const numbersIn = (text: string) =>
  new Set((text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".").replace(/\.0+$/, "")));

const normalize = (text: string) => text.toLowerCase().normalize("NFC");

export function runChecks(copy: ProductCopy, product: Product): CheckResult[] {
  const text = publishedText(copy);
  const lower = normalize(text);
  const spec = normalize(specSheet(product));

  // 1. Every number in the copy must come from the spec sheet.
  const specNumbers = numbersIn(spec);
  const inventedNumbers = [...numbersIn(text)].filter((n) => !specNumbers.has(n));

  // 2. Materials only when the spec sheet names them.
  const inventedMaterials = MATERIALS.filter((m) => new RegExp(`\\b${m}\\b`, "i").test(lower) && !spec.includes(m));

  // 3. Warranty only when the spec sheet mentions it.
  const inventedWarranty = /\bgarantia\b/i.test(lower) && !spec.includes("garantia");

  // 4. No price in the copy: it lives elsewhere on the page and changes often.
  const mentionsPrice = /r\$\s*\d/i.test(text) || lower.includes(product.priceBRL.toFixed(2).replace(".", ","));

  // 5. No marketing promises that a consumer could hold the store to.
  const promises = PROMISES.filter((p) => p.test(text)).map((p) => text.match(p)![0]);

  // 6. Plain text: the storefront renders it as-is.
  const formatting = /\*\*|^#{1,6}\s|^\s*[-*•]\s|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/mu.test(text);

  return [
    { id: "numbers-grounded", passed: inventedNumbers.length === 0, detail: inventedNumbers.join(", ") || undefined },
    { id: "materials-grounded", passed: inventedMaterials.length === 0, detail: inventedMaterials.join(", ") || undefined },
    { id: "warranty-grounded", passed: !inventedWarranty },
    { id: "no-price", passed: !mentionsPrice },
    { id: "no-promises", passed: promises.length === 0, detail: promises.join(", ") || undefined },
    { id: "plain-text", passed: !formatting },
  ];
}
