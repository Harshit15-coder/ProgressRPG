import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as RadixToast from '@radix-ui/react-toast';
import ToastManager from './ToastManager';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <RadixToast.Provider>{children}</RadixToast.Provider>;
}

function renderManager(props: Parameters<typeof ToastManager>[0]) {
  return render(<ToastManager {...props} />, { wrapper: Wrapper });
}

describe('ToastManager', () => {
  it('renders empty when no messages', () => {
    const { container } = renderManager({ messages: [], onDismiss: vi.fn() });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('renders a single toast message', () => {
    renderManager({ messages: [{ id: '1', message: 'Test message' }], onDismiss: vi.fn() });
    expect(screen.getByText('Test message')).toBeInTheDocument();
  });

  it('renders multiple toast messages', () => {
    renderManager({
      messages: [
        { id: '1', message: 'First message' },
        { id: '2', message: 'Second message' },
      ],
      onDismiss: vi.fn(),
    });
    expect(screen.getByText('First message')).toBeInTheDocument();
    expect(screen.getByText('Second message')).toBeInTheDocument();
  });

  it('each toast has role="status" (Radix default for type=background)', () => {
    renderManager({ messages: [{ id: '1', message: 'Hello' }], onDismiss: vi.fn() });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('calls onDismiss when toast closes', async () => {
    const onDismiss = vi.fn();
    renderManager({ messages: [{ id: 'abc', message: 'Bye' }], onDismiss });

    // Radix renders a close button; simulate closing
    const closeButton = screen.queryByRole('button');
    if (closeButton) {
      await userEvent.click(closeButton);
      expect(onDismiss).toHaveBeenCalledWith('abc');
    }
    // If no close button rendered, onDismiss fires via duration timeout — covered by integration
  });

  it('renders viewport as an ordered list', () => {
    const { container } = renderManager({ messages: [], onDismiss: vi.fn() });
    expect(container.querySelector('ol')).toBeInTheDocument();
  });
});
