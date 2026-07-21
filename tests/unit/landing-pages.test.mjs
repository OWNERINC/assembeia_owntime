import assert from 'node:assert/strict';
import test from 'node:test';
import { createLandingPagesServer } from '../../landing-pages/server.mjs';
import { validateConfirmation } from '../../landing-pages/validation.mjs';

test('validates and normalizes a confirmation', () => {
  assert.deepEqual(validateConfirmation({
    titular: '  Maria   da Silva ',
    documento: '529.982.247-25',
    telefone: '(54) 99999-0000',
    consentimento: true
  }), {
    value: {
      titular: 'Maria da Silva',
      documento: '52998224725',
      telefone: '54999990000'
    }
  });
});

test('rejects invalid documents and missing consent', () => {
  assert.equal(validateConfirmation({
    titular: 'Maria da Silva',
    documento: '111.111.111-11',
    telefone: '54999990000',
    consentimento: true
  }).error, 'Informe um CPF ou CNPJ válido.');

  assert.equal(validateConfirmation({
    titular: 'Empresa Exemplo',
    documento: '04.252.011/0001-10',
    telefone: '54999990000',
    consentimento: false
  }).error, 'O aceite para contato é obrigatório.');
});

test('forwards a valid confirmation without exposing the webhook', async () => {
  let received;
  const server = createLandingPagesServer({
    webhookUrl: 'https://rd.example.test/webhook',
    fetchImplementation: async (url, options) => {
      received = { url, headers: options.headers, body: JSON.parse(options.body) };
      return { ok: true };
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/owntime-assembleia/confirmacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titular: 'Empresa Exemplo',
        documento: '04.252.011/0001-10',
        telefone: '(54) 99999-0000',
        consentimento: true
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(received.url, 'https://rd.example.test/webhook');
    assert.equal(received.body.titular.cpfCnpj, '04252011000110');
    assert.equal(received.body.telefone, '54999990000');
    assert.equal(received.body.status, 'presenca-confirmada');
    assert.match(received.headers['X-Idempotency-Key'], /^[0-9a-f-]{36}$/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('adds the configured Sheets webhook token without exposing it to the browser', async () => {
  let receivedUrl;
  const server = createLandingPagesServer({
    webhookUrl: 'https://script.google.com/macros/s/example/exec',
    webhookToken: 'secret-token',
    fetchImplementation: async (url) => {
      receivedUrl = url;
      return { ok: true };
    }
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/owntime-assembleia/confirmacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titular: 'Maria da Silva',
        documento: '529.982.247-25',
        telefone: '(54) 99999-0000',
        consentimento: true
      })
    });
    assert.equal(response.status, 201);
    assert.equal(receivedUrl, 'https://script.google.com/macros/s/example/exec?token=secret-token');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('returns a failure when the Sheets webhook rejects a confirmation', async () => {
  const server = createLandingPagesServer({
    webhookUrl: 'https://script.google.com/macros/s/example/exec',
    fetchImplementation: async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ok: false })
    })
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/owntime-assembleia/confirmacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titular: 'Maria da Silva',
        documento: '529.982.247-25',
        telefone: '(54) 99999-0000',
        consentimento: true
      })
    });
    assert.equal(response.status, 502);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('serves the isolated landing page and keeps confirmations unavailable without a webhook', async () => {
  const server = createLandingPagesServer({ webhookUrl: '' });
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const page = await fetch(`http://127.0.0.1:${port}/owntime-assembleia/`);
    assert.equal(page.status, 200);
    const pageMarkup = await page.text();
    assert.match(pageMarkup, /Convocação para Assembleia Geral Com Uso/);
    assert.match(pageMarkup, /29 de julho de 2026/);
    assert.match(pageMarkup, /operações iniciadas em 03\/07\/2026/);
    assert.match(pageMarkup, /1ª\. convocação - 8h30/);
    assert.match(pageMarkup, /confirme sua presença até 26\/07\/2026/);
    assert.doesNotMatch(pageMarkup, /Nest/);
    assert.match(pageMarkup, /href="\/owntime-assembleia\/styles.css"/);
    assert.match(pageMarkup, /src="\/owntime-assembleia\/form.js"/);
    assert.match(pageMarkup, /Logo%20reduzido%20preto\.webp/);
    assert.match(pageMarkup, /data-edital-frame/);
    assert.match(pageMarkup, /data-edital-dialog/);
    assert.match(pageMarkup, /Para participar pelo celular ou tablet/);
    assert.match(pageMarkup, /apps\.apple\.com\/app\/zoom-workplace/);
    assert.match(pageMarkup, /play\.google\.com\/store\/apps\/details\?id=us\.zoom\.videomeetings/);

    const stylesheet = await fetch(`http://127.0.0.1:${port}/owntime-assembleia/styles.css`);
    assert.equal(stylesheet.status, 200);
    assert.equal(stylesheet.headers.get('content-type'), 'text/css; charset=utf-8');

    const internalFile = await fetch(`http://127.0.0.1:${port}/server.mjs`);
    assert.equal(internalFile.status, 404);

    const logo = await fetch(`http://127.0.0.1:${port}/assets/owntime/Logo%20reduzido%20preto.webp`);
    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get('content-type'), 'image/webp');

    const confirmation = await fetch(`http://127.0.0.1:${port}/api/owntime-assembleia/confirmacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titular: 'Maria da Silva',
        documento: '529.982.247-25',
        telefone: '(54) 99999-0000',
        consentimento: true
      })
    });
    assert.equal(confirmation.status, 503);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
