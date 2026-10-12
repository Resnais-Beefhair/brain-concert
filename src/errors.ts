import type { Key } from './i18n';

export const errorKeys = {
  DATA_MANIFEST: 'dataFetchError',
  DATA_FETCH: 'dataFetchError',
  DATA_SCHEMA: 'dataError',
  DATA_HASH: 'dataError',
  DATA_SHAPE: 'dataError',
  DATA_NODE: 'dataError',
  DATA_TARGET: 'dataError',
  DATA_POSITION: 'dataError',
  DATA_METADATA: 'dataError',
  WEBGPU_UNAVAILABLE: 'unsupported',
  WEBGPU_ADAPTER_UNAVAILABLE: 'unsupported',
  GPU_BUFFER_LIMIT: 'gpuLimitError',
  GPU_DEVICE_LOST: 'deviceLost',
  GPU_BUSY: 'unexpectedError',
  INVALID_ADVANCE: 'unexpectedError',
  INVALID_CELL: 'unexpectedError',
  GPU_SHADER: 'gpuStartError',
  GPU_VALIDATION: 'gpuStartError',
  GPU_DEVICE: 'gpuStartError',
  RECORD_UNAVAILABLE: 'recordUnsupported',
} satisfies Record<string, Key>;

export function errorKey(error: unknown): Key {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.replace(/^Error:\s*/, '').split(/[\s:]/, 1)[0];
  return Object.hasOwn(errorKeys, code)
    ? errorKeys[code as keyof typeof errorKeys]
    : 'unexpectedError';
}
