import React, { useEffect, useRef } from 'react';

interface TurnstileRenderOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  'timeout-callback'?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: TurnstileRenderOptions
      ) => string | undefined;
      remove: (widgetId: string) => void;
      reset: (widgetId?: string) => void;
    };
  }
}

interface TurnstileProps {
  sitekey: string;
  /** Called with the current token, or '' when it expires or errors. */
  onToken: (token: string) => void;
  className?: string;
}

// The Cloudflare script is loaded async from index.html, so it may not be
// available yet when this component mounts. Poll for it rather than relying on
// implicit rendering: implicit rendering only scans the DOM once, when the
// script loads, which never matches a widget mounted later by SPA navigation.
const POLL_INTERVAL_MS = 100;
const POLL_TIMEOUT_MS = 15000;

export default function Turnstile({
  sitekey,
  onToken,
  className,
}: TurnstileProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback in a ref so re-renders don't re-render the widget.
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;
    const startedAt = Date.now();

    const renderWidget = () => {
      const container = containerRef.current;
      if (cancelled || !container || !window.turnstile) return false;

      widgetId = window.turnstile.render(container, {
        sitekey,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
        'timeout-callback': () => onTokenRef.current(''),
      });
      return true;
    };

    if (!renderWidget()) {
      pollTimer = setInterval(() => {
        if (renderWidget() || Date.now() - startedAt > POLL_TIMEOUT_MS) {
          if (pollTimer) clearInterval(pollTimer);
        }
      }, POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
      onTokenRef.current('');
    };
  }, [sitekey]);

  return <div ref={containerRef} className={className} data-testid="turnstile" />;
}
