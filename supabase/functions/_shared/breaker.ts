// A circuit breaker for the paid planners. After a few requests in a row where a provider gave no usable plan, skip it
// for a few minutes, so an outage or a revoked key does not cost a slow, billed attempt on every request. State lives in
// the warm function instance, so it resets on a cold start; that is fine, it only has to stop a stream of failures.

export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 5 * 60 * 1000,
  ) {}

  isOpen(now: number = Date.now()): boolean {
    return now < this.openUntil;
  }

  recordFailure(now: number = Date.now()): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.openUntil = now + this.cooldownMs;
      // After the cooldown one request goes through to test the provider; if it fails the breaker opens again at once.
      this.failures = this.threshold - 1;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.openUntil = 0;
  }
}

const breakers = new Map<string, CircuitBreaker>();
export const breakerFor = (provider: string): CircuitBreaker => {
  let b = breakers.get(provider);
  if (!b) breakers.set(provider, (b = new CircuitBreaker()));
  return b;
};
