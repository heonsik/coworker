import { useCallback, useEffect, useMemo, useState } from 'react';
import { FloppyDisk, PlugsConnected, Trash } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import type {
  EmailAccount,
  EmailAccountSettingsUpdateInput,
  EmailAccountWithPasswordInput,
  EmailConnectionTestResult,
} from '@accomplish_ai/agent-core/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { FormError } from '@/components/settings/shared/FormError';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

interface EmailFormState {
  displayName: string;
  host: string;
  port: string;
  useTls: boolean;
  username: string;
  password: string;
  enabled: boolean;
}

const defaultForm: EmailFormState = {
  displayName: '',
  host: '',
  port: '995',
  useTls: true,
  username: '',
  password: '',
  enabled: true,
};

function normalizePort(value: string): number | null {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }
  return port;
}

export function EmailSettingsPanel() {
  const { t } = useTranslation('settings');
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [form, setForm] = useState<EmailFormState>(defaultForm);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<EmailConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<EmailAccount | null>(null);

  const emailApi = window.accomplish?.email;
  const editingAccount = useMemo(
    () => accounts.find((account) => account.id === editingAccountId) ?? null,
    [accounts, editingAccountId],
  );
  const testResultMessage = useMemo(() => {
    if (!testResult) {
      return null;
    }
    if (!testResult.ok) {
      return testResult.error ?? t('email.test.failed');
    }
    if (!testResult.uidlSupported) {
      return t('email.test.successNoUidl');
    }
    return t('email.test.success', { count: testResult.messageCount ?? 0 });
  }, [testResult, t]);

  const loadAccounts = useCallback(async () => {
    if (!emailApi) {
      setLoading(false);
      setError(t('email.errors.apiUnavailable'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setAccounts(await emailApi.listAccounts());
    } catch {
      setError(t('email.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [emailApi, t]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const updateField = <K extends keyof EmailFormState>(key: K, value: EmailFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setTestResult(null);
  };

  const handleTlsChange = (checked: boolean) => {
    setForm((current) => {
      let port = current.port;
      if (checked && current.port === '110') {
        port = '995';
      }
      if (!checked && current.port === '995') {
        port = '110';
      }
      return { ...current, useTls: checked, port };
    });
    setTestResult(null);
  };

  const resetForm = () => {
    setForm(defaultForm);
    setEditingAccountId(null);
    setError(null);
    setTestResult(null);
  };

  const startEdit = (account: EmailAccount) => {
    setEditingAccountId(account.id);
    setForm({
      displayName: account.displayName,
      host: account.host,
      port: String(account.port),
      useTls: account.useTls,
      username: account.username,
      password: '',
      enabled: account.enabled,
    });
    setError(null);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!emailApi) {
      setError(t('email.errors.apiUnavailable'));
      return;
    }
    const port = normalizePort(form.port);
    if (!form.host.trim() || !form.username.trim() || port === null) {
      setError(t('email.errors.connectionRequired'));
      return;
    }
    if (!editingAccount && !form.password.trim()) {
      setError(t('email.errors.passwordRequired'));
      return;
    }

    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await emailApi.testConnection({
        accountId: editingAccount?.id,
        host: form.host.trim(),
        port,
        useTls: form.useTls,
        username: form.username.trim(),
        // Do not trim the password — it may intentionally contain spaces.
        password: form.password || undefined,
        timeoutMs: 15_000,
      });
      setTestResult(result);
    } catch {
      setError(t('email.errors.testFailed'));
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async () => {
    if (!emailApi) {
      setError(t('email.errors.apiUnavailable'));
      return;
    }
    const port = normalizePort(form.port);
    if (!form.displayName.trim() || !form.host.trim() || !form.username.trim() || port === null) {
      setError(t('email.errors.required'));
      return;
    }
    if (!editingAccount && !form.password.trim()) {
      setError(t('email.errors.passwordRequired'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingAccount) {
        const input: EmailAccountSettingsUpdateInput = {
          displayName: form.displayName.trim(),
          host: form.host.trim(),
          port,
          useTls: form.useTls,
          username: form.username.trim(),
          enabled: form.enabled,
        };
        if (form.password.trim()) {
          input.password = form.password;
        }
        await emailApi.updateAccount(editingAccount.id, input);
      } else {
        const input: EmailAccountWithPasswordInput = {
          displayName: form.displayName.trim(),
          host: form.host.trim(),
          port,
          useTls: form.useTls,
          username: form.username.trim(),
          password: form.password,
          enabled: form.enabled,
        };
        await emailApi.createAccount(input);
      }
      resetForm();
      await loadAccounts();
    } catch {
      setError(t('email.errors.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (account: EmailAccount, enabled: boolean) => {
    if (!emailApi) {
      return;
    }
    setAccounts((current) =>
      current.map((item) => (item.id === account.id ? { ...item, enabled } : item)),
    );
    try {
      await emailApi.updateAccount(account.id, { enabled });
    } catch {
      // Reload first so the UI reflects the actual server state, then set the
      // error — loadAccounts resets error to null on success, so the order matters.
      await loadAccounts();
      setError(t('email.errors.saveFailed'));
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!emailApi || !deleteTarget) {
      return;
    }
    const account = deleteTarget;
    setDeleteTarget(null);
    try {
      await emailApi.deleteAccount(account.id);
      if (editingAccountId === account.id) {
        resetForm();
      }
      await loadAccounts();
    } catch {
      setError(t('email.errors.deleteFailed'));
    }
  };

  return (
    <div className="space-y-6" data-testid="email-settings-panel">
      <section className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{t('email.formTitle')}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t('email.formDescription')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email-display-name">{t('email.fields.displayName')}</Label>
            <Input
              id="email-display-name"
              value={form.displayName}
              onChange={(event) => updateField('displayName', event.target.value)}
              placeholder={t('email.placeholders.displayName')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-username">{t('email.fields.username')}</Label>
            <Input
              id="email-username"
              value={form.username}
              onChange={(event) => updateField('username', event.target.value)}
              placeholder={t('email.placeholders.username')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-host">{t('email.fields.host')}</Label>
            <Input
              id="email-host"
              value={form.host}
              onChange={(event) => updateField('host', event.target.value)}
              placeholder={t('email.placeholders.host')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-port">{t('email.fields.port')}</Label>
            <Input
              id="email-port"
              inputMode="numeric"
              value={form.port}
              onChange={(event) => updateField('port', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-password">{t('email.fields.password')}</Label>
            <Input
              id="email-password"
              type="password"
              value={form.password}
              onChange={(event) => updateField('password', event.target.value)}
              placeholder={
                editingAccount
                  ? t('email.placeholders.passwordEdit')
                  : t('email.placeholders.password')
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <Label>{t('email.fields.useTls')}</Label>
              <p className="mt-1 text-xs text-muted-foreground">{t('email.fields.useTlsHint')}</p>
            </div>
            <Switch checked={form.useTls} onCheckedChange={handleTlsChange} />
          </div>
        </div>

        <FormError error={error} />
        {testResult && (
          <div
            className={
              testResult.ok
                ? 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            }
          >
            {testResultMessage}
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void handleTestConnection()}
            disabled={testing || saving}
          >
            <PlugsConnected className="h-4 w-4" />
            {testing ? t('email.actions.testing') : t('email.actions.test')}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            <FloppyDisk className="h-4 w-4" />
            {saving
              ? t('email.actions.saving')
              : editingAccount
                ? t('email.actions.update')
                : t('email.actions.save')}
          </Button>
          {editingAccount && (
            <Button variant="ghost" onClick={resetForm} disabled={saving}>
              {t('email.actions.cancel')}
            </Button>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">{t('email.accountsTitle')}</h4>
          <Button variant="ghost" size="sm" onClick={() => void loadAccounts()} disabled={loading}>
            {t('buttons.refresh')}
          </Button>
        </div>

        {loading && accounts.length === 0 ? (
          <div className="flex h-[80px] items-center justify-center text-sm text-muted-foreground">
            {t('email.loading')}
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex h-[92px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            {t('email.empty')}
          </div>
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => startEdit(account)}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {account.displayName}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {account.enabled ? t('email.status.enabled') : t('email.status.disabled')}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {account.username} · {account.host}:{account.port}
                  </p>
                </button>
                <div className="flex items-center gap-2">
                  <Switch
                    size="sm"
                    checked={account.enabled}
                    onCheckedChange={(checked) => void handleToggleEnabled(account, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(account)}
                    aria-label={t('email.actions.delete')}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('email.deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('email.deleteDialog.description', { name: deleteTarget?.displayName ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('buttons.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteConfirmed()}>
              {t('email.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
