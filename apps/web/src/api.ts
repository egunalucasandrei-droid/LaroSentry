export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const csrf = document.cookie
    .split('; ')
    .find((v) => v.startsWith('ls_csrf='))
    ?.split('=')[1];
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      'Unable to reach LaroSentry. Check your connection and try again. No success has been confirmed.',
      0,
    );
  }
  const data = await response
    .json()
    .catch(() => ({ message: 'The service returned an unexpected response.' }));
  if (!response.ok) throw new ApiError(data.message ?? 'Something went wrong.', response.status);
  return data as T;
}
export const post = <T>(path: string, body: unknown = {}, headers?: Record<string, string>) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body), headers });
