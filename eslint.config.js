const expo = require('eslint-config-expo/flat');

/**
 * Expo's shared config (expo-router conventions, React hooks rules, import
 * resolution for the @/ alias) plus the few house rules below.
 *
 * Flat config: the array is ordered and later entries win. Note that Expo
 * registers the @typescript-eslint plugin only for TS files, so any rule from
 * that plugin has to be scoped to the same globs or ESLint cannot resolve it.
 */
module.exports = [
  {
    ignores: [
      'node_modules/',
      '.expo/',
      // `expo export` output, per platform.
      'dist-android/',
      'dist-ios/',
      'expo-env.d.ts',
    ],
  },

  ...expo,

  {
    rules: {
      // `console.log` left in a release build ships noise to users' logs;
      // warn and error are deliberate and stay allowed.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // An unused variable is a bug signal, not a style preference — but an
      // intentionally ignored argument should say so with a leading underscore.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
];
