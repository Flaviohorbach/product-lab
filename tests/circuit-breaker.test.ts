import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../src/circuit-breaker";

describe("CircuitBreaker", () => {
  it("opens after the threshold of consecutive failures, and reports it once", () => {
    const breaker = new CircuitBreaker(3);
    expect([breaker.recordFailure("m"), breaker.recordFailure("m")]).toEqual([false, false]);
    expect(breaker.isOpen("m")).toBe(false);
    expect(breaker.recordFailure("m")).toBe(true);
    expect(breaker.isOpen("m")).toBe(true);
    expect(breaker.recordFailure("m")).toBe(false);
  });

  it("resets on success, because the failures were not consecutive", () => {
    const breaker = new CircuitBreaker(3);
    breaker.recordFailure("m");
    breaker.recordFailure("m");
    breaker.recordSuccess("m");
    breaker.recordFailure("m");
    expect(breaker.isOpen("m")).toBe(false);
  });

  it("tracks each model separately", () => {
    const breaker = new CircuitBreaker(1);
    breaker.recordFailure("slow-model");
    expect(breaker.isOpen("slow-model")).toBe(true);
    expect(breaker.isOpen("other-model")).toBe(false);
  });
});
