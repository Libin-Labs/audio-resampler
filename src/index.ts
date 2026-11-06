export type SampleBuffer = Float32Array | Float64Array | readonly number[];
export type ResampleMethod = 'linear' | 'windowed-sinc';

export interface ResampleOptions {
  method?: ResampleMethod;
  /** Sinc half width in input samples at unity cutoff (1..64, default 8). */
  sincHalfWidth?: number;
  maxOutputSamples?: number;
  /** Upper bound on kernel multiply-adds (default 2^30). */
  maxOperations?: number;
}

export const DEFAULT_MAX_OUTPUT_SAMPLES = 16_777_216;
export const DEFAULT_MAX_OPERATIONS = 1_073_741_824;

function assertRate(name: string, value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function assertLimit(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
  return value;
}

function assertSamples(input: unknown): asserts input is SampleBuffer {
  if (!(input instanceof Float32Array || input instanceof Float64Array || Array.isArray(input))) {
    throw new TypeError('input must be a Float32Array, Float64Array or number array');
  }
  const values = input as ArrayLike<unknown>;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RangeError(`input[${i}] must be a finite number`);
    }
  }
}

/** Number of output samples: 0 for empty input, otherwise max(1, round(length * outputRate / inputRate)). */
export function resampledLength(
  inputLength: number,
  inputRate: number,
  outputRate: number,
): number {
  if (!Number.isSafeInteger(inputLength) || inputLength < 0) {
    throw new RangeError('inputLength must be a non-negative safe integer');
  }
  assertRate('inputRate', inputRate);
  assertRate('outputRate', outputRate);
  if (inputLength === 0) return 0;
  const length = Math.max(1, Math.round((inputLength * outputRate) / inputRate));
  if (!Number.isSafeInteger(length)) throw new RangeError('output length is not representable');
  return length;
}

function sincKernel(distance: number, cutoff: number, support: number): number {
  if (Math.abs(distance) >= support) return 0;
  const x = cutoff * distance;
  const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
  const u = distance / support;
  const window = 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u);
  return cutoff * sinc * window;
}

/**
 * Resamples one finite mono channel. Output sample i is evaluated at input position
 * i * inputRate / outputRate. The result is a new Float32Array; the input is never modified.
 */
export function resample(
  input: SampleBuffer,
  inputRate: number,
  outputRate: number,
  options: ResampleOptions = {},
): Float32Array {
  assertSamples(input);
  if (typeof options !== 'object' || options === null)
    throw new TypeError('options must be an object');
  const method = options.method ?? 'linear';
  if (method !== 'linear' && method !== 'windowed-sinc') {
    throw new TypeError('method must be linear or windowed-sinc');
  }
  const halfWidth = options.sincHalfWidth ?? 8;
  if (!Number.isInteger(halfWidth) || halfWidth < 1 || halfWidth > 64) {
    throw new RangeError('sincHalfWidth must be an integer from 1 to 64');
  }
  const maxOutput = assertLimit(
    'maxOutputSamples',
    options.maxOutputSamples,
    DEFAULT_MAX_OUTPUT_SAMPLES,
  );
  const maxOperations = assertLimit('maxOperations', options.maxOperations, DEFAULT_MAX_OPERATIONS);
  const length = resampledLength(input.length, inputRate, outputRate);
  if (length > maxOutput)
    throw new RangeError(`output of ${length} samples exceeds maxOutputSamples`);
  const output = new Float32Array(length);
  if (length === 0) return output;
  const last = input.length - 1;
  const step = inputRate / outputRate;
  if (method === 'linear') {
    for (let i = 0; i < length; i++) {
      const position = i * step;
      const base = Math.floor(position);
      const a = input[Math.min(base, last)]!;
      const b = input[Math.min(base + 1, last)]!;
      output[i] = a + (b - a) * (position - base);
    }
    return output;
  }
  const cutoff = Math.min(1, outputRate / inputRate);
  const support = halfWidth / cutoff;
  if (length * (2 * support + 1) > maxOperations) {
    throw new RangeError('kernel work exceeds maxOperations');
  }
  for (let i = 0; i < length; i++) {
    const position = i * step;
    const from = Math.max(0, Math.ceil(position - support));
    const to = Math.min(last, Math.floor(position + support));
    let sum = 0;
    let weights = 0;
    for (let k = from; k <= to; k++) {
      const weight = sincKernel(k - position, cutoff, support);
      sum += weight * input[k]!;
      weights += weight;
    }
    output[i] = Math.abs(weights) < 1e-12 ? 0 : sum / weights;
  }
  return output;
}
