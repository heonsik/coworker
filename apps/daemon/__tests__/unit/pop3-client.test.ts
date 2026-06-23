import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { testPop3Connection } from '../../src/pop3-client.js';

const servers: Server[] = [];

interface Pop3ServerOptions {
  authOk?: boolean;
  uidlOk?: boolean;
  delayGreetingMs?: number;
  delayUidlMs?: number;
}

async function startPop3Server(options: Pop3ServerOptions = {}): Promise<number> {
  const server = createServer((socket) => {
    let buffer = '';

    const writeGreeting = () => {
      socket.write('+OK test server ready\r\n');
    };
    if (options.delayGreetingMs) {
      setTimeout(writeGreeting, options.delayGreetingMs);
    } else {
      writeGreeting();
    }

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n');
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        handleCommand(socket, line, options);
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  servers.push(server);

  return (server.address() as AddressInfo).port;
}

function handleCommand(socket: Socket, line: string, options: Pop3ServerOptions): void {
  if (line.startsWith('USER')) {
    socket.write('+OK user accepted\r\n');
    return;
  }
  if (line.startsWith('PASS')) {
    socket.write(options.authOk === false ? '-ERR invalid password\r\n' : '+OK logged in\r\n');
    return;
  }
  if (line === 'UIDL') {
    if (options.uidlOk === false) {
      socket.write('-ERR uidl unsupported\r\n');
    } else {
      const writeUidl = () => {
        socket.write('+OK\r\n1 abc\r\n2 def\r\n.\r\n');
      };
      if (options.delayUidlMs) {
        setTimeout(writeUidl, options.delayUidlMs);
      } else {
        writeUidl();
      }
    }
    return;
  }
  if (line === 'QUIT') {
    socket.write('+OK bye\r\n');
    socket.end();
  }
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe('testPop3Connection', () => {
  it('authenticates with USER/PASS and counts UIDL rows', async () => {
    const port = await startPop3Server();

    const result = await testPop3Connection({
      host: '127.0.0.1',
      port,
      useTls: false,
      username: 'user@example.com',
      password: 'secret',
      timeoutMs: 500,
    });

    expect(result).toEqual({ ok: true, uidlSupported: true, messageCount: 2 });
  });

  it('returns a sanitized authentication error', async () => {
    const port = await startPop3Server({ authOk: false });

    const result = await testPop3Connection({
      host: '127.0.0.1',
      port,
      useTls: false,
      username: 'user@example.com',
      password: 'secret',
      timeoutMs: 500,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('POP3 authentication failed. Check the username and password.');
    expect(result.error).not.toContain('secret');
    expect(result.error).not.toContain('user@example.com');
  });

  it('keeps a successful login when UIDL is unsupported', async () => {
    const port = await startPop3Server({ uidlOk: false });

    const result = await testPop3Connection({
      host: '127.0.0.1',
      port,
      useTls: false,
      username: 'user@example.com',
      password: 'secret',
      timeoutMs: 500,
    });

    expect(result).toEqual({ ok: true, uidlSupported: false, messageCount: 0 });
  });

  it('times out when the server does not send a greeting', async () => {
    const port = await startPop3Server({ delayGreetingMs: 200 });

    const result = await testPop3Connection({
      host: '127.0.0.1',
      port,
      useTls: false,
      username: 'user@example.com',
      password: 'secret',
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: false,
      uidlSupported: false,
      error: 'POP3 connection timed out.',
    });
  });

  it('does not treat UIDL timeouts as UIDL unsupported', async () => {
    const port = await startPop3Server({ delayUidlMs: 200 });

    const result = await testPop3Connection({
      host: '127.0.0.1',
      port,
      useTls: false,
      username: 'user@example.com',
      password: 'secret',
      timeoutMs: 50,
    });

    expect(result).toEqual({
      ok: false,
      uidlSupported: false,
      error: 'POP3 connection timed out.',
    });
  });
});
