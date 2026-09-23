/**
 * Typed repository errors (D28, AD-93). Every repository call maps a database
 * error to exactly one of these, by SQLSTATE. A permission is never a
 * `MissingInput`, and "no parameter set in force" is a configuration error,
 * not a client fact.
 *
 * RED PHASE STUB (chunk 7): the classes exist so tests can name them; nothing
 * maps to them yet.
 */
export class RepositoryError extends Error {}
export class Forbidden extends Error {}
export class IntegrityRejected extends Error {}
export class Conflict extends Error {}
export class StaleCorrection extends Error {}
export class NoParametersInForce extends Error {}
