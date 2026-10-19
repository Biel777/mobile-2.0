import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';

it('inclui exceção HTTP somente no development e limita a um único host', async () => {
  const evaluate = (variant: string) => {
    const module = { exports: {} };
    runInNewContext(readFileSync(resolve('app.config.js'), 'utf8'), { module, process: { env: { APP_VARIANT: variant } } });
    return (module.exports as (input: { config: { plugins: string[] } }) => { plugins: string[] })({ config: { plugins: ['expo-router'] } });
  };
  expect(evaluate('development').plugins).toContain('./plugins/with-local-tradetools.cjs');
  expect(evaluate('preview').plugins).not.toContain('./plugins/with-local-tradetools.cjs');
  expect(evaluate('production').plugins).not.toContain('./plugins/with-local-tradetools.cjs');
  const files: string[] = [];
  let manifest: (config: any) => any;
  let write: (config: any) => Promise<any>;
  const module = { exports: {} };
  runInNewContext(readFileSync(resolve('plugins/with-local-tradetools.cjs'), 'utf8'), { module, require: (name: string) => {
    if (name === '@expo/config-plugins') return {
      withAndroidManifest: (config: unknown, callback: typeof manifest) => { manifest = callback; return config; },
      withDangerousMod: (config: unknown, [, callback]: [string, typeof write]) => { write = callback; return config; },
      AndroidConfig: { Manifest: { getMainApplicationOrThrow: (data: unknown) => data } },
    };
    if (name === 'node:fs/promises') return { mkdir: async () => {}, writeFile: async (_path: string, content: string) => { files.push(content); } };
    return { join: (...parts: string[]) => parts.join('/') };
  } });
  (module.exports as (config: object) => void)({});
  const result = manifest!({ modResults: { $: {} } });
  expect(result.modResults.$['android:usesCleartextTraffic']).toBe('false');
  await write!({ modRequest: { platformProjectRoot: '/generated/android' } });
  expect(files[0]).toContain('<base-config cleartextTrafficPermitted="false"');
  expect(files[0]).toContain('<domain includeSubdomains="false">10.11.0.11</domain>');
  expect(files[0].match(/<domain /g)).toHaveLength(1);
});
