/**
 * Phase 3.2 — Deploy/start vertical configuration.
 *
 * Reads ACTIVE_VERTICAL_ID from the process environment once at startup.
 * Unset → restaurant (safe production default).
 * Empty / whitespace / unknown → CompositionValidationError (fail-closed).
 *
 * NOT runtime switching: change env and restart the process.
 */
import { CompositionValidationError } from './errors';
import { ACTIVE_VERTICAL_ID, getEnabledModules, resolveKnownVertical } from './registry';
import { OPERVIA_RESTAURANT_VERTICAL_ID } from './verticals';

/** Environment variable name (deploy/start). Matches operational docs. */
export const ACTIVE_VERTICAL_ENV_KEY = 'ACTIVE_VERTICAL_ID';

/** Locked id after commitActiveVerticalFromEnv / startServer. */
let lockedActiveVerticalId: string | undefined;

/**
 * Pure resolver: read env → valid vertical id or throw.
 * Does not mutate process state. Prefer this in unit tests.
 */
export function resolveActiveVerticalId(env: NodeJS.ProcessEnv = process.env): string {
  if (!Object.prototype.hasOwnProperty.call(env, ACTIVE_VERTICAL_ENV_KEY)) {
    return OPERVIA_RESTAURANT_VERTICAL_ID;
  }

  const raw = env[ACTIVE_VERTICAL_ENV_KEY];
  if (raw === undefined) {
    return OPERVIA_RESTAURANT_VERTICAL_ID;
  }

  const trimmed = String(raw).trim();
  if (trimmed === '') {
    throw new CompositionValidationError(
      `${ACTIVE_VERTICAL_ENV_KEY} is empty. Fail-closed: refusing restaurant fallback.`,
    );
  }

  // Validates against VERTICALS ∪ SYNTHETIC_VERTICALS (includes retail-test).
  resolveKnownVertical(trimmed);
  return trimmed;
}

/**
 * Resolve from process.env and lock for the process lifetime.
 * Called once from startServer before registerRoutes / listen.
 */
export function commitActiveVerticalFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const id = resolveActiveVerticalId(env);
  lockedActiveVerticalId = id;
  return id;
}

/** Active vertical for enablement / remount when no explicit override is passed. */
export function getCommittedActiveVerticalId(): string {
  if (lockedActiveVerticalId !== undefined) {
    return lockedActiveVerticalId;
  }
  // Before commit (tests / early callers): resolve without locking.
  return resolveActiveVerticalId();
}

/** Test isolation — clear process lock between cases. */
export function resetActiveVerticalResolutionForTests(): void {
  lockedActiveVerticalId = undefined;
}

/**
 * Safe operator-facing composition summary (no secrets).
 */
export function formatStartupCompositionDiagnostics(verticalId?: string): string {
  const id = verticalId || getCommittedActiveVerticalId();
  const vertical = resolveKnownVertical(id);
  const modules = getEnabledModules(id);
  const lines: string[] = [
    `[Operavia Startup Composition]`,
    `Active vertical: ${vertical.id} (${vertical.name})`,
    `Enabled modules:`,
  ];
  for (const moduleId of modules) {
    lines.push(`- ${moduleId}`);
  }
  lines.push(`Default constant (unset env): ${ACTIVE_VERTICAL_ID}`);
  return lines.join('\n');
}

/** Log composition at boot when not production. Never throws. */
export function logStartupCompositionIfAppropriate(verticalId?: string): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    console.info(formatStartupCompositionDiagnostics(verticalId));
  } catch {
    // Diagnostics must never block a valid start.
  }
}
