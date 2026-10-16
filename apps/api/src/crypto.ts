import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { env } from './config.js';
export const token = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const privateHash = (value: string) =>
  createHmac('sha256', Buffer.from(env.DATA_KEY, 'hex')).update(value).digest('hex');
export function encrypt(text: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(env.DATA_KEY, 'hex'), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((v) => v.toString('base64url')).join('.');
}
export function decrypt(value: string) {
  const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Invalid encrypted data');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env.DATA_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
