export type StartErrorKind = 'validation' | 'connection' | 'conflict' | 'unavailable' | 'server';

export interface StartErrorInfo {
  message: string;
  kind: StartErrorKind;
}

export function describeStartError(e: unknown): StartErrorInfo {
  const err = e as Error & { statusCode?: number; isTimeout?: boolean };
  const status = err?.statusCode;
  if (!status) {
    // Raw fetch/network errors ("Failed to fetch", etc.) are not player-facing.
    return {
      message: err?.isTimeout || err?.name === 'TimeoutError'
        ? 'Could not reach the game server in time. Check your connection and try again.'
        : 'Could not reach the game server. Check your connection and try again.',
      kind: 'connection',
    };
  }
  if (status === 422) {
    return { message: err.message || 'Please check your nickname and try again.', kind: 'validation' };
  }
  if (status === 409) {
    return {
      message: err.message || 'A round is already in progress on this kiosk. Retry to rejoin it.',
      kind: 'conflict',
    };
  }
  if (status === 503) {
    return {
      message: err.message || 'The game is currently unavailable. Please try again shortly.',
      kind: 'unavailable',
    };
  }
  if (status >= 500) {
    return { message: 'Something went wrong starting your round. Please try again.', kind: 'server' };
  }
  return { message: err.message || 'Failed to start. Please try again.', kind: 'server' };
}
