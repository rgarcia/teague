import pino, { type LoggerOptions } from "pino";
import type { PrettyOptions } from "pino-pretty";

const opts = {
  level: process.env.LOG_LEVEL || "info",
  // Only use pretty printing in non-production
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      } as PrettyOptions,
    },
  }),
} as LoggerOptions;

export const log = pino(opts);
export const loggerOptions = opts;
export const loggerOptionsStderr = {
  ...opts,
  transport: {
    ...opts.transport,
    options: {
      ...opts.transport?.options,
      destination: 2,
    },
  },
} as LoggerOptions;
