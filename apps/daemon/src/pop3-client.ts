import type {
  EmailConnectionTestInput,
  EmailConnectionTestResult,
} from '@accomplish_ai/agent-core';
import {
  DEFAULT_TIMEOUT_MS,
  Pop3Connection,
  Pop3ProtocolError,
  openSocket,
  sanitizePop3Error,
} from './pop3/connection.js';

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
      const rows = await connection.commandMultiline('UIDL', timeoutMs);
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
