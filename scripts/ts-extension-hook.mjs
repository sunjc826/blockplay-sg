/**
 * Node's ESM resolver wants explicit file extensions; the app's sources omit
 * them because Vite supplies them. This lets a plain `node --experimental-strip-types`
 * script import from src/ without a bundler or a second copy of the data.
 */
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$/.test(specifier)) {
    try { return await next(`${specifier}.ts`, context); } catch { /* fall through to the real specifier */ }
  }
  return next(specifier, context);
}
