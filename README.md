# product-copy-lab

Generates the content of an e-commerce product page (title, descriptions, highlights and SEO, in Brazilian Portuguese) from a spec sheet and a product photo, using Gemini. Then measures which **prompt** and which **model** give the best result for the money.

The hard part of using an LLM for product copy is not making it write; it is making it write **only what is true**. A copy that says "glass jar" when the spec sheet never mentions the material becomes a return, a complaint or a consumer-protection case. So this project treats invented facts as the main failure and measures them automatically.

```
spec sheet + photo → prompt (versioned) → Gemini (JSON schema) → validation → retry with feedback → quality checks → cost report
```

## Results

> Run `npm run bench` to fill this section. Results land in [`results/latest.md`](results/latest.md).

## How it works

### 1. Structured output, validated twice

The response shape is defined once with Zod ([`src/copy-schema.ts`](src/copy-schema.ts)), converted to JSON Schema and sent to the API, so the model can only answer in that shape. The same Zod schema then validates the answer locally, because the API does not enforce every rule (Gemini ignores `maxLength`, for example). A 60-character title limit is only real if your own code checks it.

### 2. Prompts are versioned files

Each prompt is a Markdown file in [`prompts/`](prompts/) with a `# system` and a `# user` section, and [`CHANGELOG.md`](prompts/CHANGELOG.md) records the hypothesis behind each version:

| Version | Idea |
| --- | --- |
| `v1-baseline` | What most people write first: one line of role plus the spec sheet |
| `v2-grounded` | Explains who reads the copy and why accuracy matters, then the grounding rules |
| `v3-few-shot` | v2 plus one complete worked example |

New idea, new file. Old results always point to the exact text that produced them.

### 3. Two kinds of retry

[`src/generate.ts`](src/generate.ts) separates failures by cause:

- **Transient** (HTTP 429, 503): wait with exponential backoff, resend the same request.
- **Invalid answer** (bad JSON, a field over its limit): resend with the validation errors appended, so the model knows exactly what to fix. Every attempt is billed, so token usage is summed across attempts.

### 4. Checks for invented facts

[`src/checks.ts`](src/checks.ts) runs deterministic checks on everything a customer would read:

| Check | Fails when |
| --- | --- |
| `numbers-grounded` | A number in the copy does not appear in the spec sheet (`2 L` when the sheet says `1,5 L`) |
| `materials-grounded` | The copy names a material the spec sheet never mentions |
| `warranty-grounded` | The copy mentions a warranty the spec sheet does not have |
| `no-price` | The price appears in the text (it changes, and it is shown elsewhere) |
| `no-promises` | Marketing promises a store could be held to ("o melhor", "garantido") |
| `plain-text` | Markdown or emojis that the storefront would print literally |

Several catalog items are deliberately incomplete (a chopping board with no material, a plant pot with no drainage info) to see which prompt resists filling the gaps.

### 5. Cost per 1,000 products

Token usage comes from the API response and is priced from [`src/models.ts`](src/models.ts), with the date the prices were checked. Thinking tokens are billed as output, which matters: a model can look cheap per token and still cost more because it thinks a lot.

### Provider-agnostic core

Everything talks to a small `LlmProvider` interface ([`src/providers/types.ts`](src/providers/types.ts)). Gemini is the only adapter today ([`src/providers/gemini.ts`](src/providers/gemini.ts), using the Interactions API with `store: false` so catalog data is not kept by the provider). Adding another provider is one new file. The tests use a fake provider that replays scripted answers, so they run offline, with no key, in CI.

## Running

Requires Node.js 22+ and a free Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
npm install
cp .env.example .env          # then paste your key into .env
npm run generate              # one product, default model and prompt
npm run generate -- --product tabua-de-corte --prompt v1-baseline --model gemini-3.1-flash-lite
npm run bench -- --limit 4    # 3 models × 3 prompts × 4 products
npm run bench                 # full grid: 108 generations, about 10 minutes on the free tier
npm test                      # offline tests, no key needed
```

The free tier allows only a few requests per minute, so the benchmark waits 4 seconds between calls (`--delay`) and backs off on rate limits.

## Data

Product photos come from [DummyJSON](https://dummyjson.com), a free fake-data API, and are downloaded on first use into `.cache/`. Spec sheets were written for this project in Portuguese, in the format of a Brazilian store.

---

Project 2 of my Applied AI Engineering learning path (front-end focus). Concepts explained in Portuguese in [`docs/CONCEITOS.md`](docs/CONCEITOS.md).
