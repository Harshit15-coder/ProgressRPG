import ReactGADefault from 'react-ga4';

// Rollup's CJS interop wraps the module exports as the synthetic default
// (forceDefault=1), so the GA4 singleton ends up at .default.default in prod
// builds. Unwrap one layer defensively.
const ReactGA = (
  (ReactGADefault as unknown as { default: typeof ReactGADefault }).default ?? ReactGADefault
);

const GA_TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID as string | undefined;
const GA_TEST_MODE = import.meta.env.VITE_GA_TEST_MODE === 'true';

export const initGA = (): void => {
  if (!import.meta.env.PROD && !GA_TEST_MODE) return;
  if (!GA_TRACKING_ID) return;

  ReactGA.initialize(GA_TRACKING_ID, { testMode: GA_TEST_MODE });
};

export const logPageView = (path: string): void => {
  if (!import.meta.env.PROD && !GA_TEST_MODE) return;
  if (!GA_TRACKING_ID) return;

  ReactGA.send({ hitType: 'pageview', page: path });
};

export const trackEvent = (eventName: string, params: Record<string, unknown> = {}): void => {
  if (!import.meta.env.PROD && !GA_TEST_MODE) return;
  if (!GA_TRACKING_ID) return;

  ReactGA.event(eventName, params);
};
