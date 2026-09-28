const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

// Packages reach each other by name (@logic-incubator/...), the way games do - never by a relative path into another package's folder.
const BY_NAME = { regex: '^\\.{1,2}/(.*/)?(packages|lib/src|engine/src|editor/src)(/|$)', message: 'Import another package by its name (@logic-incubator/...), not a relative path.' };

module.exports = tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'eslint.config.js', 'packages/engine/scripts/create-metadata.js']
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // TypeScript's own checker handles undefined identifiers.
      'no-undef': 'off',
      'no-console': 'off',
      'no-bitwise': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  // Dependencies only point down: editor -> engine -> lib.
  {
    files: ['packages/editor/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [BY_NAME] }]
    }
  },
  {
    // The engine owns the level format (level/LevelFormat.ts); the editor only writes it.
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [BY_NAME, { regex: '^@logic-incubator/editor(/|$)', message: 'The engine must not depend on the editor - it goes the other way.' }]
      }]
    }
  },
  {
    files: ['packages/lib/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [BY_NAME, { regex: '^@logic-incubator/(engine|editor)(/|$)', message: 'lib must not depend on the engine or editor.' }]
      }]
    }
  }
);
