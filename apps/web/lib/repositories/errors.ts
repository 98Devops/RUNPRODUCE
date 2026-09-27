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

/**
 * Supabase Auth refused a sign-in (U7 D11). `code` is ours and stable;
 * `message` is the sentence the form shows. Auth's own message is never shown.
 */
export type SignInRefusedCode = 'invalid_credentials' | 'rate_limited' | 'account_disabled' | 'unreachable' | 'unknown';
export class SignInRefused extends Error {
  override readonly name = 'SignInRefused';
  constructor(
    readonly code: SignInRefusedCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}

/** What supabase-js returns in `error` for a failed auth call. */
export interface AuthFailure {
  readonly name?: string;
  readonly code?: string | undefined;
  readonly message: string;
}

/**
 * D11's table. A wrong password and an unknown email are one code and one
 * sentence, so the form never tells anyone which emails have accounts.
 */
export function mapAuthError(error: AuthFailure): SignInRefused {
  if (error.name === 'AuthRetryableFetchError') {
    return new SignInRefused('unreachable', "Can't reach the server. Check the connection and try again.", { cause: error });
  }
  switch (error.code) {
    case 'invalid_credentials':
      return new SignInRefused('invalid_credentials', 'Email or password is wrong.', { cause: error });
    case 'over_request_rate_limit':
      return new SignInRefused('rate_limited', 'Too many attempts. Wait a minute and try again.', { cause: error });
    case 'user_banned':
      return new SignInRefused('account_disabled', 'This account is switched off. Ask the owner.', { cause: error });
    default:
      return new SignInRefused('unknown', 'Sign-in failed. Try again.', { cause: error });
  }
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
