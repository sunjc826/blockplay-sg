import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'choice' };

/** Native controls keep their keyboard, form, ref and accessibility behavior. */
export function MenuButton({ variant = 'secondary', className = '', type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={`ui-button ui-button-${variant} ${className}`.trim()} />;
}

export function MenuSelect({ className = '', ...props }: ComponentProps<'select'>) {
  return <select {...props} className={`ui-select ${className}`.trim()} />;
}

/** Cards are actions; selected/equipped state is supplied by the caller. */
export function MenuItemCard({ className = '', type = 'button', ...props }: ComponentProps<'button'>) {
  return <button {...props} type={type} className={`ui-item-card ${className}`.trim()} />;
}

/** Callers own roving focus and selection; links and buttons share the same skin. */
export function MenuTabs({ className = '', ...props }: ComponentProps<'div'>) {
  return <div {...props} role="tablist" className={`ui-tabs ${className}`.trim()} />;
}
