import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlertDialog from './AlertDialog';

function renderDialog(overrides: Partial<React.ComponentProps<typeof AlertDialog>> = {}) {
  const props = {
    open: true,
    title: 'Confirm action',
    description: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  render(<AlertDialog {...props} />);
  return props;
}

describe('AlertDialog', () => {
  it('renders title and description when open', () => {
    renderDialog();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Confirm action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderDialog({ open: false });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog({ confirmLabel: 'Yes, do it' });
    await user.click(screen.getByRole('button', { name: 'Yes, do it' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog({ cancelLabel: 'No thanks' });
    await user.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('wires aria-describedby to the description', () => {
    renderDialog();
    const dialog = screen.getByRole('alertdialog');
    const descId = dialog.getAttribute('aria-describedby');
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)).toHaveTextContent('Are you sure you want to proceed?');
  });
});
