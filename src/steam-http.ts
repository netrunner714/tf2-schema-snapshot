/**
 * HTTP client helper for Steam Web API with automatic retries,
 * exponential backoff, and 429 (Too Many Requests) rate limit protection.
 */

export type FetchWithRetryOptions = {
  maxRetries?: number;
  initialDelayMs?: number;
  fetchImpl?: typeof fetch;
};

export async function fetchSteamApiWithRetry(
  url: string | URL,
  init?: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const { maxRetries = 4, initialDelayMs = 1500, fetchImpl = fetch } = options;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetchImpl(url, init);

    // Return immediately if status is not 429 or server error (5xx)
    if (res.status !== 429 && res.status < 500) {
      return res;
    }

    if (attempt === maxRetries) {
      return res;
    }

    const retryAfterHeader = res.headers.get("Retry-After");
    let waitMs = delay;
    if (retryAfterHeader) {
      const parsedSeconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
        waitMs = Math.min(parsedSeconds * 1000, 15000);
      }
    }

    // Add small jitter to prevent synchronized retry thundering herds
    const jitter = Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, waitMs + jitter));

    delay *= 2;
  }

  return fetchImpl(url, init);
}
