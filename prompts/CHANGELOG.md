# Prompt changelog

Prompts are versioned like code: a new idea is a new file, never an edit to an old one, so every benchmark result can be traced to the exact text that produced it.

## v3-few-shot

Same rules as v2, plus one complete worked example (a product that is not in the catalog) showing a gap in the spec sheet going to `missingInfo` instead of into the copy.

Hypothesis: a concrete example teaches tone, length and the "don't invent" rule better than rules alone.

Result (2026-10-26): **not confirmed.** Same check results as v2 on both models, with higher latency (9.4 s vs 4.2 s on flash-lite) and slightly higher cost. v2 stays the default.

Update (2026-10-28): still not confirmed. On gemini-3.6-flash, v3 had 0 failures in 10 products where v2 had 2 in 11 (both deductions, "Bivolt" → "110V e 220V" and "Viscose" → "100% viscose"). A hint, too small a sample to change the default.

## v2-grounded

Explains who reads the copy and why accuracy matters (published without review, consumer-protection risk), then sets the grounding rules: the spec sheet is the only source of facts, the photo only for what is visible, missing data goes to `missingInfo`, no price, no promises, pt-BR without markdown.

Hypothesis: giving the model the reason behind each rule reduces invented facts compared with v1.

Result (2026-10-26): **confirmed.** No detected inventions on either model (v1: 33% to 75% of products had at least one).

Update (2026-10-28): still confirmed against v1, with a new failure type on gemini-3.6-flash: deductions from domain knowledge (2 of 11 products). A next version could say explicitly that technical details must not be derived, only copied ("Bivolt" stays "Bivolt").

## v1-baseline

What most people write first: a one-line role and the spec sheet. The JSON schema is still enforced, so the shape is always right; only the content can go wrong.

Purpose: the baseline every other version is measured against.
