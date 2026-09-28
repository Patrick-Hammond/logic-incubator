const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['dist/', 'node_modules/', 'eslint.config.js', 'src/_lib/scripts/create-metadata.js']
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
  // Dependencies only point down: editor -> engine -> _lib.
  {
    // The engine owns the level format (engine/level/LevelFormat.ts); the editor only writes it.
    files: ['src/dungeon/engine/**/*.ts', 'src/dungeon/Constants.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ regex: '(^|/)editor(/|$)', message: 'The engine must not depend on the editor - it goes the other way.' }]
      }]
    }
  },
  {
    files: ['src/_lib/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ regex: '(^|/)dungeon(/|$)', message: '_lib must not depend on the dungeon engine or editor.' }]
      }]
    }
  }
);
