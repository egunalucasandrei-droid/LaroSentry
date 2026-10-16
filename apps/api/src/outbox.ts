import nodemailer from 'nodemailer';
import { db, type Tx } from './db.js';
import { decrypt, encrypt } from './crypto.js';
import { env } from './config.js';
import { logger } from './logger.js';
export function queueMail(tx: Tx, recipient: string, subject: string, body: string, dedupeKey: string) {
  return tx.outbox.create({ data: { recipient, subject, encryptedBody: encrypt(body), dedupeKey } });
}
let running = false;
export async function deliverMail() {
  if (running) return;
  running = true;
  try {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false,
      connectionTimeout: 5000,
      socketTimeout: 5000,
    });
    const jobs = await db.outbox.findMany({
      where: { deliveredAt: null, attempts: { lt: 10 }, nextAttemptAt: { lte: new Date() } },
      take: 10,
      orderBy: { createdAt: 'asc' },
    });
    for (const job of jobs) {
      try {
        await transport.sendMail({
          from: env.MAIL_FROM,
          to: job.recipient,
          subject: job.subject,
          text: decrypt(job.encryptedBody),
          messageId: `<${job.id}@larosentry.test>`,
        });
        await db.outbox.update({
          where: { id: job.id },
          data: { deliveredAt: new Date(), encryptedBody: encrypt('[delivered]') },
        });
      } catch {
        await db.outbox.update({
          where: { id: job.id },
          data: {
            attempts: { increment: 1 },
            nextAttemptAt: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** job.attempts)),
          },
        });
        logger.warn({ event: 'mail_delivery_retry', jobId: job.id });
      }
    }
  } catch {
    logger.error({ event: 'outbox_unavailable' });
  } finally {
    running = false;
  }
}
