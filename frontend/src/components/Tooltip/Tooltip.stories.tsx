import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import Tooltip, { TooltipProvider } from './Tooltip';
import Button from '../Button/Button';

/**
 * `Tooltip` wraps a single focusable trigger element and shows supplementary
 * content on hover/focus via Radix. It must be nested under a
 * `TooltipProvider` (mounted once near the app root). Use tooltips only for
 * supplementary context — essential information must remain available
 * without hovering or focusing.
 */
const meta: Meta<typeof Tooltip> = {
  title: 'Shared/Tooltip',
  component: Tooltip,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
  args: {
    content: 'Additional context shown on hover or focus',
    placement: 'top',
  },
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: (args) => (
    <Tooltip {...args}>
      <Button>Hover or focus me</Button>
    </Tooltip>
  ),
  play: async ({ canvas, userEvent, canvasElement }) => {
    const trigger = canvas.getByRole('button', { name: 'Hover or focus me' });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    // Tooltip content renders via a Radix Portal into document.body.
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole('tooltip');
    await expect(tooltip).toHaveTextContent('Additional context shown on hover or focus');
  },
};

export const Placements: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: '2rem', padding: '3rem' }}>
      {(['top', 'right', 'bottom', 'left'] as const).map((placement) => (
        <Tooltip key={placement} {...args} placement={placement} content={`Placement: ${placement}`}>
          <Button>{placement}</Button>
        </Tooltip>
      ))}
    </div>
  ),
};

/** When `disabled` (or `content` is empty), the trigger renders with no tooltip wiring. */
export const Disabled: Story = {
  render: (args) => (
    <Tooltip {...args} disabled>
      <Button>No tooltip</Button>
    </Tooltip>
  ),
};
