/** Shared composition / remount validation errors (Phase 3.1). */

export class CompositionValidationError extends Error {
  readonly code = 'COMPOSITION_VALIDATION_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'CompositionValidationError';
  }
}
