/**
 * Circuit breaker per model: after `threshold` consecutive failures the circuit
 * "opens" and callers stop sending requests to that model for the rest of the run.
 *
 * Retries handle a single bad moment. A breaker handles a model that is down:
 * without it, each item keeps retrying a dead model, and on the free tier every
 * one of those attempts eats daily quota.
 */
export class CircuitBreaker {
  private readonly failures = new Map<string, number>();

  constructor(private readonly threshold = 3) {}

  isOpen(key: string): boolean {
    return (this.failures.get(key) ?? 0) >= this.threshold;
  }

  /** Records a failure and returns true when this failure opened the circuit. */
  recordFailure(key: string): boolean {
    const count = (this.failures.get(key) ?? 0) + 1;
    this.failures.set(key, count);
    return count === this.threshold;
  }

  /** Any success closes the circuit again: the failures were not consecutive. */
  recordSuccess(key: string): void {
    this.failures.delete(key);
  }
}
