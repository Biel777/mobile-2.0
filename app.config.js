module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    ...(process.env.APP_VARIANT === 'development' ? ['./plugins/with-local-tradetools.cjs'] : []),
  ],
});
