import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import Button from './Button';
import ButtonFrame from './ButtonFrame';

/**
 * `Button` renders either a `<button>` or an `<a>` (via `as="a"`) with shared
 * styling. Use `variant` to select the visual style, and `icon` to prefix an
 * icon (hidden from assistive tech via `aria-hidden`).
 */
const meta: Meta<typeof Button> = {
  title: 'Shared/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger'],
    },
    as: {
      control: 'inline-radio',
      options: ['button', 'a'],
    },
  },
  args: {
    children: 'Click me',
    variant: 'primary',
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = {};

export const Secondary: Story = {
  args: { variant: 'secondary' },
};

export const Danger: Story = {
  args: { variant: 'danger' },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Click me' });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('aria-disabled', 'true');
  },
};

/** `as="a"` renders an anchor styled like a button, e.g. for external links. */
export const AsLink: Story = {
  args: { as: 'a', href: '/tasks', children: 'Go somewhere' },
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link', { name: 'Go somewhere' });
    await expect(link).toHaveAttribute('href', '/tasks');
  },
};

/**
 * `ButtonFrame` wraps one or more buttons (e.g. a form's submit/cancel pair)
 * to apply consistent spacing/alignment.
 */
export const InButtonFrame: Story = {
  render: (args) => (
    <ButtonFrame>
      <Button {...args}>Cancel</Button>
      <Button {...args} variant="primary">Save</Button>
    </ButtonFrame>
  ),
};
