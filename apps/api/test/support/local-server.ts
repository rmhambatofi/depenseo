// Serveur HTTP local qui enregistre les requêtes et répond selon une fonction (API externes simulées).
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface LocalServer {
  origin: string;
  received: ReceivedRequest[];
  close: () => Promise<void>;
}

export async function localServer(
  reply: (r: ReceivedRequest) => { status: number; body?: object },
): Promise<LocalServer> {
  const received: ReceivedRequest[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c: string) => (body += c));
    req.on('end', () => {
      const r = { method: req.method ?? '', path: req.url ?? '', headers: req.headers, body };
      received.push(r);
      const { status, body: out } = reply(r);
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(out ? JSON.stringify(out) : '');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
