module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'], plugins: [['module-resolver', { alias: {
    '@bff': './src/bff', '@rules': './src/bff/rules', '@tradetools': './src/bff/tradetools', '@data': './src/data', '@components': './src/components'
  } }]] };
};
