import {
  resample,
  resampledLength,
  type ResampleMethod,
  type ResampleOptions,
  type SampleBuffer,
} from '@lp-labs/audio-resampler';
const input: SampleBuffer = new Float32Array([0, 1, 0]);
const method: ResampleMethod = 'windowed-sinc';
const options: ResampleOptions = { method, sincHalfWidth: 4 };
const output: Float32Array = resample(input, 8000, 16000, options);
output.length.toFixed();
resampledLength(3, 1, 2).toFixed();
// @ts-expect-error unknown method is rejected
resample(input, 1, 2, { method: 'cubic' });
// @ts-expect-error rates are numbers
resample(input, '1', 2);
