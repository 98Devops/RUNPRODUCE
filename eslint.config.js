import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', 'Lib/**', 'Scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
