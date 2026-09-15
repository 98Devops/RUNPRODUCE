/**
 * Where the database tests may run, decided before any connection exists.
 *
 * Standing rule: the database job runs against a local stack, a CI-only project
 * or a throwaway branch. Never the dev project directly, never production. So
 * this guard is stricter than the app's client factory (AD-94): the dev ref is
 * refused here outright.
 */
export const DEV_PROJECT_REF = 'zlvjmaorlxrjnuxhykuh';

export interface DbTestEnv {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly dbUrl: string;
}

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL'] as const;

function isLocalHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost';
}

/** The project ref in a hosted Supabase URL or pooler/db host, or null if none. */
export function projectRefOf(value: string): string | null {
  const match = /([a-z]{20})(?=\.supabase\.(co|com))/.exec(value) ?? /postgres\.([a-z]{20})/.exec(value);
  return match?.[1] ?? null;
}

export function resolveDbTestEnv(source: NodeJS.ProcessEnv): DbTestEnv {
  const missing = REQUIRED.filter((key) => !source[key]);
  if (missing.length > 0) {
    throw new Error(
      `test:db needs ${missing.join(', ')}. Refusing to run: a skipped integrity suite reports green.`
    );
  }
  const url = source['SUPABASE_URL'] as string;
  const dbUrl = source['SUPABASE_DB_URL'] as string;
  const apiHost = new URL(url).hostname;
  const dbHost = new URL(dbUrl).hostname;

  for (const value of [url, dbUrl]) {
    if (projectRefOf(value) === DEV_PROJECT_REF) {
      throw new Error('test:db refuses the dev project: database tests never run against dev directly.');
    }
  }

  if (isLocalHost(apiHost) && isLocalHost(dbHost)) {
    return { url, dbUrl, anonKey: source['SUPABASE_ANON_KEY'] as string, serviceRoleKey: source['SUPABASE_SERVICE_ROLE_KEY'] as string };
  }

  const ciRef = source['RUNPRODUCE_CI_PROJECT_REF'];
  if (
    source['RUNPRODUCE_SUPABASE_TARGET'] === 'ci' &&
    ciRef !== undefined &&
    ciRef !== DEV_PROJECT_REF &&
    projectRefOf(url) === ciRef &&
    projectRefOf(dbUrl) === ciRef
  ) {
    return { url, dbUrl, anonKey: source['SUPABASE_ANON_KEY'] as string, serviceRoleKey: source['SUPABASE_SERVICE_ROLE_KEY'] as string };
  }

  throw new Error(
    `test:db refuses target ${apiHost}: only a local stack, or the CI project with ` +
      'RUNPRODUCE_SUPABASE_TARGET=ci and a matching RUNPRODUCE_CI_PROJECT_REF.'
  );
}
