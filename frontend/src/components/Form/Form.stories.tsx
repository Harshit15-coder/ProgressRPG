import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';
import Form from './Form';

/**
 * `Form` renders a declarative set of `fields` alongside a submit button,
 * wiring up per-field blur-triggered validation display and server-side
 * `fieldErrors` (e.g. from a failed API call).
 */
const meta: Meta<typeof Form> = {
  title: 'Shared/Form',
  component: Form,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Form>;

function DemoForm(props: Partial<React.ComponentProps<typeof Form>>) {
  const [values, setValues] = useState<Record<string, string>>({ email: '', password: '' });

  return (
    <Form
      title="Sign in"
      submitLabel="Sign in"
      onSubmit={(e) => e.preventDefault()}
      fields={[
        {
          name: 'email',
          label: 'Email address',
          type: 'email',
          value: values.email,
          onChange: (v) => setValues((prev) => ({ ...prev, email: v as string })),
          required: true,
        },
        {
          name: 'password',
          label: 'Password',
          type: 'password',
          value: values.password,
          onChange: (v) => setValues((prev) => ({ ...prev, password: v as string })),
          required: true,
        },
      ]}
      {...props}
    />
  );
}

export const Default: Story = {
  render: (args) => <DemoForm {...args} />,
};

export const Submitting: Story = {
  render: (args) => <DemoForm {...args} isSubmitting />,
};

/** Field-level errors, e.g. returned by the API after a failed submission. */
export const WithFieldErrors: Story = {
  render: (args) => (
    <DemoForm {...args} fieldErrors={{ email: ['This email is already registered.'] }} />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('This email is already registered.')).toBeVisible();
    await expect(canvas.getByLabelText(/Email address/)).toHaveAttribute('aria-invalid', 'true');
  },
};
