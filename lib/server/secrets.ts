import 'server-only';

export function picsartApiKey(): string | undefined {
  const key = process.env.PICSART_API_KEY?.trim();
  return key ? key : undefined;
}

export function redact(text: string, secret: string | undefined): string {
  return secret ? text.split(secret).join('[redacted]') : text;
}
