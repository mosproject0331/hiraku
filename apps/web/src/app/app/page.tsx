import Link from 'next/link';

const CARDS = [
  {
    href: '/app/wizard',
    title: 'これから物件を探す',
    body: 'やりたい用途から「探すべき物件の条件」と「内見チェックリスト」を逆引きします。',
    step: '01',
  },
  {
    href: '/app/diagnose',
    title: '候補物件を診断する',
    body: '物件情報を入れると、法規制の論点・確認先・窓口で使える質問文を整理します。',
    step: '02',
  },
  {
    href: '/app/editor',
    title: '間取りをつくる・測る',
    body: '図面が無くても大丈夫。壁を描いて間取りと簡易3Dをつくり、実測で精度を上げます。',
    step: '03',
  },
  {
    href: '/app/plan',
    title: '改修の相談（3案＋概算）',
    body: '要望を伝えると最小案・標準案・攻め案と、DIY／専門工事に分けた材料費レンジが出ます。',
    step: '04',
  },
  {
    href: '/app/project',
    title: 'プロジェクトとして保存',
    body: '診断・間取り・実測・改修案をひとつの物件にまとめ、確認事項ToDoとAI質問で伴走します。',
    step: '05',
  },
] as const;

export default function AppHome() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="hb-bar">
        <Link href="/" className="hb-logo"><span className="dot" />HIRAKU</Link>
        <span className="hb-badge" style={{ marginLeft: 4 }}>開発版</span>
        <Link href="/" className="hb-btn hb-outline" style={{ marginLeft: 'auto' }}>
          紹介ページ
        </Link>
      </div>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(32px,5vw,56px) clamp(20px,4vw,32px) 80px' }}>
        <h1 style={{ fontSize: 'clamp(1.6rem,3.4vw,2.1rem)', fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.3 }}>
          どこから確かめますか
        </h1>
        <p className="hb-muted" style={{ marginTop: 12, fontSize: 15, lineHeight: 1.85, maxWidth: '38em' }}>
          順番どおりでなくて構いません。気になるところから始めて、途中でいつでも行き来できます。
          入力した内容はこの端末に保存され、次に開いたときに続きから使えます。
        </p>

        <div style={{ display: 'grid', gap: 12, marginTop: 32 }}>
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="hb-panel"
              style={{ display: 'flex', gap: 18, alignItems: 'flex-start', transition: 'border-color .2s, transform .2s' }}
            >
              <span className="hb-faint num" style={{ fontSize: 13, fontWeight: 600, paddingTop: 2 }}>{c.step}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontWeight: 600, fontSize: '1.02rem' }}>{c.title}</span>
                <span className="hb-muted" style={{ display: 'block', marginTop: 6, fontSize: 14, lineHeight: 1.85 }}>{c.body}</span>
              </span>
              <span className="hb-faint" style={{ paddingTop: 2 }}>→</span>
            </Link>
          ))}
        </div>

        <p className="hb-faint" style={{ marginTop: 32, fontSize: 11.5, lineHeight: 1.9, borderTop: '1px solid var(--border-soft)', paddingTop: 20 }}>
          本ツールの診断・見積は情報整理を目的とした参考情報であり、法的助言、建築士による設計・調査、
          不動産取引の媒介ではありません。実際の可否・費用・安全性は、必ず所管行政庁および建築士等の専門家にご確認ください。
        </p>
      </main>
    </div>
  );
}
