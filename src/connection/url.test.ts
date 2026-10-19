import { describe, expect, it } from 'vitest';
import { buildEndpoint, endpointFields, validateEndpoint } from './url';

describe('URL do WebOL', () => {
  it('monta local sem indústria e produção com indústria normalizada', () => {
    expect(buildEndpoint({ scheme: 'http', host: '10.11.0.11', industry: '' })).toBe(
      'http://10.11.0.11/webol',
    );
    expect(
      buildEndpoint({ scheme: 'https', host: 'trade.fidelize.com.br', industry: ' Sanofi ' }),
    ).toBe('https://trade.fidelize.com.br/sanofi/webol');
    expect(endpointFields('https://trade.fidelize.com.br/sanofi/webol')).toEqual({
      scheme: 'https',
      host: 'trade.fidelize.com.br',
      industry: 'sanofi',
    });
  });
  it('rejeita entrada do monólito, caminhos e credenciais inesperados', () => {
    expect(() => validateEndpoint('http://10.11.0.11')).toThrow('http://10.11.0.11/webol');
    for (const url of [
      'file:///webol',
      'http://user:pass@host/webol',
      'http://host/webol?r=x',
      'http://host/a/b/webol',
    ])
      expect(() => validateEndpoint(url)).toThrow();
    expect(() =>
      buildEndpoint({ scheme: 'http', host: '10.11.0.11/webol', industry: '' }),
    ).toThrow();
    expect(validateEndpoint('http://10.11.0.11/webol/index.php')).toBe('http://10.11.0.11/webol');
  });
});
