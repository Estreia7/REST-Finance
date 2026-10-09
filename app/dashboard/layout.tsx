import type { ReactNode } from 'react';
import ImpersonationBanner from './components/ImpersonationBanner';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
      {/* Shown only while an administrator is signed in for support. */}
      <ImpersonationBanner />
    </div>
  );
}
