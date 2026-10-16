import { env } from './config.js';
// An adapter sends a short-lived challenge; it never decides verification status.
export interface SmsAdapter {
  send(phone: string, code: string): Promise<void>;
  mode: 'local' | 'webhook' | 'unavailable';
}
const localAllowed =
  env.NODE_ENV !== 'production' &&
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(env.APP_ORIGIN).hostname);
export function smsAdapter(): SmsAdapter {
  if (process.env.SMS_PROVIDER === 'local' && localAllowed) return { mode: 'local', send: async () => {} };
  if (
    process.env.SMS_PROVIDER === 'webhook' &&
    process.env.SMS_WEBHOOK_URL?.startsWith('https://') &&
    process.env.SMS_API_KEY
  )
    return {
      mode: 'webhook',
      send: async (phone, code) => {
        const result = await fetch(process.env.SMS_WEBHOOK_URL!, {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(8000),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_API_KEY}` },
          body: JSON.stringify({
            to: phone,
            message: `LaroSentry verification code: ${code}. Expires in 5 minutes. Do not share this code.`,
          }),
        });
        if (!result.ok) throw new Error('SMS delivery was not accepted');
      },
    };
  return {
    mode: 'unavailable',
    send: async () => {
      throw new Error('SMS unavailable');
    },
  };
}
