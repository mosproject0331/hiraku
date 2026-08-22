import AppNav from '@/components/AppNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="appshell">
      <AppNav />
      <div className="appbody">{children}</div>
    </div>
  );
}
