import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  EmailAccount,
  EmailAttachment,
  EmailMessage,
  EmailMessageListFilters,
} from '@accomplish_ai/agent-core/common';

export type EmailFilter = 'all' | 'unread' | 'starred';

export function useEmailInbox() {
  const { t } = useTranslation('settings');
  const emailApi = window.accomplish?.email;

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState<string>('all');
  const [filter, setFilter] = useState<EmailFilter>('all');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selected, setSelected] = useState<EmailMessage | null>(null);
  const [attachments, setAttachments] = useState<EmailAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  // Token guard: only the most recent list request may apply its results.
  const listToken = useRef(0);

  const loadMessages = useCallback(async () => {
    if (!emailApi) {
      setLoading(false);
      setError(t('email.errors.apiUnavailable'));
      return;
    }
    const token = ++listToken.current;
    setLoading(true);
    const filters: EmailMessageListFilters = {
      accountId: accountId === 'all' ? undefined : accountId,
      unreadOnly: filter === 'unread',
      starredOnly: filter === 'starred',
      query: query.trim() || undefined,
    };
    try {
      const result = await emailApi.listMessages(filters);
      if (token === listToken.current) {
        setMessages(result);
        setError(null);
      }
    } catch {
      if (token === listToken.current) {
        setError(t('email.inbox.loadFailed'));
      }
    } finally {
      if (token === listToken.current) {
        setLoading(false);
      }
    }
  }, [emailApi, accountId, filter, query, t]);

  useEffect(() => {
    if (!emailApi) {
      return;
    }
    void emailApi
      .listAccounts()
      .then(setAccounts)
      .catch(() => undefined);
  }, [emailApi]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const selectMessage = useCallback(
    async (message: EmailMessage) => {
      if (!emailApi) {
        return;
      }
      setSelected(message);
      setAttachments([]);
      try {
        const [full, atts] = await Promise.all([
          emailApi.getMessage(message.id),
          emailApi.listAttachments(message.id),
        ]);
        setSelected(full ?? message);
        setAttachments(atts);
        if (message.readState === 'unread') {
          await emailApi.markMessageRead(message.id, true);
          setMessages((current) =>
            current.map((m) => (m.id === message.id ? { ...m, readState: 'read' } : m)),
          );
        }
      } catch {
        setError(t('email.inbox.loadFailed'));
      }
    },
    [emailApi, t],
  );

  const runSync = useCallback(async () => {
    if (!emailApi) {
      return;
    }
    const enabled = accounts.filter((a) => a.enabled);
    const targets =
      accountId === 'all' ? enabled : accounts.filter((a) => a.id === accountId && a.enabled);
    if (targets.length === 0) {
      setStatus(t('email.inbox.noEnabledAccounts'));
      return;
    }
    setSyncing(true);
    setStatus(null);
    setError(null);
    try {
      let total = 0;
      let failed = 0;
      for (const account of targets) {
        const result = await emailApi.runSync(account.id);
        if (result.ok) {
          total += result.newCount;
        } else {
          failed += 1;
        }
      }
      setStatus(
        failed > 0
          ? t('email.inbox.syncPartial', { count: total, failed })
          : t('email.inbox.syncDone', { count: total }),
      );
      await loadMessages();
    } catch {
      setError(t('email.inbox.syncFailed'));
    } finally {
      setSyncing(false);
    }
  }, [emailApi, accounts, accountId, loadMessages, t]);

  const toggleStar = useCallback(
    async (message: EmailMessage) => {
      if (!emailApi) {
        return;
      }
      const next = !message.starred;
      setMessages((current) =>
        current.map((m) => (m.id === message.id ? { ...m, starred: next } : m)),
      );
      setSelected((s) => (s && s.id === message.id ? { ...s, starred: next } : s));
      await emailApi.setMessageStarred(message.id, next).catch(() => undefined);
    },
    [emailApi],
  );

  const archive = useCallback(
    async (message: EmailMessage) => {
      if (!emailApi) {
        return;
      }
      setMessages((current) => current.filter((m) => m.id !== message.id));
      setSelected((s) => (s && s.id === message.id ? null : s));
      await emailApi.setMessageArchived(message.id, true).catch(() => undefined);
    },
    [emailApi],
  );

  return {
    accounts,
    accountId,
    setAccountId,
    filter,
    setFilter,
    query,
    setQuery,
    messages,
    selected,
    attachments,
    loading,
    syncing,
    error,
    status,
    selectMessage,
    runSync,
    toggleStar,
    archive,
    available: Boolean(emailApi),
  };
}
