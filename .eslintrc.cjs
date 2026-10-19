module.exports = {
  root: true, env: { node: true }, extends: ['expo'], ignorePatterns: ['dist/', '.expo/', 'node_modules/'],
  rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }], 'no-unused-vars': 'off' },
  overrides: [{ files: ['app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'], rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: ['@rules', '@rules/*', '@tradetools', '@tradetools/*', '@data', '@data/*', '**/bff/rules/**', '**/bff/tradetools/**', '**/domain/**', '**/api', '**/api/**', '**/sync/**', '**/data/**'], message: 'A tela deve usar @bff/cases ou @bff/contract.' }] }]
  } }]
};
