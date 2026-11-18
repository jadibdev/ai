import { APICallError } from '@ai-sdk/provider';
import { GatewayError } from '@ai-sdk/gateway';
import {
  retryWithExponentialBackoff,
  type RetryFunction,
  type ShouldRetryFunction,
} from '@ai-sdk/provider-utils';
import { RetryError } from './retry-error';

function normalizeHeaders(
  headers: Record<string, string | undefined> | undefined,
): Record<string, string | undefined> | undefined {
  if (headers == null) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function getErrorHeaders(
  error: unknown,
): Record<string, string | undefined> | undefined {
  if (error != null && APICallError.isInstance(error)) {
    return normalizeHeaders(error.responseHeaders);
  }

  if (
    error != null &&
    APICallError.isInstance((error as { cause?: unknown }).cause)
  ) {
    return normalizeHeaders(
      (error as { cause: APICallError }).cause.responseHeaders,
    );
  }

  return undefined;
}

export function getRetryDelayInMs({
  error,
  responseHeaders,
  exponentialBackoffDelay,
}: {
  error?: unknown;
  responseHeaders?: Record<string, string | undefined>;
  exponentialBackoffDelay: number;
}): number {
  const errorHeaders = getErrorHeaders(error);
  const resHeaders = normalizeHeaders(responseHeaders);

  const retryAfterMsVal =
    errorHeaders?.['retry-after-ms'] ?? resHeaders?.['retry-after-ms'];
  const retryAfterVal =
    errorHeaders?.['retry-after'] ?? resHeaders?.['retry-after'];

  if (retryAfterMsVal == null && retryAfterVal == null) {
    return exponentialBackoffDelay;
  }

  let ms: number | undefined;

  // retry-after-ms is more precise than retry-after and used by e.g. OpenAI
  if (retryAfterMsVal != null) {
    const timeoutMs = parseFloat(retryAfterMsVal);
    if (!Number.isNaN(timeoutMs)) {
      ms = timeoutMs;
    }
  }

  // About the Retry-After header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
  if (retryAfterVal != null && ms === undefined) {
    const timeoutSeconds = parseFloat(retryAfterVal);
    if (!Number.isNaN(timeoutSeconds)) {
      ms = timeoutSeconds * 1000;
    } else {
      ms = Date.parse(retryAfterVal) - Date.now();
    }
  }

  // check that the delay is reasonable:
  if (
    ms != null &&
    !Number.isNaN(ms) &&
    0 <= ms &&
    (ms < 60 * 1000 || ms < exponentialBackoffDelay)
  ) {
    return ms;
  }

  return exponentialBackoffDelay;
}

/**
 * The `retryWithExponentialBackoffRespectingRetryHeaders` strategy retries a failed API call with an exponential backoff,
 * while respecting rate limit headers (retry-after-ms and retry-after) if they are provided and reasonable (0-60 seconds).
 * You can configure the maximum number of retries, the initial delay, and the backoff factor.
 */
export const retryWithExponentialBackoffRespectingRetryHeaders = ({
  maxRetries = 2,
  initialDelayInMs = 2000,
  backoffFactor = 2,
  abortSignal,
  additionalRetryableError,
}: {
  maxRetries?: number;
  initialDelayInMs?: number;
  backoffFactor?: number;
  abortSignal?: AbortSignal;
  additionalRetryableError?: ShouldRetryFunction;
} = {}): RetryFunction =>
  retryWithExponentialBackoff({
    maxRetries,
    initialDelayInMs,
    backoffFactor,
    abortSignal,
    shouldRetry: async error =>
      (error instanceof Error &&
        ((APICallError.isInstance(error) && error.isRetryable === true) ||
          (GatewayError.isInstance(error) && error.isRetryable === true))) ||
      (additionalRetryableError != null &&
        (await additionalRetryableError(error))),
    getDelayInMs: ({ error, exponentialBackoffDelay }) =>
      getRetryDelayInMs({
        error: error as APICallError | GatewayError,
        exponentialBackoffDelay,
      }),
    createRetryError: ({ message, reason, errors }) =>
      new RetryError({ message, reason, errors }),
  });
