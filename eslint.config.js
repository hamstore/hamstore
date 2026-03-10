/* eslint-disable max-lines */
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import vitestGlobals from 'eslint-config-vitest-globals/flat';
import importPlugin from 'eslint-plugin-import';
import preferArrow from 'eslint-plugin-prefer-arrow';
import prettier from 'eslint-plugin-prettier';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/build/**',
      '.pnpm-store/**',
      './docs/.docusaurus/**',
    ],
  },
  vitestGlobals(),
  // Base configuration for all files
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es6,
      },
    },
    plugins: {
      'prefer-arrow': preferArrow,
      import: importPlugin,
      prettier,
    },
    rules: {
      ...js.configs.recommended.rules,
      'prettier/prettier': 'error',
      'import/extensions': 0,
      'import/no-unresolved': 0,
      'import/prefer-default-export': 0,
      'import/no-duplicates': 'error',
      complexity: ['error', 8],
      'max-lines': ['error', 200],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      eqeqeq: ['error', 'smart'],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          optionalDependencies: false,
          peerDependencies: false,
        },
      ],
      'no-shadow': [
        'error',
        {
          hoist: 'all',
        },
      ],
      'prefer-const': 'error',
      'padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: '*',
          next: 'return',
        },
      ],
      'prefer-arrow/prefer-arrow-functions': [
        'error',
        {
          disallowPrototype: true,
          singleReturnOnly: false,
          classPropertiesAllowed: false,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@hamstore/*/*'],
              message:
                'import of internal modules must be done at the root level.',
            },
          ],
          paths: [
            {
              name: 'lodash',
              message: 'Please use lodash/{module} import instead',
            },
            {
              name: 'aws-sdk',
              message: 'Please use aws-sdk/{module} import instead',
            },
            {
              name: '.',
              message: 'Please use explicit import file',
            },
          ],
        },
      ],
      curly: ['error', 'all'],
    },
  },
  // TypeScript-specific configuration
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: [
          './packages/*/tsconfig.json',
          './docs/tsconfig.json',
          './demo/*/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'prefer-arrow': preferArrow,
      import: importPlugin,
      prettier,
    },
    rules: {
      // Disable base rules that are overridden by TypeScript rules
      'no-shadow': 'off',
      'no-unused-vars': 'off',
      // No-redeclare is checked by typescript. It must be disabled: https://typescript-eslint.io/rules/no-redeclare/
      'no-redeclare': 'off',

      // TypeScript ESLint rules
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/explicit-member-accessibility': 0,
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/prefer-string-starts-ends-with': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Re-apply base rules
      'prettier/prettier': 'error',
      'import/extensions': 0,
      'import/no-unresolved': 0,
      'import/prefer-default-export': 0,
      'import/no-duplicates': 'error',
      complexity: ['error', 8],
      'max-lines': ['error', 200],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'padding-line-between-statements': [
        'error',
        {
          blankLine: 'always',
          prev: '*',
          next: 'return',
        },
      ],
      'prefer-arrow/prefer-arrow-functions': [
        'error',
        {
          disallowPrototype: true,
          singleReturnOnly: false,
          classPropertiesAllowed: false,
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@hamstore/*/*'],
              message:
                'import of internal modules must be done at the root level.',
            },
          ],
          paths: [
            {
              name: 'lodash',
              message: 'Please use lodash/{module} import instead',
            },
            {
              name: 'aws-sdk',
              message: 'Please use aws-sdk/{module} import instead',
            },
            {
              name: '.',
              message: 'Please use explicit import file',
            },
          ],
        },
      ],
      curly: ['error', 'all'],
    },
  },
  // Configuration for source files (non-test files)
  {
    files: ['**/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: false,
          optionalDependencies: false,
          peerDependencies: true,
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      complexity: 'off',
    },
  },
  {
    files: ['**/*.type.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
