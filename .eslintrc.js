module.exports = {
  root: true,
  extends: '@react-native',
  plugins: ['i18next'],
  rules: {
    // Every user-visible string must go through i18n (6 languages at launch).
    'i18next/no-literal-string': [
      'error',
      {
        mode: 'jsx-only',
        'jsx-attributes': { include: ['label', 'title', 'placeholder', 'accessibilityLabel', 'accessibilityHint'] },
      },
    ],
    'react-native/no-inline-styles': 'off',
  },
  overrides: [
    {
      // Dev-only surfaces and tests may use literal strings.
      files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx', 'src/features/showcase/**', 'src/features/dev/**', 'src/dev/**'],
      rules: { 'i18next/no-literal-string': 'off' },
    },
  ],
};
