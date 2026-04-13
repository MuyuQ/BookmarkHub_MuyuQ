import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock browser APIs
const mockStorage = {
  local: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
  sync: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}

const mockBookmarks = {
  getTree: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: '1', title: 'Test' }),
  remove: vi.fn().mockResolvedValue(undefined),
  removeTree: vi.fn().mockResolvedValue(undefined),
  onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
  onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
}

const mockRuntime = {
  sendMessage: vi.fn().mockResolvedValue(undefined),
  onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  getManifest: vi.fn().mockReturnValue({ version: '0.7' }),
  onStartup: { addListener: vi.fn() },
  onInstalled: { addListener: vi.fn() },
  openOptionsPage: vi.fn().mockResolvedValue(undefined),
}

const mockNotifications = {
  create: vi.fn().mockResolvedValue(undefined),
}

const mockAction = {
  setBadgeText: vi.fn().mockResolvedValue(undefined),
  setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
}

const mockI18n = {
  getMessage: vi.fn((key: string) => key),
}

const mockAlarms = {
  create: vi.fn().mockResolvedValue(undefined),
  clear: vi.fn().mockResolvedValue(true),
  onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
}

// @ts-expect-error - Mocking global browser object
globalThis.browser = {
  storage: mockStorage,
  bookmarks: mockBookmarks,
  runtime: mockRuntime,
  notifications: mockNotifications,
  action: mockAction,
  i18n: mockI18n,
  alarms: mockAlarms,
}

// Mock process.env for logger
vi.stubEnv('NODE_ENV', 'test')
vi.stubEnv('LOG_LEVEL', 'error')