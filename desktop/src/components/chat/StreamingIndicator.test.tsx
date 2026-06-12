import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../api/websocket', () => ({
  wsManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    clearHandlers: vi.fn(),
    send: vi.fn(),
  },
}))

vi.mock('../../api/sessions', () => ({
  sessionsApi: {
    getMessages: vi.fn(async () => ({ messages: [] })),
    getSlashCommands: vi.fn(async () => ({ commands: [] })),
  },
}))

import { StreamingIndicator } from './StreamingIndicator'
import { useChatStore, type PerSessionState } from '../../stores/chatStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useTabStore } from '../../stores/tabStore'

const ACTIVE_TAB = 'active-tab'

function makeSession(overrides: Partial<PerSessionState> = {}): PerSessionState {
  return {
    messages: [],
    chatState: 'streaming',
    connectionState: 'connected',
    historyStatus: 'idle',
    historyError: null,
    streamingText: '',
    streamingToolInput: '',
    activeToolUseId: null,
    activeToolName: null,
    activeThinkingId: null,
    pendingPermission: null,
    pendingComputerUsePermission: null,
    tokenUsage: { input_tokens: 0, output_tokens: 0 },
    streamingResponseChars: 0,
    elapsedSeconds: 0,
    statusVerb: '',
    apiRetry: null,
    slashCommands: [],
    agentTaskNotifications: {},
    backgroundAgentTasks: {},
    elapsedTimer: null,
    ...overrides,
  }
}

describe('StreamingIndicator', () => {
  beforeEach(() => {
    useSettingsStore.setState({ locale: 'en' })
    useTabStore.setState({
      activeTabId: ACTIVE_TAB,
      tabs: [{ sessionId: ACTIVE_TAB, title: 'Test', type: 'session', status: 'running' }],
    })
  })

  // issue #757: token usage is rendered with the shared compact notation and
  // an explicit unit instead of a bare number.
  it('renders the current turn token estimate as "↓ N tokens"', () => {
    useChatStore.setState({
      sessions: {
        // 8976 streamed chars ÷ 4 = 2244 tokens → "2.2k tokens"
        [ACTIVE_TAB]: makeSession({ streamingResponseChars: 8976 }),
      },
    })

    render(<StreamingIndicator />)

    expect(screen.getByText(/↓ 2\.2k tokens/)).toBeTruthy()
  })

  it('hides the token estimate until this turn has streamed output', () => {
    useChatStore.setState({
      sessions: {
        // Previous-turn usage must not leak into the indicator (issue #757
        // follow-up report: the count showed a stale value from the last turn).
        [ACTIVE_TAB]: makeSession({
          tokenUsage: { input_tokens: 5000, output_tokens: 6240 },
        }),
      },
    })

    render(<StreamingIndicator />)

    expect(screen.queryByText(/tokens/)).toBeNull()
  })
})
