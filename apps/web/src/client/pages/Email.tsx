import { useTranslation } from 'react-i18next';
import { FormError } from '@/components/settings/shared/FormError';
import { EmailList } from './email/EmailList';
import { EmailDetail } from './email/EmailDetail';
import { useEmailInbox } from './email/useEmailInbox';

export default function EmailPage() {
  const { t } = useTranslation('settings');
  const inbox = useEmailInbox();

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold text-foreground">{t('email.inbox.title')}</h1>
        {inbox.error && (
          <div className="mt-2">
            <FormError error={inbox.error} />
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <EmailList
          accounts={inbox.accounts}
          accountId={inbox.accountId}
          onAccountChange={inbox.setAccountId}
          filter={inbox.filter}
          onFilterChange={inbox.setFilter}
          query={inbox.query}
          onQueryChange={inbox.setQuery}
          messages={inbox.messages}
          selectedId={inbox.selected?.id ?? null}
          loading={inbox.loading}
          syncing={inbox.syncing}
          status={inbox.status}
          onSync={inbox.runSync}
          onSelect={inbox.selectMessage}
          onToggleStar={inbox.toggleStar}
        />
        <EmailDetail
          message={inbox.selected}
          attachments={inbox.attachments}
          onToggleStar={inbox.toggleStar}
          onArchive={inbox.archive}
        />
      </div>
    </div>
  );
}
