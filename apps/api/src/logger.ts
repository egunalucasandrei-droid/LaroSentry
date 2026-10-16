import pino from 'pino';
export const logger = pino({
  redact: [
    'password',
    'token',
    'secret',
    'cookie',
    'authorization',
    'email',
    'body',
    'req.headers.cookie',
    'req.headers.authorization',
  ],
  base: undefined,
});
