// Учебная «биржа» как локальный сервер — для проверки моста и журнала без настоящих ключей.
//
//   node scripts/mock-exchange.mjs            слушает http://localhost:8787
//   TVX_BRIDGE_MOCK=http://localhost:8787 node scripts/build-extension.mjs --dev
//
// Ключи (секрет у всех — mock-secret): mock-binance-read, mock-bybit-read — только чтение;
// mock-binance-trade, mock-bybit-trade — с правом торговли, мост обязан их отклонить.
import { createServer } from 'node:http'
import { createMock } from './mock-exchange-core.mjs'

export function startMockExchange(port = 8787) {
  const mock = createMock()
  const server = createServer((req, res) => {
    const r = mock.handle(req.url ?? '/', req.headers)
    res.writeHead(r.status, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...r.headers })
    res.end(JSON.stringify(r.body))
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, mock, url: `http://localhost:${port}` })))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await startMockExchange(Number(process.env.PORT) || 8787)
  console.log(`учебная биржа: ${url}  (ключи: mock-binance-read, mock-bybit-read; секрет: mock-secret)`)
}
