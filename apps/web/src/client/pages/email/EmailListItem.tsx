import { Star } from '@phosphor-icons/react';
import type { EmailMessage } from '@accomplish_ai/agent-core/common';

interface EmailListItemProps {
  message: EmailMessage;
  active: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function EmailListItem({ message, active, onSelect, onToggleStar }: EmailListItemProps) {
  const unread = message.readState === 'unread';
  const sender = message.fromName || message.fromAddress || '(unknown sender)';
  const preview = (message.textBody ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col gap-1 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-accent ${
        active ? 'bg-accent' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            unread ? 'font-semibold text-foreground' : 'text-muted-foreground'
          }`}
        >
          {sender}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatDate(message.sentAt ?? message.receivedAt)}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleStar();
          }}
          className="shrink-0 text-muted-foreground hover:text-amber-500"
          aria-label="Star"
        >
          <Star className="h-4 w-4" weight={message.starred ? 'fill' : 'regular'} />
        </button>
      </div>
      <span
        className={`truncate text-sm ${unread ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
      >
        {message.subject || '(no subject)'}
      </span>
      {preview && <span className="truncate text-xs text-muted-foreground">{preview}</span>}
    </button>
  );
}
