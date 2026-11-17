/**
 * Node's ESM resolver wants explicit file extensions; the app's sources omit
 * them because Vite supplies them. This lets a plain `node --experimental-strip-types`
 * script import from src/ without a bundler or a second copy of the data.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    try { return await next(`${specifier}.ts`, context); } catch { /* fall through to the real specifier */ }
  }
  if (/\.json$/.test(specifier)) return next(specifier, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
  return next(specifier, context);
}

/**
 * Vite imports JSON bare; Node insists on `with { type: 'json' }`. The app's sources stay as Vite wants them,
 * and the attribute is supplied here for any JSON file they reach.
 */
export async function load(url, context, next) {
  if (!/\.json($|\?)/.test(url)) return next(url, context);
  return next(url, { ...context, importAttributes: { ...context.importAttributes, type: 'json' } });
}
