// @ts-check

/** @type {import('eslint').Linter.FlatConfig[]} */
const base = [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // General
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'object-shorthand': 'error',
      'no-unused-vars': 'off', // handled by @typescript-eslint
    },
  },
];

/** @type {import('eslint').Linter.FlatConfig[]} */
const typescript = [
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
];

/** @type {import('eslint').Linter.FlatConfig[]} */
const react = [
  {
    rules: {
      'react/jsx-key': 'error',
      'react/no-unknown-property': 'error',
      'react/no-array-index-key': 'warn',
      'react/self-closing-comp': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

module.exports = { base, typescript, react };
