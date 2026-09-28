import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// T-RP5's import restrictions, shared by the per-file blocks below.
const NO_CREATE_CLIENT = {
  name: '@supabase/supabase-js',
  importNames: ['createClient'],
  message: 'Create clients through lib/repositories (createRepositoryClient), which runs the project-ref guard (AD-94).'
};
const NO_SSR = {
  name: '@supabase/ssr',
  message: 'Session clients come from lib/repositories/session.ts (createSessionClient), behind the guard (U7 D10).'
};
const NO_BROWSER_CLIENT = {
  name: '@supabase/ssr',
  importNames: ['createBrowserClient'],
  message: 'No browser client: sign-in and capture go through server actions (U7 D10).'
};
const NO_ADMIN = {
  group: ['admin', 'admin.js', '**/repositories/admin', '**/repositories/admin.js'],
  message: 'The service-role client is for seed, the DB tests and netlify/functions only (AD-94).'
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.netlify/**',
      'apps/web/out/**',
      '**/next-env.d.ts',
      'Lib/**',
      'Scripts/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Match tsc's noUnusedParameters convention: a leading underscore marks a
    // parameter that is deliberately unused, such as a stub's input.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  },
  {
    // T-RP5 (D29, AD-94): one client factory, and the service role out of the
    // request path. Extended by U7 D10: `@supabase/ssr` only in session.ts.
    files: ['apps/web/**/*.{ts,tsx}'],
    ignores: [
      'apps/web/lib/repositories/client.ts',
      'apps/web/lib/repositories/admin.ts',
      'apps/web/lib/repositories/session.ts',
      'apps/web/tests/repositories/session.test.ts'
    ],
    rules: {
      'no-restricted-imports': ['error', { paths: [NO_CREATE_CLIENT, NO_SSR], patterns: [NO_ADMIN] }]
    }
  },
  {
    // The session factory and its test may use createServerClient, never a browser client.
    files: ['apps/web/lib/repositories/session.ts', 'apps/web/tests/repositories/session.test.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: [NO_CREATE_CLIENT, NO_BROWSER_CLIENT], patterns: [NO_ADMIN] }]
    }
  },
  {
    files: ['apps/web/lib/repositories/client.ts', 'apps/web/lib/repositories/admin.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: [NO_SSR] }] }
  },
  {
    // The factory's own test exercises admin.ts directly; nothing else in apps/web may.
    files: ['apps/web/tests/repositories/client.test.ts'],
    rules: { 'no-restricted-imports': 'off' }
  },
  {
    // T-DB1 / T-RP5: repositories read the public views and functions, never the
    // facts schema or a version table directly.
    files: ['apps/web/lib/repositories/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/facts\\.|_versions/]',
          message: 'Repositories never name facts.* or a *_versions table (T-DB1).'
        },
        {
          selector: 'TemplateElement[value.raw=/facts\\.|_versions/]',
          message: 'Repositories never name facts.* or a *_versions table (T-DB1).'
        }
      ]
    }
  },
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'Engine is pure: pass asOf in explicitly (invariant 1).' },
        { name: 'fetch', message: 'Engine performs no I/O (invariant 1).' },
        { name: 'process', message: 'Engine reads no environment (invariant 1).' }
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Engine is deterministic: no Math.random (invariant 1).'
        },
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Engine reads no environment (invariant 1).'
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'Engine is pure: pass asOf in explicitly (invariant 1).'
        }
      ],
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
);
