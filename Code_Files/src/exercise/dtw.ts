import { V2, dist, resample } from '../vision/geometry';

/** Dynamic Time Warping: mean aligned distance between a performed and a reference path. */
export function dtwMeanDistance(a: V2[], b: V2[], n = 40) {
  if (a.length < 2 || b.length < 2) return Infinity;
  const A = resample(a, n), B = resample(b, n);
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(Infinity));
  const steps: number[][] = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  D[0][0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      const c = dist(A[i - 1], B[j - 1]);
      let best = D[i - 1][j - 1], s = steps[i - 1][j - 1];
      if (D[i - 1][j] < best) { best = D[i - 1][j]; s = steps[i - 1][j]; }
      if (D[i][j - 1] < best) { best = D[i][j - 1]; s = steps[i][j - 1]; }
      D[i][j] = c + best; steps[i][j] = s + 1;
    }
  }
  return D[n][n] / steps[n][n];
}

/** Map DTW distance (body units) to a 0-100 neatness score relative to the corridor tolerance. */
export function accuracyScore(performed: V2[], ref: V2[], tolerance: number) {
  const d = dtwMeanDistance(performed, ref);
  if (!isFinite(d)) return 0;
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - d / (tolerance * 1.5)))));
}
