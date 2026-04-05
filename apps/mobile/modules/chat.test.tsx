// @ts-nocheck
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFetchChatMessages = jest.fn() as jest.Mock;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (vars?.count !== undefined) {
        return `${key}:${vars.count}`;
      }
      if (vars?.user !== undefined) {
        return `${key}:${vars.user}`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../utils/collaborationApi', () => ({
  fetchChatMessages: (...args: unknown[]) => mockFetchChatMessages(...args),
  sendChatMessage: jest.fn(),
  editChatMessage: jest.fn(),
  deleteChatMessage: jest.fn(),
}));

jest.mock('../utils/userContext', () => ({
  getUserContext: jest.fn(),
}));

const mockGetUserContext = (require('../utils/userContext').getUserContext ?? jest.fn()) as jest.Mock;

const postgresHandlers: Array<() => void> = [];
const presenceHandlers: Record<string, Array<() => void>> = {
  sync: [],
  join: [],
  leave: [],
};

const presenceStateMock = jest.fn(() => ({
  'me-1': [{ status: 'online', typing: false }],
  'user-2': [{ status: 'online', typing: true }],
}));

const mockChannel = {
  on: jest.fn((event: string, config: { event?: string }, cb: () => void) => {
    if (event === 'postgres_changes') {
      postgresHandlers.push(cb);
    }
    if (event === 'presence' && config?.event) {
      presenceHandlers[config.event]?.push(cb);
    }
    return mockChannel;
  }),
  subscribe: jest.fn((cb?: (status: string) => void) => {
    if (cb) {
      cb('SUBSCRIBED');
    }
    return mockChannel;
  }),
  presenceState: presenceStateMock,
  track: jest.fn().mockResolvedValue(undefined),
  untrack: jest.fn().mockResolvedValue(undefined),
};

jest.mock('../utils/supabaseClient', () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}));

const ChatScreen = require('./chat').default;

describe('ChatScreen realtime behavior', () => {
  beforeEach(() => {
    mockGetUserContext.mockResolvedValue({
      familyId: 'fam-1',
      userId: 'me-1',
      role: 'admin',
      subscriptionTier: 'Premium',
      familyMembersCount: 2,
      permissions: {
        create: true,
        edit: true,
        delete: true,
        markDone: true,
        viewProgress: true,
      },
    });

    mockFetchChatMessages.mockReset();
    postgresHandlers.splice(0, postgresHandlers.length);
    presenceHandlers.sync.splice(0, presenceHandlers.sync.length);
    presenceHandlers.join.splice(0, presenceHandlers.join.length);
    presenceHandlers.leave.splice(0, presenceHandlers.leave.length);

    mockFetchChatMessages
      .mockResolvedValueOnce({
        messages: [
          {
            id: 'm1',
            familyId: 'fam-1',
            senderId: 'user-2',
            content: 'hello',
            messageType: 'text',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      })
      .mockResolvedValue({
        messages: [
          {
            id: 'm1',
            familyId: 'fam-1',
            senderId: 'user-2',
            content: 'hello-updated',
            messageType: 'text',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        nextCursor: null,
      });
  });

  it('reloads messages when realtime postgres change fires', async () => {
    render(<ChatScreen />);

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(postgresHandlers.length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );

    const initialCalls = mockFetchChatMessages.mock.calls.length;

    await act(async () => {
      postgresHandlers[0]();
    });

    await waitFor(() => {
      expect(mockFetchChatMessages.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  it('renders presence counters and typing indicator', async () => {
    const screen = render(<ChatScreen />);

    await waitFor(() => {
      expect(mockFetchChatMessages).toHaveBeenCalled();
    });

    await act(async () => {
      presenceHandlers.sync.forEach((cb) => cb());
    });

    await waitFor(() => {
      expect(screen.getByText('chat.presenceOnline:2')).toBeTruthy();
      expect(screen.getByText('chat.typingOne:user-2')).toBeTruthy();
    });
  });
});
