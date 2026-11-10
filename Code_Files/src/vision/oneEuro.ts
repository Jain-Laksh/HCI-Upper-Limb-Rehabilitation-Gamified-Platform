// One Euro Filter (Casiez, Roussel & Vogel, CHI 2012).
// Adaptive low-pass filter: strong smoothing when the hand is slow (removes tremor/jitter),
// little smoothing when it moves fast (keeps latency low). Standard in HCI pointing research.

class LowPass {
  private y: number | null = null;
  filter(x: number, alpha: number) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  last() { return this.y; }
  reset() { this.y = null; }
}

const alphaFor = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private tPrev: number | null = null;
  constructor(public minCutoff = 1.0, public beta = 0.02, public dCutoff = 1.0) {}

  filter(value: number, tMs: number) {
    const dt = this.tPrev === null ? 1 / 30 : Math.max(1e-3, (tMs - this.tPrev) / 1000);
    this.tPrev = tMs;
    const prev = this.x.last();
    const dValue = prev === null ? 0 : (value - prev) / dt;
    const edx = this.dx.filter(dValue, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alphaFor(cutoff, dt));
  }
  reset() { this.x.reset(); this.dx.reset(); this.tPrev = null; }
}

/** Filters an array of {x,y,z} landmarks component-wise. */
export class LandmarkSmoother {
  private filters: OneEuro[][] = [];
  constructor(private minCutoff = 1.2, private beta = 0.05) {}
  apply<T extends { x: number; y: number; z: number }>(pts: T[], tMs: number): T[] {
    if (this.filters.length !== pts.length) {
      this.filters = pts.map(() => [0, 1, 2].map(() => new OneEuro(this.minCutoff, this.beta)));
    }
    return pts.map((p, i) => ({
      ...p,
      x: this.filters[i][0].filter(p.x, tMs),
      y: this.filters[i][1].filter(p.y, tMs),
      z: this.filters[i][2].filter(p.z, tMs),
    }));
  }
  reset() { this.filters = []; }
}
