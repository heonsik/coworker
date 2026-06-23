import { DEFAULT_TIMEOUT_MS, Pop3Connection, Pop3ProtocolError, openSocket } from './connection.js';

export interface Pop3SessionInput {
  host: string;
  port: number;
  useTls: boolean;
  username: string;
  password: string;
  timeoutMs?: number;
}

/** One server-side message: its sequence number, stable UIDL, and octet size. */
export interface Pop3MessageRef {
  msgNumber: number;
  uidl: string;
  size: number;
}

/**
 * Authenticated POP3 session that can enumerate and retrieve messages.
 * POP3 is single-connection and stateful, so callers must `quit()` when done.
 */
export class Pop3Session {
  private constructor(
    private readonly connection: Pop3Connection,
    private readonly timeoutMs: number,
  ) {}

  static async connect(input: Pop3SessionInput): Promise<Pop3Session> {
    const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const socket = await openSocket(input);
    const connection = new Pop3Connection(socket);

    const greeting = await connection.readLine(timeoutMs);
    if (!greeting.startsWith('+OK')) {
      connection.close();
      throw new Pop3ProtocolError(greeting, 'protocol');
    }

    try {
      await connection.command(`USER ${input.username}`, timeoutMs);
      await connection.command(`PASS ${input.password}`, timeoutMs);
    } catch (err) {
      connection.close();
      throw err;
    }

    return new Pop3Session(connection, timeoutMs);
  }

  /** Lists every message with its UIDL and size by joining LIST + UIDL output. */
  async list(): Promise<Pop3MessageRef[]> {
    const sizeRows = await this.connection.commandMultiline('LIST', this.timeoutMs);
    const uidlRows = await this.connection.commandMultiline('UIDL', this.timeoutMs);

    const sizes = new Map<number, number>();
    for (const row of sizeRows) {
      const [num, size] = row.trim().split(/\s+/);
      const msgNumber = Number.parseInt(num, 10);
      if (Number.isInteger(msgNumber)) {
        sizes.set(msgNumber, Number.parseInt(size, 10) || 0);
      }
    }

    const refs: Pop3MessageRef[] = [];
    for (const row of uidlRows) {
      const [num, uidl] = row.trim().split(/\s+/);
      const msgNumber = Number.parseInt(num, 10);
      if (Number.isInteger(msgNumber) && uidl) {
        refs.push({ msgNumber, uidl, size: sizes.get(msgNumber) ?? 0 });
      }
    }
    return refs;
  }

  /** Retrieves the full RFC 822 source for a message via RETR. */
  async retrieve(msgNumber: number): Promise<string> {
    const lines = await this.connection.commandMultiline(`RETR ${msgNumber}`, this.timeoutMs);
    return lines.join('\r\n');
  }

  async quit(): Promise<void> {
    await this.connection.command('QUIT', this.timeoutMs).catch(() => undefined);
    this.connection.close();
  }

  close(): void {
    this.connection.close();
  }
}
