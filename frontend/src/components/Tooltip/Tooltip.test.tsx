import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Tooltip, { TooltipProvider } from './Tooltip';

function renderTooltip() {
  render(
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip content="Helpful context">
        <button type="button">Hover me</button>
      </Tooltip>
    </TooltipProvider>
  );
}

describe('Tooltip', () => {
  it('shows on hover and hides when the pointer leaves', async () => {
    const user = userEvent.setup();

    renderTooltip();

    await user.hover(screen.getByRole('button', { name: 'Hover me' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Helpful context');

    await user.unhover(screen.getByRole('button', { name: 'Hover me' }));

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  it('shows on focus and wires the trigger to aria-describedby', async () => {
    const user = userEvent.setup();

    renderTooltip();

    await user.tab();

    const trigger = screen.getByRole('button', { name: 'Hover me' });
    const tooltip = await screen.findByRole('tooltip');

    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('dismisses when Escape is pressed', async () => {
    const user = userEvent.setup();

    renderTooltip();

    await user.tab();
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });
});
