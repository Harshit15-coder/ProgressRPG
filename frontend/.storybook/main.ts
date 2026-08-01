import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-vitest'
  ],
  framework: '@storybook/react-vite',
  viteFinal: async (config) => {
      config.base = '/ProgressRPG/storybook/';
    return config;
  }
};

export default config;
