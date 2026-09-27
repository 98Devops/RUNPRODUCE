/**
 * Typed repository errors (D28, AD-93). Every repository call maps a database
 * error to exactly one of these, by SQLSTATE. A permission is never a
 * `MissingInput`, and "no parameter set in force" is a configuration error,
 * not a client fact.
 *
 * None extends another, so a `catch (e instanceof RepositoryError)` meant for
 * generic failures cannot swallow a `Forbidden`.
 */
export class RepositoryError extends Error {
  override readonly name = 'RepositoryError';
}
export class Forbidden extends Error {
  override readonly name = 'Forbidden';
}
export class IntegrityRejected extends Error {
  override readonly name = 'IntegrityRejected';
}
export class Conflict extends Error {
  override readonly name = 'Conflict';
}
export class StaleCorrection extends Error {
  override readonly name = 'StaleCorrection';
}
export class NoParametersInForce extends Error {
  override readonly name = 'NoParametersInForce';
}

export type TypedRepositoryError = RepositoryError | Forbidden | IntegrityRejected | Conflict | StaleCorrection | NoParametersInForce;

/** What PostgREST returns in `error` for a failed call. */
export interface DatabaseError {
  readonly code?: string | null;
  readonly message: string;
}

/**
 * D28's table. `asOf` is the date `NoParametersInForce` names, so the operator
 * knows which parameter set to create; only `engine_snapshot` raises RP002.
 */
export function mapDatabaseError(error: DatabaseError, context: { readonly asOf?: string } = {}): TypedRepositoryError {
  switch (error.code) {
    case '42501':
      return new Forbidden(error.message, { cause: error });
    case '23514':
      return new IntegrityRejected(error.message, { cause: error });
    case '23505':
      return new Conflict('Someone saved this date first. Reload.', { cause: error });
    case 'RP001':
      return new StaleCorrection('This record changed since you opened it.', { cause: error });
    case 'RP002':
      return new NoParametersInForce(`No parameter set is effective on ${context.asOf ?? 'that date'}.`, { cause: error });
    default:
      return new RepositoryError(`${error.code ?? 'unknown'}: ${error.message}`, { cause: error });
  }
}
