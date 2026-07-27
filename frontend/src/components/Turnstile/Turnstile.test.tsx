import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import Turnstile from './Turnstile';

type Options = {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
};

function installTurnstile() {
  const rendered: { container: HTMLElement; options: Options; id: string }[] = [];
  const remove = vi.fn();
  let nextId = 0;
  window.turnstile = {
    render: (container: HTMLElement, options: Options) => {
      const id = `widget-${nextId++}`;
      rendered.push({ container, options, id });
      return id;
    },
    remove,
    reset: vi.fn(),
  };
  return { rendered, remove };
}

describe('Turnstile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.turnstile;
  });

  it('renders the widget explicitly when the script is already loaded', () => {
    const { rendered } = installTurnstile();

    render(<Turnstile sitekey="test-key" onToken={vi.fn()} />);

    expect(rendered).toHaveLength(1);
    expect(rendered[0].options.sitekey).toBe('test-key');
    expect(rendered[0].container).toBe(screen.getByTestId('turnstile'));
  });

  it('renders the widget once the async script becomes available', () => {
    render(<Turnstile sitekey="test-key" onToken={vi.fn()} />);

    // Script not loaded yet — nothing rendered, but the component keeps waiting.
    const { rendered } = installTurnstile();
    expect(rendered).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(rendered).toHaveLength(1);
  });

  it('reports the token from the widget callback', () => {
    const { rendered } = installTurnstile();
    const onToken = vi.fn();

    render(<Turnstile sitekey="test-key" onToken={onToken} />);
    rendered[0].options.callback?.('tok-123');

    expect(onToken).toHaveBeenCalledWith('tok-123');
  });

  it('clears the token when the widget expires or errors', () => {
    const { rendered } = installTurnstile();
    const onToken = vi.fn();

    render(<Turnstile sitekey="test-key" onToken={onToken} />);
    rendered[0].options.callback?.('tok-123');
    rendered[0].options['expired-callback']?.();
    expect(onToken).toHaveBeenLastCalledWith('');

    rendered[0].options['error-callback']?.();
    expect(onToken).toHaveBeenLastCalledWith('');
  });

  it('removes the widget on unmount', () => {
    const { rendered, remove } = installTurnstile();

    const { unmount } = render(<Turnstile sitekey="test-key" onToken={vi.fn()} />);
    unmount();

    expect(remove).toHaveBeenCalledWith(rendered[0].id);
  });

  it('stops polling after the timeout', () => {
    render(<Turnstile sitekey="test-key" onToken={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(20000);
    });

    const { rendered } = installTurnstile();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(rendered).toHaveLength(0);
  });
});
