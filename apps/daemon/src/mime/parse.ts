import type { EmailAddress } from '@accomplish_ai/agent-core';
import { decodeBase64, decodeCharset, decodeMimeHeader, decodeQuotedPrintable } from './decode.js';
import {
  parseAddressList,
  parseContentType,
  parseFilename,
  parseHeaders,
  splitHeadersAndBody,
  type ContentType,
} from './headers.js';

export interface ParsedAttachment {
  filename: string;
  contentType?: string;
  size: number;
}

export interface ParsedEmail {
  messageId?: string;
  fromAddress?: string;
  fromName?: string;
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  sentAt?: string;
  textBody?: string;
  htmlBody?: string;
  attachments: ParsedAttachment[];
}

interface Accumulator {
  text?: string;
  html?: string;
  attachments: ParsedAttachment[];
}

function decodeBody(body: string, encoding: string | undefined, charset?: string): string {
  const enc = (encoding ?? '').trim().toLowerCase();
  if (enc === 'base64') {
    return decodeCharset(decodeBase64(body), charset);
  }
  if (enc === 'quoted-printable') {
    return decodeCharset(decodeQuotedPrintable(body), charset);
  }
  return decodeCharset(Buffer.from(body, 'latin1'), charset);
}

/** Splits a multipart body on its boundary, dropping the preamble/epilogue. */
function splitParts(body: string, boundary: string): string[] {
  const delimiter = `--${boundary}`;
  const segments = body.split(delimiter);
  const parts: string[] = [];
  for (const segment of segments.slice(1)) {
    if (segment.startsWith('--')) {
      break; // closing boundary
    }
    parts.push(segment.replace(/^\r?\n/, ''));
  }
  return parts;
}

function walkPart(raw: string, acc: Accumulator): void {
  const { headerBlock, body } = splitHeadersAndBody(raw);
  const headers = parseHeaders(headerBlock);
  const contentType = parseContentType(headers.get('content-type'));
  const disposition = headers.get('content-disposition');
  const encoding = headers.get('content-transfer-encoding');

  if (contentType.type.startsWith('multipart/') && contentType.boundary) {
    for (const part of splitParts(body, contentType.boundary)) {
      walkPart(part, acc);
    }
    return;
  }

  const isAttachment =
    /attachment/i.test(disposition ?? '') || Boolean(contentType.name) || isBinaryType(contentType);
  if (isAttachment) {
    const filename = parseFilename(disposition, contentType.name) ?? 'attachment';
    const bytes =
      (encoding ?? '').toLowerCase() === 'base64'
        ? decodeBase64(body)
        : Buffer.from(body, 'latin1');
    acc.attachments.push({ filename, contentType: contentType.type, size: bytes.length });
    return;
  }

  const decoded = decodeBody(body, encoding, contentType.charset);
  if (contentType.type === 'text/html' && acc.html === undefined) {
    acc.html = decoded;
  } else if (acc.text === undefined) {
    acc.text = decoded;
  }
}

function isBinaryType(contentType: ContentType): boolean {
  return !contentType.type.startsWith('text/') && !contentType.type.startsWith('multipart/');
}

function parseDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** Parses raw RFC 822 source into structured fields, bodies, and attachments. */
export function parseEmail(raw: string): ParsedEmail {
  const { headerBlock } = splitHeadersAndBody(raw);
  const headers = parseHeaders(headerBlock);
  const acc: Accumulator = { attachments: [] };
  walkPart(raw, acc);

  const from = parseAddressList(headers.get('from'))[0];
  const messageId = headers.get('message-id')?.replace(/^<|>$/g, '');

  return {
    messageId: messageId || undefined,
    fromAddress: from?.address,
    fromName: from?.name,
    to: parseAddressList(headers.get('to')),
    cc: parseAddressList(headers.get('cc')),
    subject: decodeMimeHeader(headers.get('subject') ?? ''),
    sentAt: parseDate(headers.get('date')),
    textBody: acc.text,
    htmlBody: acc.html,
    attachments: acc.attachments,
  };
}
