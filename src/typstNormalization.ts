export function normalizeWebTypstSource(source: string): string {
  const reservedFunctions = new Set(['rgb', 'text', 'upright', 'frac']);
  return source
    .replace(/(^|[^#.\w"])([A-Za-z_]{2,})\s*\(/g, (_, prefix: string, ident: string) =>
      reservedFunctions.has(ident) ? `${prefix}${ident}(` : `${prefix}upright("${ident}")(`
    )
    .replace(/\b([A-Za-z])([0-9]+)\b/g, '$1_$2');
}

export function buildMathRenderSources(source: string): string[] {
  const normalized = normalizeWebTypstSource(source);
  return normalized === source ? [source] : [source, normalized];
}
