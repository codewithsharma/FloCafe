/**
 * Express 5 ParamsDictionary values are `string | string[]`.
 * Normalize a single path/query param to a string without casting the whole request.
 */
export function routeParam(value: string | string[] | undefined | null): string {
  if (value == null) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

/** Prefer when a numeric id string is required; empty string if missing. */
export function routeParamId(value: string | string[] | undefined | null): string {
  return routeParam(value);
}
