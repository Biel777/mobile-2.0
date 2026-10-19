export type EndpointFields = { scheme: 'http' | 'https'; host: string; industry: string };

export function buildEndpoint({ scheme, host, industry }: EndpointFields): string {
  const domain = host.trim().toLowerCase();
  const tenant = industry.trim().toLowerCase();
  if (!['http', 'https'].includes(scheme) || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(domain)) {
    throw new Error('Informe apenas o host, sem protocolo ou caminho.');
  }
  if (tenant && !/^[a-z0-9_-]+$/.test(tenant)) throw new Error('Código da indústria inválido.');
  return validateEndpoint(`${scheme}://${domain}${tenant ? `/${tenant}` : ''}/webol`);
}

export function validateEndpoint(input: string): string {
  const value = input
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/index\.php$/, '');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Informe uma URL HTTP ou HTTPS válida.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('A URL deve usar HTTP ou HTTPS, sem credenciais, consulta ou fragmento.');
  }
  if (!/^\/(?:[a-z0-9_-]+\/)?webol$/.test(url.pathname)) {
    throw new Error(`Caminho inválido. Sugestão: ${url.origin}/webol`);
  }
  return `${url.origin}${url.pathname}`;
}

export function endpointFields(base: string): EndpointFields {
  const url = new URL(validateEndpoint(base));
  return {
    scheme: url.protocol === 'http:' ? 'http' : 'https',
    host: url.host,
    industry: url.pathname.split('/').slice(1, -1).join(''),
  };
}

export function transportEndpoint(base: string, platform: string, development: boolean): string {
  if (platform === 'web' && development && new URL(base).origin === 'http://10.11.0.11') {
    return `${window.location.origin}${new URL(base).pathname}`;
  }
  return base;
}
