import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import Input from './Input';

/**
 * `Input` is a labelled form field supporting text, checkbox, and password
 * (with a show/hide toggle) variants. `helpText` and `error` are wired to
 * `aria-describedby`/`aria-invalid` automatically.
 */
const meta: Meta<typeof Input> = {
  title: 'Shared/Input',
  component: Input,
  tags: ['autodocs'],
  args: {
    id: 'example-input',
    label: 'Email address',
    placeholder: 'you@example.com',
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

function ControlledInput(props: React.ComponentProps<typeof Input>) {
  const [value, setValue] = useState(props.value ?? '');
  const [checked, setChecked] = useState(props.checked ?? false);
  return (
    <Input
      {...props}
      value={value}
      checked={checked}
      onChange={(v) => (typeof v === 'boolean' ? setChecked(v) : setValue(v))}
    />
  );
}

export const Default: Story = {
  render: (args) => <ControlledInput {...args} />,
};

export const WithHelpText: Story = {
  render: (args) => <ControlledInput {...args} />,
  args: { helpText: "We'll never share your email." },
};

export const WithError: Story = {
  render: (args) => <ControlledInput {...args} />,
  args: { error: 'Enter a valid email address.' },
  play: async ({ canvas }) => {
    const input = canvas.getByLabelText('Email address');
    const error = canvas.getByRole('alert');
    await expect(error).toHaveTextContent('Enter a valid email address.');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute('aria-describedby', error.id);
  },
};

export const Password: Story = {
  render: (args) => <ControlledInput {...args} />,
  args: { id: 'example-password', label: 'Password', type: 'password' },
};

export const Checkbox: Story = {
  render: (args) => <ControlledInput {...args} />,
  args: { id: 'example-checkbox', label: 'Remember me', type: 'checkbox', checked: false },
};

export const Disabled: Story = {
  args: { disabled: true },
};
