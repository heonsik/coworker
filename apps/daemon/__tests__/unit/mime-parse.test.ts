import { describe, expect, it } from 'vitest';
import { parseEmail } from '../../src/mime/parse.js';
import { decodeMimeHeader, decodeQuotedPrintable } from '../../src/mime/decode.js';

const CRLF = '\r\n';

function buildMessage(lines: string[]): string {
  return lines.join(CRLF);
}

describe('parseEmail', () => {
  it('parses a plain text message with structured headers', () => {
    const raw = buildMessage([
      'From: "Jane Doe" <jane@example.com>',
      'To: bob@example.com, carol@example.com',
      'Subject: Hello there',
      'Date: Tue, 23 Jun 2026 10:00:00 +0000',
      'Message-ID: <abc123@example.com>',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'This is the body.',
    ]);

    const parsed = parseEmail(raw);
    expect(parsed.fromAddress).toBe('jane@example.com');
    expect(parsed.fromName).toBe('Jane Doe');
    expect(parsed.to.map((t) => t.address)).toEqual(['bob@example.com', 'carol@example.com']);
    expect(parsed.subject).toBe('Hello there');
    expect(parsed.messageId).toBe('abc123@example.com');
    expect(parsed.sentAt).toBe('2026-06-23T10:00:00.000Z');
    expect(parsed.textBody?.trim()).toBe('This is the body.');
  });

  it('decodes quoted-printable bodies', () => {
    const raw = buildMessage([
      'Subject: QP',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Caf=C3=A9 =E2=82=AC sign',
    ]);
    expect(parseEmail(raw).textBody?.trim()).toBe('Café € sign');
  });

  it('decodes RFC 2047 encoded-word subjects', () => {
    const raw = buildMessage([
      'Subject: =?UTF-8?B?7JWI64WV7ZWY7IS47JqU?=',
      'Content-Type: text/plain',
      '',
      'body',
    ]);
    // Base64 of the Korean greeting "안녕하세요"
    expect(parseEmail(raw).subject).toBe('안녕하세요');
  });

  it('extracts html and attachment from a multipart message', () => {
    const raw = buildMessage([
      'Subject: Multipart',
      'Content-Type: multipart/mixed; boundary="BOUND"',
      '',
      '--BOUND',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>Hello <b>world</b></p>',
      '--BOUND',
      'Content-Type: application/pdf; name="report.pdf"',
      'Content-Disposition: attachment; filename="report.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0=',
      '--BOUND--',
    ]);

    const parsed = parseEmail(raw);
    expect(parsed.htmlBody).toContain('<b>world</b>');
    expect(parsed.attachments).toHaveLength(1);
    expect(parsed.attachments[0].filename).toBe('report.pdf');
    expect(parsed.attachments[0].contentType).toBe('application/pdf');
    expect(parsed.attachments[0].size).toBeGreaterThan(0);
  });

  it('decodes quoted-printable soft line breaks', () => {
    expect(decodeQuotedPrintable('a=\r\nb').toString('utf8')).toBe('ab');
  });

  it('leaves plain header text untouched', () => {
    expect(decodeMimeHeader('Plain subject')).toBe('Plain subject');
  });
});
