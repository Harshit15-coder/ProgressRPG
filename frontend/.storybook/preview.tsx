import type { Preview } from '@storybook/react-vite';
import '../src/styles/main.scss';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'error' would fail CI on these pre-existing contrast issues; surface
      // them in the Storybook UI/test panel instead until they're fixed.
      test: 'todo',
    },
  },
};

export default preview;
