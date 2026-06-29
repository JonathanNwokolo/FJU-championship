const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

const globals = {
  __DEV__: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  console: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  fetch: 'readonly',
  global: 'readonly',
  it: 'readonly',
  jest: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
};

module.exports = [
  {
    ignores: [
      'android/**',
      'coverage/**',
      'dist/**',
      'expo-*.log',
      'node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-console': 'off',
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
