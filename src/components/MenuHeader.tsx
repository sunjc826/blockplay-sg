import type { ReactNode } from 'react';

/** A stable account anchor while the navigation and page content change. */
export default function MenuHeader({ children, profile, action, className = '' }: {
  children: ReactNode; profile: ReactNode; action?: ReactNode; className?: string;
}) {
  return <header className={`menu-header ${className}`}>
    <div className="menu-header-leading">{children}</div>
    {action && <div className="menu-header-action">{action}</div>}
    {profile}
  </header>;
}
