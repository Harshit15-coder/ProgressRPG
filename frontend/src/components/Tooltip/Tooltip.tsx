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
  if (disabled || content === null || content === undefined || content === false) {
    return <>{children}</>;
  }

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
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
