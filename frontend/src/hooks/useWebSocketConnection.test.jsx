import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebSocketConnection } from './useWebSocketConnection';

const mockGetValidAccessToken = vi.fn();
const sockets = [];

vi.mock('../utils/api', () => ({
  getValidAccessToken: (...args) => mockGetValidAccessToken(...args),
}));

class MockWebSocket {
  static OPEN = 1;

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.send = vi.fn();
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    // Mirrors real browser: close() transitions state and fires onclose
    this.close = vi.fn((code = 1000) => {
      this.readyState = 3;
      this.onclose?.({ code });
    });
    sockets.push(this);
  }
}

// Stable callback refs must be defined outside the renderHook lambda — inline
// vi.fn() calls create new references on each render, changing the connect
// useCallback dependency and triggering spurious effect cleanups.
const makeCallbacks = () => ({
  onMessage: vi.fn(),
  onError: vi.fn(),
  onClose: vi.fn(),
  onOpen: vi.fn(),
});

describe('useWebSocketConnection', () => {
  beforeEach(() => {
    sockets.length = 0;
    mockGetValidAccessToken.mockReset();
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('connects with a JWT query parameter instead of calling ws_auth', async () => {
    mockGetValidAccessToken.mockResolvedValue('test-access-token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    const { result } = renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await waitFor(() => {
      expect(mockGetValidAccessToken).toHaveBeenCalledTimes(1);
      expect(sockets).toHaveLength(1);
    });

    expect(sockets[0].url).toBe(
      'ws://localhost:8000/ws/profile_42/?token=test-access-token'
    );

    act(() => {
      sockets[0].readyState = MockWebSocket.OPEN;
      sockets[0].onopen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('does not connect when shouldConnect is false', async () => {
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen, false)
    );

    await act(async () => {});

    expect(sockets).toHaveLength(0);
    expect(mockGetValidAccessToken).not.toHaveBeenCalled();
  });

  it('sets isConnected to false and calls onError on socket error', async () => {
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    const { result } = renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await waitFor(() => expect(sockets).toHaveLength(1));

    act(() => {
      sockets[0].readyState = MockWebSocket.OPEN;
      sockets[0].onopen();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      sockets[0].onerror(new Event('error'));
    });

    expect(result.current.isConnected).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('sets isConnected to false and calls onClose on socket close', async () => {
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    const { result } = renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await waitFor(() => expect(sockets).toHaveLength(1));

    act(() => {
      sockets[0].readyState = MockWebSocket.OPEN;
      sockets[0].onopen();
    });

    act(() => {
      sockets[0].onclose({ code: 1006 });
    });

    expect(result.current.isConnected).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reconnects after unexpected close and fetches a fresh token', async () => {
    vi.useFakeTimers();
    mockGetValidAccessToken.mockResolvedValue('token-v1');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await act(async () => {});
    expect(sockets).toHaveLength(1);

    mockGetValidAccessToken.mockResolvedValue('token-v2');

    act(() => { sockets[0].onclose({ code: 1006 }); });

    // Advance past RECONNECT_DELAY_MS (3000ms), then flush the async connect()
    act(() => { vi.advanceTimersByTime(3000); });
    await act(async () => {});

    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toContain('token=token-v2');
  });

  it('does not reconnect after normal closure (code 1000)', async () => {
    vi.useFakeTimers();
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await act(async () => {});

    act(() => { sockets[0].onclose({ code: 1000 }); });
    act(() => { vi.advanceTimersByTime(5000); });
    await act(async () => {});

    expect(sockets).toHaveLength(1);
  });

  it('does not reconnect after going away (code 1001)', async () => {
    vi.useFakeTimers();
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await act(async () => {});

    act(() => { sockets[0].onclose({ code: 1001 }); });
    act(() => { vi.advanceTimersByTime(5000); });
    await act(async () => {});

    expect(sockets).toHaveLength(1);
  });

  it('does not reconnect after disconnect() is called', async () => {
    vi.useFakeTimers();
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    const { result } = renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await act(async () => {});
    expect(sockets).toHaveLength(1);

    act(() => { result.current.disconnect(); });
    act(() => { vi.advanceTimersByTime(5000); });
    await act(async () => {});

    expect(sockets).toHaveLength(1);
    expect(result.current.isConnected).toBe(false);
  });

  it('disconnect() cancels a pending reconnect timeout', async () => {
    vi.useFakeTimers();
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    const { result } = renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await act(async () => {});

    // Trigger a reconnect countdown via unexpected close
    act(() => { sockets[0].onclose({ code: 1006 }); });

    // Disconnect before the 3s timer fires
    act(() => { result.current.disconnect(); });

    act(() => { vi.advanceTimersByTime(5000); });
    await act(async () => {});

    expect(sockets).toHaveLength(1);
  });

  it('does not retry after getValidAccessToken throws unauthorized', async () => {
    vi.useFakeTimers();
    mockGetValidAccessToken.mockRejectedValue(new Error('Unauthorized'));

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    // Flush the initial failing connect()
    await act(async () => {});

    act(() => { vi.advanceTimersByTime(10000); });
    await act(async () => {});

    expect(sockets).toHaveLength(0);
    expect(mockGetValidAccessToken).toHaveBeenCalledTimes(1);
  });

  it('parses JSON messages and forwards them to onMessage', async () => {
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await waitFor(() => expect(sockets).toHaveLength(1));

    act(() => {
      sockets[0].onmessage({ data: JSON.stringify({ type: 'xp_update', amount: 50 }) });
    });

    expect(onMessage).toHaveBeenCalledWith({ type: 'xp_update', amount: 50 });
  });

  it('closes the socket and cancels any pending reconnect on unmount', async () => {
    vi.useFakeTimers();
    mockGetValidAccessToken.mockResolvedValue('token');

    const { onMessage, onError, onClose, onOpen } = makeCallbacks();
    const { unmount } = renderHook(() =>
      useWebSocketConnection(42, onMessage, onError, onClose, onOpen)
    );

    await act(async () => {});
    expect(sockets).toHaveLength(1);

    // Start a reconnect countdown
    act(() => { sockets[0].onclose({ code: 1006 }); });

    unmount();

    act(() => { vi.advanceTimersByTime(5000); });
    await act(async () => {});

    expect(sockets).toHaveLength(1);
    expect(sockets[0].close).toHaveBeenCalled();
  });
});
