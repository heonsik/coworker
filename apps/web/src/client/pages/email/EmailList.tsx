import { useTranslation } from 'react-i18next';
import { ArrowsClockwise, MagnifyingGlass } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { EmailAccount, EmailMessage } from '@accomplish_ai/agent-core/common';
import { EmailListItem } from './EmailListItem';
import type { EmailFilter } from './useEmailInbox';

interface EmailListProps {
  accounts: EmailAccount[];
  accountId: string;
  onAccountChange: (value: string) => void;
  filter: EmailFilter;
  onFilterChange: (value: EmailFilter) => void;
  query: string;
  onQueryChange: (value: string) => void;
  messages: EmailMessage[];
  selectedId: string | null;
  loading: boolean;
  syncing: boolean;
  status: string | null;
  onSync: () => void;
  onSelect: (message: EmailMessage) => void;
  onToggleStar: (message: EmailMessage) => void;
}

const FILTERS: EmailFilter[] = ['all', 'unread', 'starred'];

export function EmailList(props: EmailListProps) {
  const { t } = useTranslation('settings');

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-r border-border">
      <div className="space-y-2 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <select
            value={props.accountId}
            onChange={(event) => props.onAccountChange(event.target.value)}
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="all">{t('email.inbox.allAccounts')}</option>
            {props.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.displayName}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={props.onSync}
            disabled={props.syncing}
            title={t('email.inbox.sync')}
          >
            <ArrowsClockwise className={`h-4 w-4 ${props.syncing ? 'animate-spin' : ''}`} />
            {props.syncing ? t('email.inbox.syncing') : t('email.inbox.sync')}
          </Button>
        </div>

        <div className="relative">
          <MagnifyingGlass className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={t('email.inbox.searchPlaceholder')}
            className="h-8 pl-8"
          />
        </div>

        <div className="flex gap-1">
          {FILTERS.map((value) => (
            <Button
              key={value}
              variant={props.filter === value ? 'default' : 'ghost'}
              size="sm"
              className="h-7 flex-1 text-xs"
              onClick={() => props.onFilterChange(value)}
            >
              {t(`email.inbox.filters.${value}`)}
            </Button>
          ))}
        </div>
        {props.status && <p className="text-xs text-muted-foreground">{props.status}</p>}
      </div>

      <ScrollArea className="flex-1">
        {props.loading && props.messages.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('email.inbox.loading')}
          </div>
        ) : props.messages.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('email.inbox.empty')}
          </div>
        ) : (
          props.messages.map((message) => (
            <EmailListItem
              key={message.id}
              message={message}
              active={props.selectedId === message.id}
              onSelect={() => props.onSelect(message)}
              onToggleStar={() => props.onToggleStar(message)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  );
}
