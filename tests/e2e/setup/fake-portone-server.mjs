// 가짜 포트원 서버를 127.0.0.1:4010에 켠다(E2E, #592 2차). playwright.config.ts의 webServer가 앱 서버보다 먼저 켠다.
// 처리 규칙은 fake-portone.mjs. 내 컴퓨터 주소(127.0.0.1)에서만 듣는다.

import { createServer } from 'node:http';

import { createFakePortOneState, FAKE_PORTONE, handleFakePortOne } from './fake-portone.mjs';

const state = createFakePortOneState();

const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    const text = Buffer.concat(chunks).toString('utf8');
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const { status, body: out } = handleFakePortOne(state, {
      method: req.method ?? 'GET',
      url: req.url ?? '/',
      headers: { authorization: req.headers.authorization },
      body,
    });
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(out));
  });
});

server.listen(FAKE_PORTONE.port, '127.0.0.1', () => {
  console.log(`가짜 포트원 서버: ${FAKE_PORTONE.url}`);
});
