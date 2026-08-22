import AppNav from '@/components/AppNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="appshell">
      {/* キーボードだけで使う人が、ナビを飛ばして本文へ行けるように */}
      <a href="#main" className="skip">本文へ移動</a>
      <AppNav />
      <div className="appbody" id="main">
        {children}
      </div>
    </div>
  );
}
