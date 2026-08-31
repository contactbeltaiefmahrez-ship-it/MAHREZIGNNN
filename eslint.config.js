import tseslint from 'typescript-eslint';
import boundaries from './tools/eslint/module-boundaries.js';

export default [
  { ignores: ['node_modules/**', 'dist/**', '**/*.d.ts', '**/.next/**', 'apps/web/.next/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['modules/**/*.ts'],
    plugins: { markyra: { rules: { 'module-boundaries': boundaries } } },
    rules: { 'markyra/module-boundaries': 'error' },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Math.random is banned in domain code: rotation, allocation and ranking must be deterministic and reproducible.',
        },
      ],
    },
  },
];
