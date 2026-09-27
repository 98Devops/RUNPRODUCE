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
  Conflict,
  Forbidden,
  IntegrityRejected,
  mapDatabaseError,
  NoParametersInForce,
  RepositoryError,
  StaleCorrection,
  type DatabaseError,
  type TypedRepositoryError
} from './errors.js';
// The enum runtime arrays live beside their unions in the engine (AD-92); the
// repository layer re-exports them because its Zod enums are built from them.
export {
  CHANNELS,
  CONFIDENCES,
  DELIVERY_MODES,
  OVERHEAD_BASES,
  OVERHEAD_KEYS,
  OVERHEAD_TIMINGS,
  PHASES,
  PRICING_BASES,
  SALE_PRICING_BASES
} from '@runproduce/engine';
