import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Modal, { modalTrigger } from './Modal';

const Example = () => {
  const [open, setOpen] = useState(false);
  return <><button onClick={modalTrigger(() => setOpen(true))}>Open</button>{open && (
    <Modal aria-label="Example" onClose={() => setOpen(false)}>
      <button onClick={() => setOpen(false)}>Close</button>
      <input aria-label="Name" />
      <button disabled>Unavailable</button>
      <button hidden>Hidden</button>
      <button>Last</button>
    </Modal>
  )}</>;
};

describe('Modal', () => {
  it('remembers pointer triggers even when the browser does not focus clicked buttons', () => {
    render(<Example />);
    fireEvent.click(screen.getByText('Open'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByText('Open')).toHaveFocus();
  });

  it('enters, contains forward/backward focus, dismisses and restores the trigger', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByText('Open');
    await user.click(trigger);
    const first = screen.getByText('Close');
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByText('Last')).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    trigger.focus();
    expect(first).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('isolates the background and restores pre-existing isolation and scroll state', async () => {
    const user = userEvent.setup();
    const background = document.createElement('div');
    background.inert = true;
    document.body.append(background);
    document.body.style.overflow = 'auto';
    const { container, unmount } = render(<Example />);
    await user.click(screen.getByText('Open'));
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    await user.click(screen.getByText('Close'));
    expect(container.inert).not.toBe(true);
    expect(background.inert).toBe(true);
    expect(document.body.style.overflow).toBe('auto');
    unmount();
    background.remove();
    document.body.style.overflow = '';
  });

  it('dismisses only on the backdrop and uses the latest close callback', () => {
    const oldClose = vi.fn();
    const close = vi.fn();
    const { rerender } = render(<Modal aria-label="Example" onClose={oldClose}><p>Content</p></Modal>);
    rerender(<Modal aria-label="Example" onClose={close}><p>Content</p></Modal>);
    fireEvent.click(screen.getByText('Content'));
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('dialog'));
    expect(close).toHaveBeenCalledTimes(2);
    expect(oldClose).not.toHaveBeenCalled();
  });

  it('keeps an empty modal focusable and contains Tab', async () => {
    const user = userEvent.setup();
    render(<Modal aria-label="Empty" onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('dialog')).toHaveFocus();
  });
});
