import { randomUUID } from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfirmation } from './validation.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = directory;
const assetRoot = path.resolve(directory, '..', 'assets');
const maxBodySize = 10_000;
const rateLimit = 5;
const rateWindowMs = 15 * 60 * 1000;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function resolveWithin(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

function setSecurityHeaders(response) {
  response.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; style-src 'self' https://fonts.googleapis.com");
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxBodySize) {
      throw new Error('Request too large');
    }
  }
  return JSON.parse(body || '{}');
}

function getClientIp(request, trustProxy) {
  if (trustProxy) {
    return request.headers['x-forwarded-for']?.split(',')[0].trim() || 'unknown';
  }
  return request.socket.remoteAddress || 'unknown';
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function webhookAddress(webhookUrl, webhookToken) {
  if (!webhookToken) {
    return webhookUrl;
  }
  const url = new URL(webhookUrl);
  url.searchParams.set('token', webhookToken);
  return url.toString();
}

export function createLandingPagesServer({ webhookUrl = process.env.ASSEMBLEIA_SHEETS_WEBHOOK_URL, webhookToken = process.env.ASSEMBLEIA_SHEETS_WEBHOOK_TOKEN, fetchImplementation = fetch, trustProxy = process.env.LANDING_PAGES_TRUST_PROXY === 'true' } = {}) {
  const attempts = new Map();

  function isRateLimited(request) {
    const now = Date.now();
    const ip = getClientIp(request, trustProxy);
    const recent = (attempts.get(ip) || []).filter((time) => now - time < rateWindowMs);
    recent.push(now);
    attempts.set(ip, recent);
    return recent.length > rateLimit;
  }

  return http.createServer(async (request, response) => {
    setSecurityHeaders(response);
    const url = new URL(request.url, 'http://localhost');

    try {
      if (request.method === 'POST' && url.pathname === '/api/owntime-assembleia/confirmacoes') {
        if (!request.headers['content-type']?.startsWith('application/json') || !isAllowedOrigin(request)) {
          sendJson(response, 400, { error: 'Solicitação inválida.' });
          return;
        }
        if (isRateLimited(request)) {
          sendJson(response, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });
          return;
        }

        const confirmation = validateConfirmation(await readJson(request));
        if (confirmation.blocked) {
          sendJson(response, 204, {});
          return;
        }
        if (confirmation.error) {
          sendJson(response, 400, { error: confirmation.error });
          return;
        }
        if (!webhookUrl) {
          sendJson(response, 503, { error: 'A confirmação online ainda não está disponível.' });
          return;
        }

        const submissionId = randomUUID();
        const submittedAt = new Date().toISOString();
        const webhookResponse = await fetchImplementation(webhookAddress(webhookUrl, webhookToken), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Idempotency-Key': submissionId
          },
          body: JSON.stringify({
            submissionId,
            source: 'owntime-assembleia',
            submittedAt,
            titular: {
              nomeRazaoSocial: confirmation.value.titular,
              cpfCnpj: confirmation.value.documento
            },
            telefone: confirmation.value.telefone,
            status: 'presenca-confirmada',
            consentimento: {
              contatoRd: true,
              aceitoEm: submittedAt
            }
          }),
          signal: AbortSignal.timeout(10_000)
        });

        const responseType = webhookResponse.headers?.get?.('content-type') || '';
        const webhookBody = responseType.includes('application/json') ? await webhookResponse.json() : null;
        if (!webhookResponse.ok || webhookBody?.ok === false) {
          sendJson(response, 502, { error: 'Não foi possível registrar sua confirmação. Tente novamente.' });
          return;
        }
        sendJson(response, 201, { ok: true });
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { error: 'Método não permitido.' });
        return;
      }

      if (url.pathname === '/owntime-assembleia') {
        response.writeHead(308, { Location: '/owntime-assembleia/' });
        response.end();
        return;
      }
      const pagePath = url.pathname === '/' || url.pathname === '/owntime-assembleia/'
        ? 'owntime-assembleia/index.html'
        : url.pathname.startsWith('/owntime-assembleia/')
          ? path.join('owntime-assembleia', decodeURIComponent(url.pathname.slice('/owntime-assembleia/'.length)))
          : null;
      const filePath = url.pathname.startsWith('/assets/')
        ? resolveWithin(assetRoot, decodeURIComponent(url.pathname.slice('/assets/'.length)))
        : pagePath && resolveWithin(siteRoot, pagePath);
      if (!filePath) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      const data = await fs.readFile(filePath);
      response.writeHead(200, {
        'Content-Type': contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=86400' : 'no-store'
      });
      if (request.method === 'GET') {
        response.end(data);
      } else {
        response.end();
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Not found');
        return;
      }
      if (error.message === 'Request too large' || error instanceof SyntaxError) {
        sendJson(response, 400, { error: 'Solicitação inválida.' });
        return;
      }
      sendJson(response, 500, { error: 'Não foi possível concluir a solicitação. Tente novamente.' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.LANDING_PAGES_PORT || 4180);
  createLandingPagesServer().listen(port, () => {
    console.log(`Landing pages listening on http://localhost:${port}`);
  });
}
