# @lp-labs/audio-resampler

Resamples one finite mono channel with linear interpolation or a Blackman-windowed sinc kernel. Catalog identity 484; standalone package version 1.0.0.
No runtime, peer, or sibling dependencies. Node >=18, ESM and CommonJS with declarations.

## Install

```sh
npm install @lp-labs/audio-resampler
```

## Quickstart (runnable JavaScript)

```js
import assert from 'node:assert/strict';
import { resample, resampledLength } from '@lp-labs/audio-resampler';
const input = new Float32Array([0, 1, 0, -1]);
const doubled = resample(input, 8000, 16000);
assert.equal(doubled.length, resampledLength(4, 8000, 16000));
assert.deepEqual(Array.from(doubled), [0, 0.5, 1, 0.5, 0, -0.5, -1, -1]);
const smooth = resample(input, 8000, 16000, { method: 'windowed-sinc', sincHalfWidth: 4 });
assert.equal(smooth.length, 8);
```

## Configuration and errors

Options: `method` is `linear` (default) or `windowed-sinc`; `sincHalfWidth` is an integer 1..64 (default 8) in input samples at unity cutoff; `maxOutputSamples` (default 16777216) and `maxOperations` (default 2^30 kernel multiply-adds) are budgets. Output sample i is evaluated at input position `i * inputRate / outputRate`; output length is `max(1, round(n * outputRate / inputRate))` (0 for empty input).

Errors: `TypeError` for non-Float32Array/Float64Array/array input, non-object options or unknown method; `RangeError` for non-finite samples, non-positive or non-finite rates, invalid half width or limits, and exceeded budgets. Failures happen before any output is returned.

## Complete public declarations

Every runtime export and public type is shown below. This is the complete emitted declaration surface.

```ts
export type SampleBuffer = Float32Array | Float64Array | readonly number[];
export type ResampleMethod = 'linear' | 'windowed-sinc';
export interface ResampleOptions {
  method?: ResampleMethod;
  sincHalfWidth?: number;
  maxOutputSamples?: number;
  maxOperations?: number;
}
export declare const DEFAULT_MAX_OUTPUT_SAMPLES = 16777216;
export declare const DEFAULT_MAX_OPERATIONS = 1073741824;
export declare function resampledLength(
  inputLength: number,
  inputRate: number,
  outputRate: number,
): number;
export declare function resample(
  input: SampleBuffer,
  inputRate: number,
  outputRate: number,
  options?: ResampleOptions,
): Float32Array;
```

## Performance, boundaries and limitations

Mono only; resample each channel separately. Input is never modified and output is always a new `Float32Array` (samples are stored in single precision). Linear interpolation holds the last sample beyond the end and applies **no** anti-alias or image filtering, so downsampling aliases content above the new Nyquist. The windowed-sinc method scales its cutoff to the lower Nyquist when downsampling and truncates the kernel at the signal edges (missing samples count as zero, weights are renormalised to unit DC gain). It is a short finite Blackman-windowed kernel with a gradual transition band and finite stop-band attenuation; it is not a high-quality, polyphase or mastering-grade converter and does not claim to be. No dithering, bit-depth conversion or codec handling. Cost is O(n) for linear and O(outputLength * halfWidth / cutoff) for sinc.

## Development

```sh
npm ci --offline
npm run build
npm run typecheck
npm test
npm run format:check
```

The offline install requires the locked development dependencies already in the npm cache.
Build emits separate ESM/CJS and declarations; type checks include bare-package .mts/.cts consumers with negative cases.
Runtime tests import only the single-quoted standalone dist entry and also run against installed offline tarballs.
No build artifacts or development dependencies are required at runtime.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
