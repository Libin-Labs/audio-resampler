import test from 'node:test';
import assert from 'node:assert/strict';
import { resample, resampledLength } from '../dist/esm/index.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
}
const signal = (n, seed = 1) => Float64Array.from({ length: n }, rng(seed));

function referenceLinear(x, inRate, outRate) {
  const n = Math.max(1, Math.round((x.length * outRate) / inRate));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i * inRate) / outRate;
    let lo = 0;
    while (lo + 1 <= t && lo < x.length - 1) lo++;
    const hi = Math.min(lo + 1, x.length - 1);
    out.push(x[lo] + (x[hi] - x[lo]) * (t - lo));
  }
  return out;
}

function referenceSinc(x, inRate, outRate, half) {
  const n = Math.max(1, Math.round((x.length * outRate) / inRate));
  const fc = Math.min(1, outRate / inRate);
  const reach = half / fc;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i * inRate) / outRate;
    let num = 0;
    let den = 0;
    for (let k = 0; k < x.length; k++) {
      const d = k - t;
      if (Math.abs(d) >= reach) continue;
      const arg = Math.PI * fc * d;
      const s = d === 0 ? 1 : Math.sin(arg) / arg;
      const phase = (Math.PI * (d + reach)) / reach;
      const w = 0.42 - 0.5 * Math.cos(phase) + 0.08 * Math.cos(2 * phase);
      num += fc * s * w * x[k];
      den += fc * s * w;
    }
    out.push(Math.abs(den) < 1e-12 ? 0 : num / den);
  }
  return out;
}

const close = (actual, expected, tolerance) => {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      `index ${i}: ${actual[i]} vs ${expected[i]}`,
    );
  }
};

test('rejects malformed inputs, rates, options and budgets', () => {
  assert.throws(() => resample('abc', 1, 2), TypeError);
  assert.throws(() => resample(new Int16Array(2), 1, 2), TypeError);
  assert.throws(() => resample([1, Number.NaN], 1, 2), RangeError);
  assert.throws(() => resample([1, 'x'], 1, 2), RangeError);
  assert.throws(() => resample(new Float32Array([Infinity]), 1, 2), RangeError);
  for (const rate of [0, -1, Number.NaN, Infinity, '1', undefined]) {
    assert.throws(() => resample([1], rate, 2), RangeError);
    assert.throws(() => resample([1], 1, rate), RangeError);
  }
  assert.throws(() => resample([1], 1, 2, null), TypeError);
  assert.throws(() => resample([1], 1, 2, { method: 'cubic' }), TypeError);
  for (const sincHalfWidth of [0, 65, 1.5, Number.NaN]) {
    assert.throws(() => resample([1], 1, 2, { sincHalfWidth }), RangeError);
  }
  assert.throws(() => resample([1, 2], 1, 10, { maxOutputSamples: 19 }), RangeError);
  assert.throws(() => resample([1], 1, 2, { maxOutputSamples: -1 }), RangeError);
  assert.throws(
    () => resample(new Float32Array(100), 1, 1, { method: 'windowed-sinc', maxOperations: 100 }),
    RangeError,
  );
  assert.throws(() => resampledLength(1.5, 1, 1), RangeError);
});

test('resampledLength rounds explicitly', () => {
  assert.equal(resampledLength(0, 44100, 48000), 0);
  assert.equal(resampledLength(1, 48000, 8000), 1);
  assert.equal(resampledLength(441, 44100, 48000), 480);
  assert.equal(resampledLength(5, 2, 1), 3);
});

test('linear matches an independent bracket-search reference', () => {
  for (const [n, a, b] of [
    [64, 8000, 11025],
    [50, 48000, 16000],
    [33, 3, 7],
    [1, 1, 5],
    [10, 1, 1],
  ]) {
    const x = signal(n, n);
    close(resample(x, a, b), referenceLinear(x, a, b), 1e-6);
  }
  assert.equal(resample([], 1, 2).length, 0);
});

test('windowed sinc matches a full-sum independent reference', () => {
  for (const [n, a, b, half] of [
    [80, 8000, 12000, 8],
    [90, 48000, 16000, 4],
    [40, 3, 5, 2],
  ]) {
    const x = signal(n, a);
    close(
      resample(x, a, b, { method: 'windowed-sinc', sincHalfWidth: half }),
      referenceSinc(x, a, b, half),
      1e-6,
    );
  }
});

test('same-rate sinc is identity on exact sample positions and linear returns a copy', () => {
  const x = signal(40, 9);
  const sinc = resample(x, 100, 100, { method: 'windowed-sinc' });
  close(sinc, Array.from(x), 1e-6);
  const copy = resample(x, 100, 100);
  assert.notEqual(copy.buffer, x.buffer);
  close(copy, Array.from(x), 1e-6);
});

test('sinc reproduces a low-frequency sine in the interior', () => {
  const x = Float64Array.from({ length: 400 }, (_, i) => Math.sin(2 * Math.PI * 0.03 * i));
  const y = resample(x, 1000, 2500, { method: 'windowed-sinc', sincHalfWidth: 16 });
  for (let i = 100; i < y.length - 100; i++) {
    assert.ok(Math.abs(y[i] - Math.sin(2 * Math.PI * 0.03 * ((i * 1000) / 2500))) < 2e-3);
  }
});

test('downsampling: linear does not filter aliases, sinc attenuates them', () => {
  const x = Float64Array.from({ length: 1000 }, (_, i) => Math.sin(2 * Math.PI * 0.4 * i));
  const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
  const linear = resample(x, 2, 1);
  const sinc = resample(x, 2, 1, { method: 'windowed-sinc' });
  assert.ok(rms(linear.subarray(50, 450)) > 0.6);
  assert.ok(rms(sinc.subarray(50, 450)) < 0.05);
});

test('outputs are owned and inputs untouched, including frozen arrays', () => {
  const frozen = Object.freeze([0, 1, 2, 3]);
  const out = resample(frozen, 1, 2);
  assert.ok(out instanceof Float32Array);
  assert.deepEqual(frozen, [0, 1, 2, 3]);
  out[0] = 99;
  assert.equal(resample(frozen, 1, 2)[0], 0);
});
