import log from "loglevel";

/**
 * Same shape as structlog on the backend: a constant message plus named fields, never
 * values interpolated into the string. `logger.error("job failed", { jobId })` renders as
 * an inspectable object in devtools.
 *
 * loglevel persists the level to localStorage, so verbosity can be raised in a deployed
 * build from the console — `log.setLevel("debug")` — without a rebuild.
 *
 * No JSON output here on purpose: frontend logs go to the console and nowhere else, and a
 * structured logger that could ship them cost 21 kB gzip against loglevel's 1.3 kB.
 * Revisit if frontend telemetry ever gets an actual destination.
 *
 * Never pass a JWT, an Authorization header or a raw API response body.
 */
log.setLevel(import.meta.env.DEV ? "debug" : "warn");

export const logger = log;
