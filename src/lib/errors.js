import * as Sentry from '@sentry/react';

/**
 * Capture an error and send it to Sentry.
 * Use this everywhere instead of console.error.
 *
 * @param {Error|string} err   - The error object or message
 * @param {object}       ctx   - Extra context (e.g. { context: 'pushActivities', userId })
 */
export function captureError(err, ctx = {}) {
  let error;
  if (err instanceof Error) {
    error = err;
  } else if (err && typeof err === 'object') {
    // Supabase/PostgREST errors are plain objects ({ message, code, details, hint }),
    // not Error instances — String(obj) is "[object Object]" and loses everything.
    error = new Error(err.message || err.error_description || JSON.stringify(err));
    for (const k of ['code', 'details', 'hint']) if (err[k] != null) ctx = { ...ctx, [k]: err[k] };
  } else {
    error = new Error(String(err));
  }

  // Always log to console so dev tools still work
  console.error(`[${ctx.context || 'app'}]`, error.message, ctx);

  // Send to Sentry with extra context
  Sentry.withScope(scope => {
    if (ctx.context) scope.setTag('context', ctx.context);
    Object.entries(ctx).forEach(([k, v]) => scope.setExtra(k, v));
    Sentry.captureException(error);
  });
}
