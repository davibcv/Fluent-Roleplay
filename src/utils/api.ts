import { getAiConfigHeaders } from './aiConfig';

/**
 * Custom fetch wrapper that automatically forwards the user's custom AI provider configurations
 * if configured in their local storage.
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof input === 'string' && input.startsWith('/api/')) {
    init = init || {};
    let headers: Headers;
    if (init.headers instanceof Headers) {
      headers = init.headers;
    } else if (Array.isArray(init.headers)) {
      headers = new Headers(init.headers);
    } else {
      headers = new Headers((init.headers as Record<string, string>) || {});
    }

    const aiHeaders = getAiConfigHeaders();
    Object.entries(aiHeaders).forEach(([key, val]) => {
      headers.set(key, val);
    });

    init.headers = headers;
  }

  return fetch(input, init);
}

