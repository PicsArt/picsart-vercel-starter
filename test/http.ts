export const CLIENT_IP = '203.0.113.7';

export interface Called {
  status: number;
  body: any;
  text: string;
  headers: Headers;
}

export function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': CLIENT_IP, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export async function call(
  handler: (request: Request) => Promise<Response>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Called> {
  const response = await handler(post(path, body, headers));
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : undefined, text, headers: response.headers };
}
