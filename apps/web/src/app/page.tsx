import Link from 'next/link';

const CARDS = [
  {
    href: '/wizard',
    title: 'モードA: これから物件を探す',
    body: 'やりたい用途から「探すべき物件の条件」と「内見チェックリスト」を逆引きします。',
    ready: true,
  },
  {
    href: '/diagnose',
    title: 'モードB: 候補物件がある',
    body: '物件情報を入れると、法規制の論点・確認先・窓口で使える質問文を整理します。',
    ready: true,
  },
  {
    href: '/editor',
    title: '間取りエディタ',
    body: '図面が無くても大丈夫。壁を描いて間取りと簡易3Dをつくり、実測で精度を上げます。',
    ready: true,
  },
  {
    href: '/plan',
    title: '改修の相談(3案+概算)',
    body: '要望を伝えると最小案・標準案・攻め案の3案と、DIY/専門工事に分けた材料費レンジが出ます。',
    ready: true,
  },
  {
    href: '/project',
    title: 'プロジェクト(保存・統合ビュー)',
    body: '診断・間取り・実測・改修案をひとつの物件として保存し、確認事項ToDoとAI質問で伴走します。',
    ready: true,
  },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">HIRAKU<span className="ml-2 text-base font-normal text-slate-400">(仮称)</span></h1>
      <p className="mt-3 text-slate-600">
        空き家を活かして場をつくる人のための、現況把握と法規制の翻訳ツール。
        診断・見積は参考情報です。実際の可否は行政窓口・専門家に必ずご確認ください。
      </p>
      <div className="mt-8 grid gap-4">
        {CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.ready ? c.href : '#'}
            className={
              'rounded-lg border p-5 transition ' +
              (c.ready
                ? 'border-slate-300 bg-white hover:border-slate-400 hover:shadow-sm'
                : 'cursor-default border-dashed border-slate-300 bg-slate-50 opacity-70')
            }
          >
            <div className="font-semibold">
              {c.title}
              {!c.ready && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-500">準備中</span>}
            </div>
            <p className="mt-1 text-sm text-slate-600">{c.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
