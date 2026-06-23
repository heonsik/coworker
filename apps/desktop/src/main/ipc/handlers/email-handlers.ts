import type { IpcMainInvokeEvent } from 'electron';
import type {
  EmailAccountSettingsUpdateInput,
  EmailAccountWithPasswordInput,
  EmailConnectionTestInput,
  EmailMessageListFilters,
} from '@accomplish_ai/agent-core/common';
import { handle } from './utils';
import { getDaemonClient } from '../../daemon-bootstrap';

export function registerEmailHandlers(): void {
  handle('email:accounts:list', async () => {
    return getDaemonClient().call('email.accounts.list');
  });

  handle('email:accounts:get', async (_event: IpcMainInvokeEvent, accountId: string) => {
    return getDaemonClient().call('email.accounts.get', { accountId });
  });

  handle(
    'email:accounts:create',
    async (_event: IpcMainInvokeEvent, input: EmailAccountWithPasswordInput) => {
      return getDaemonClient().call('email.accounts.create', { input });
    },
  );

  handle(
    'email:accounts:update',
    async (
      _event: IpcMainInvokeEvent,
      accountId: string,
      input: EmailAccountSettingsUpdateInput,
    ) => {
      return getDaemonClient().call('email.accounts.update', { accountId, input });
    },
  );

  handle('email:accounts:delete', async (_event: IpcMainInvokeEvent, accountId: string) => {
    await getDaemonClient().call('email.accounts.delete', { accountId });
  });

  handle(
    'email:accounts:test-connection',
    async (_event: IpcMainInvokeEvent, input: EmailConnectionTestInput) => {
      return getDaemonClient().call('email.account.testConnection', { input });
    },
  );

  handle(
    'email:messages:list',
    async (_event: IpcMainInvokeEvent, filters?: EmailMessageListFilters) => {
      return getDaemonClient().call('email.messages.list', filters);
    },
  );

  handle('email:messages:get', async (_event: IpcMainInvokeEvent, messageId: string) => {
    return getDaemonClient().call('email.messages.get', { messageId });
  });

  handle(
    'email:messages:mark-read',
    async (_event: IpcMainInvokeEvent, messageId: string, read: boolean) => {
      await getDaemonClient().call('email.messages.markRead', { messageId, read });
    },
  );

  handle(
    'email:messages:set-starred',
    async (_event: IpcMainInvokeEvent, messageId: string, starred: boolean) => {
      await getDaemonClient().call('email.messages.setStarred', { messageId, starred });
    },
  );

  handle(
    'email:messages:set-archived',
    async (_event: IpcMainInvokeEvent, messageId: string, archived: boolean) => {
      await getDaemonClient().call('email.messages.setArchived', { messageId, archived });
    },
  );

  handle('email:attachments:list', async (_event: IpcMainInvokeEvent, messageId: string) => {
    return getDaemonClient().call('email.attachments.list', { messageId });
  });

  handle('email:sync:get-state', async (_event: IpcMainInvokeEvent, accountId: string) => {
    return getDaemonClient().call('email.sync.getState', { accountId });
  });
}
