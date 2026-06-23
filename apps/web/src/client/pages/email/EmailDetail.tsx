import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Paperclip, Star } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { EmailAttachment, EmailMessage } from '@accomplish_ai/agent-core/common';

interface EmailDetailProps {
  message: EmailMessage | null;
  attachments: EmailAttachment[];
  onToggleStar: (message: EmailMessage) => void;
  onArchive: (message: EmailMessage) => void;
}

function formatBytes(size: number): string {
  if (size <= 0) {
    return '';
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function recipientList(message: EmailMessage): string {
  return message.to.map((entry) => entry.name || entry.address).join(', ');
}

export function EmailDetail({ message, attachments, onToggleStar, onArchive }: EmailDetailProps) {
  const { t } = useTranslation('settings');

  // HTML bodies are rendered inside a sandboxed iframe with a strict CSP so
  // remote content and scripts cannot run or phone home. data: images are the
  // only external resource permitted.
  const htmlDoc = useMemo(() => {
    if (!message?.htmlBody) {
      return null;
    }
    const csp = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"></head><body style="font-family:sans-serif;color:#111;margin:0;padding:12px">${message.htmlBody}</body></html>`;
  }, [message?.htmlBody]);

  if (!message) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t('email.inbox.noSelection')}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">
            {message.subject || '(no subject)'}
          </h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {message.fromName ? `${message.fromName} · ` : ''}
            {message.fromAddress}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {t('email.inbox.to')}: {recipientList(message) || '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {new Date(message.sentAt ?? message.receivedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onToggleStar(message)}
            aria-label={t('email.inbox.star')}
          >
            <Star className="h-4 w-4" weight={message.starred ? 'fill' : 'regular'} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onArchive(message)}
            aria-label={t('email.inbox.archive')}
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
              title={attachment.contentType}
            >
              <Paperclip className="h-3.5 w-3.5" />
              {attachment.filename}
              {formatBytes(attachment.size) && (
                <span className="text-[10px]">({formatBytes(attachment.size)})</span>
              )}
            </span>
          ))}
        </div>
      )}

      {htmlDoc ? (
        <iframe
          title={message.subject || 'email'}
          sandbox=""
          srcDoc={htmlDoc}
          className="flex-1 border-0 bg-white"
        />
      ) : (
        <ScrollArea className="flex-1">
          <pre className="whitespace-pre-wrap break-words p-4 font-sans text-sm text-foreground">
            {message.textBody || t('email.inbox.noBody')}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}
