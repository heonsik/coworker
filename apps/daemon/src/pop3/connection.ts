import { createConnection } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type { Socket } from 'node:net';

export const DEFAULT_TIMEOUT_MS = 15_000;

export type Pop3ErrorCode = 'auth' | 'network' | 'timeout' | 'protocol' | 'uidl';

export class Pop3ProtocolError extends Error {
  constructor(
    message: string,
    readonly code: Pop3ErrorCode,
  ) {
    super(message);
  }
}

/** Turns any thrown value into a message that never leaks credentials. */
export function sanitizePop3Error(err: unknown): string {
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

export interface Pop3SocketOptions {
  host: string;
  port: number;
  useTls: boolean;
  timeoutMs?: number;
}

export function openSocket(input: Pop3SocketOptions): Promise<Socket> {
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

/**
 * Low-level POP3 line/command reader over a connected socket. Handles CRLF
 * framing, multiline (`.`-terminated) responses, and dot-unstuffing.
 */
export class Pop3Connection {
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
    // Absolute deadline so a slow/large response cannot extend the total wait
    // to N × timeoutMs (one full timeout window per line).
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const remaining = Math.max(deadline - Date.now(), 1);
      const line = await this.readLine(remaining);
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
      let code: Pop3ErrorCode = 'protocol';
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

  /** Sends a command expecting a multiline body after the `+OK` status line. */
  async commandMultiline(command: string, timeoutMs: number): Promise<string[]> {
    await this.command(command, timeoutMs);
    return await this.readMultiline(timeoutMs);
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
