import React from 'react';
import classNames from 'classnames';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import styles from './Tooltip.module.scss';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';
type TooltipAlign = 'start' | 'center' | 'end';

interface TooltipProviderProps {
  children: React.ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
}

interface TooltipProps {
  children: React.ReactElement;
  content: React.ReactNode;
  placement?: TooltipPlacement;
  align?: TooltipAlign;
  sideOffset?: number;
  className?: string;
  disabled?: boolean;
}

export function TooltipProvider({
  children,
  delayDuration = 250,
  skipDelayDuration = 100,
  disableHoverableContent = true,
}: TooltipProviderProps): React.ReactElement {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent={disableHoverableContent}
    >
      {children}
    </TooltipPrimitive.Provider>
  );
}

/**
 * Use tooltips only for supplementary context. The trigger must remain a
 * focusable interactive element, and any essential information should stay
 * available without requiring hover or focus.
 *
 * Click/tap-to-toggle on both desktop and mobile (see #568): hover never
 * opens the tooltip, and clicking/tapping the trigger again - or anywhere
 * else - closes it.
 */
export default function Tooltip({
  children,
  content,
  placement = 'top',
  align = 'center',
  sideOffset = 8,
  className,
  disabled = false,
}: TooltipProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  // Tracks whether the trigger's current focus came from our own
  // pointerdown handler below, so that handler and handleFocus don't both
  // try to decide the open state for the same interaction.
  const pointerDownRef = React.useRef(false);

  if (disabled || content === null || content === undefined || content === false) {
    return <>{children}</>;
  }

  // Radix's Trigger opens on hover and unconditionally closes on click,
  // which fights a click/tap-to-toggle model on both counts. We take the
  // trigger's open/close decisions over entirely: hover is inert (handled
  // below), and pointerdown is the sole place we ever *open* it - never
  // close, because a pointerdown on an already-open trigger is also seen by
  // the open tooltip's own dismissable layer as an "outside" press (the
  // trigger isn't part of the portaled content), which closes it for us.
  // Deciding to close here too would race that, since our own pointerdown
  // handler runs in the bubble phase, after the layer's capture-phase
  // dismissal has already fired.
  const handlePointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    pointerDownRef.current = true;
    document.addEventListener(
      'pointerup',
      () => {
        pointerDownRef.current = false;
      },
      { once: true }
    );
    if (!open) setOpen(true);
  };

  // preventDefault() on pointerdown doesn't stop the resulting click event
  // for mouse pointers (only for touch, where it suppresses the
  // compatibility click outright) - so on desktop, Radix's own "click
  // always closes" trigger handler would still fire right after the
  // pointerdown above opens it. Taking the click event over too stops that.
  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  // Suppress Radix's hover-driven open/close entirely - hover is cursor
  // affordance only now, never a way to open or close the tooltip.
  const suppressHover = (event: React.PointerEvent) => {
    event.preventDefault();
  };

  const handleFocus = (event: React.FocusEvent) => {
    event.preventDefault();
    if (!pointerDownRef.current) setOpen(true);
  };

  return (
    <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger
        asChild
        className={styles.trigger}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onPointerMove={suppressHover}
        onPointerLeave={suppressHover}
        onFocus={handleFocus}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className={classNames(styles.content, className)}
          side={placement}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
        >
          {content}
          <TooltipPrimitive.Arrow className={styles.arrow} width={10} height={6} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
