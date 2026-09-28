/**
 * The repository layer's only entry point. Tests import from here, never from
 * a module directly, so a consumer's route is the route under test
 * (code-standards.md, "Passing tests do not prove a module is reachable").
 */
export { loadEngineInput } from './load-engine-input.js';
export {
  createRepositoryClient,
  DEV_PROJECT_REF,
  resolveProjectTarget,
  type ProjectTarget,
  type RepositoryClientOptions
} from './client.js';
// `createAdminClient` is deliberately not exported here (D29): import it from
// `./admin.js`, which lint allows only in seed, the DB tests and scheduled functions.
export {
  createSessionClient,
  type CookieJar,
  type SessionClientOptions,
  type SessionCookie,
  type SessionCookieWrite
} from './session.js';
export {
  currentUser,
  myMemberships,
  ROLES,
  signIn,
  signOut,
  type Credentials,
  type Membership,
  type Role,
  type SignedInUser
} from './auth.js';
export {
  Conflict,
  Forbidden,
  IntegrityRejected,
  mapAuthError,
  mapDatabaseError,
  NoParametersInForce,
  RepositoryError,
  SignInRefused,
  StaleCorrection,
  type AuthFailure,
  type DatabaseError,
  type SignInRefusedCode,
  type TypedRepositoryError
} from './errors.js';
// The enum runtime arrays live beside their unions in the engine (AD-92); the
// repository layer re-exports them because its Zod enums are built from them.
export {
  CHANNELS,
  CONFIDENCES,
  DELIVERY_MODES,
  ENTRY_SOURCES,
  OVERHEAD_BASES,
  OVERHEAD_KEYS,
  OVERHEAD_TIMINGS,
  PHASE_SOURCES,
  PHASES,
  PRICING_BASES,
  SALE_PRICING_BASES
} from '@runproduce/engine';
