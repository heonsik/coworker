import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { Socket } from 'node:net';
import type {
  EmailConnectionTestInput,
  EmailConnectionTestResult,
} from '@accomplish_ai/agent-core';

const DEFAULT_TIMEOUT_MS = 15_000;

class Pop3ProtocolError extends Error {
  constructor(
    message: string,
    readonly code: 'auth' | 'network' | 'timeout' | 'protocol' | 'uidl',
  ) {
    super(message);
  }
}

function sanitizePop3Error(err: unknown): string {
  if (err instanceof Pop3ProtocolError) {
    if (err.code === 'auth') {
      return 'POP3 authentication failed. Check the username and password.';
    }
    if (err.code === 'timeout') {
      return 'POP3 connection timed out.';
    }
    if (err.code === 'uidl') {
      return 'POP3 login succeeded, but UIDL is not supported by this server.';
    }
    return 'POP3 connection failed.';
  }
  return 'POP3 connection failed.';
}

class Pop3Connection {
  private buffer = '';
  private ended = false;

  constructor(private readonly socket: Socket) {
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      this.buffer += chunk;
    });
    socket.on('end', () => {
      this.ended = true;
    });
    socket.on('close', () => {
      this.ended = true;
    });
  }

  close(): void {
    this.socket.destroy();
  }

  async readLine(timeoutMs: number): Promise<string> {
    return await this.waitFor((buffer) => {
      const index = buffer.indexOf('\r\n');
      if (index < 0) {
        return null;
      }
      const line = buffer.slice(0, index);
      this.buffer = buffer.slice(index + 2);
      return line;
    }, timeoutMs);
  }

  async readMultiline(timeoutMs: number): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await this.readLine(timeoutMs);
      if (line === '.') {
        return lines;
      }
      lines.push(line.startsWith('..') ? line.slice(1) : line);
    }
  }

  async command(command: string, timeoutMs: number): Promise<string> {
    this.socket.write(`${command}\r\n`);
    const response = await this.readLine(timeoutMs);
    if (response.startsWith('-ERR')) {
      let code: Pop3ProtocolError['code'] = 'protocol';
      if (command.startsWith('PASS') || command.startsWith('USER')) {
        code = 'auth';
      } else if (command === 'UIDL') {
        code = 'uidl';
      }
      throw new Pop3ProtocolError(response, code);
    }
    if (!response.startsWith('+OK')) {
      throw new Pop3ProtocolError(response, 'protocol');
    }
    return response;
  }

  private async waitFor<T>(consume: (buffer: string) => T | null, timeoutMs: number): Promise<T> {
    const existing = consume(this.buffer);
    if (existing !== null) {
      return existing;
    }

    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Pop3ProtocolError('timeout', 'timeout'));
      }, timeoutMs);

      const onData = () => {
        const result = consume(this.buffer);
        if (result !== null) {
          cleanup();
          resolve(result);
        }
      };
      const onError = () => {
        cleanup();
        reject(new Pop3ProtocolError('socket error', 'network'));
      };
      const onClose = () => {
        if (!this.ended) {
          return;
        }
        cleanup();
        reject(new Pop3ProtocolError('connection closed', 'network'));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        this.socket.off('data', onData);
        this.socket.off('error', onError);
        this.socket.off('close', onClose);
      };

      this.socket.on('data', onData);
      this.socket.on('error', onError);
      this.socket.on('close', onClose);
    });
  }
}

function openSocket(input: EmailConnectionTestInput): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = input.useTls
      ? tlsConnect({
          host: input.host,
          port: input.port,
          servername: input.host,
          rejectUnauthorized: true,
        })
      : createConnection({ host: input.host, port: input.port });

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Pop3ProtocolError('timeout', 'timeout'));
    }, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    socket.once(input.useTls ? 'secureConnect' : 'connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once('error', () => {
      clearTimeout(timeout);
      reject(new Pop3ProtocolError('socket error', 'network'));
    });
  });
}

export async function testPop3Connection(
  input: EmailConnectionTestInput & { password: string },
): Promise<EmailConnectionTestResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let connection: Pop3Connection | null = null;

  try {
    const socket = await openSocket(input);
    connection = new Pop3Connection(socket);

    const greeting = await connection.readLine(timeoutMs);
    if (!greeting.startsWith('+OK')) {
      throw new Pop3ProtocolError(greeting, 'protocol');
    }

    await connection.command(`USER ${input.username}`, timeoutMs);
    await connection.command(`PASS ${input.password}`, timeoutMs);

    let uidlSupported = true;
    let messageCount = 0;
    try {
      await connection.command('UIDL', timeoutMs);
      const rows = await connection.readMultiline(timeoutMs);
      messageCount = rows.filter((row) => row.trim().length > 0).length;
    } catch (err) {
      if (err instanceof Pop3ProtocolError && err.code === 'uidl') {
        uidlSupported = false;
      } else {
        throw err;
      }
    }

    await connection.command('QUIT', timeoutMs).catch(() => undefined);
    return { ok: true, uidlSupported, messageCount };
  } catch (err) {
    return { ok: false, uidlSupported: false, error: sanitizePop3Error(err) };
  } finally {
    connection?.close();
  }
}
