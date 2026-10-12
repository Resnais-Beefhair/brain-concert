import type { Environment } from './state';
export function inputs(
  step: number,
  environment: Environment,
  impulses: readonly number[],
  pulsesUntil: readonly number[],
) {
  const t = (step * 0.2) / 1000;
  const rates =
    environment === 'still'
      ? [0, 0, 0, 0]
      : environment === 'storm'
        ? [
            10 + 25 * (1 + Math.sin(t * 0.6)),
            10 + 65 * Math.max(0, Math.sin(t * 3.1)) ** 4,
            1 + 4 * Math.max(0, Math.sin(t * 1.1)) ** 3,
            1 + 3 * Math.max(0, Math.cos(t * 0.7)) ** 3,
          ]
        : [
            20 + 50 * ((1 + Math.sin(t * 0.7)) / 2) ** 3,
            8 + 45 * ((1 + Math.sin(t * 1.13 + 1.4)) / 2) ** 5,
            0.5 + 2 * ((1 + Math.sin(t * 0.37 + 0.8)) / 2) ** 3,
            0.4 + 2 * ((1 + Math.cos(t * 0.53)) / 2) ** 3,
          ];
  for (let i = 0; i < 4; i++)
    if (step * 0.2 < pulsesUntil[i]) rates[i] = Math.max(rates[i], impulses[i]);
  return rates;
}
