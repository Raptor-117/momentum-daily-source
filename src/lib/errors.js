import * as Sentry from '@sentry/react';

/**
 * Capture an error and send it to Sentry.
 * Use this everywhere instead of console.error.
 *
 * @param {Error|string} err   - The error object or message
 * @param {object}       ctx   - Extra context (e.g. { context: 'pushActivities', userId })
 */
export function captureError(err, ctx = {}) {
  const error = err instanceof Error ? err : new Error(String(err));

  // Always log to console so dev tools still work
  console.error(`[${ctx.context || 'app'}]`, error.message, ctx);

  // Send to Sentry with extra context
  Sentry.withScope(scope => {
    if (ctx.context) scope.setTag('context', ctx.context);
    Object.entries(ctx).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(error);
  });
}
