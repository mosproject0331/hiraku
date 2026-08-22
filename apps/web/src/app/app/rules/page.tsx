'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { RULES, VERDICT_LABEL, VERDICT_MARK, type DiagnosisInput, type Verdict } from '@hiraku/rules';

/** ルール25本を実務目線で見直すためのレビューシート（印刷可） */
const BASE: DiagnosisInput = {
  address: '（レビュー用のサンプル入力）',
  youtoChiiki: 'dai1_jukyo',
  kuikiKubun: 'shigaika',
  bokaChiiki: 'junboka',
  setsudo: { roadWidthM: 4, frontageM: 4, flag: 'ok' },
  floorAreaM2: 150,
  floors: 2,
  builtYear: 1975,
  kensazumi: 'no',
  currentUse: 'jutaku',
  desiredUse: 'cafe',
  landCategory: 'hatake',
  haisui: 'jokaso',
};

export default function RulesReviewPage() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const rows = useMemo(
    () =>
      RULES.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        applies: r.appliesTo(BASE),
        f: r.appliesTo(BASE) ? r.evaluate(BASE) : null,
      })),
    [],
  );
  const checked = Object.values(done).filter(Boolean).length;

  return (
    <div style={{ minHeight: '100vh' }}>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: 'clamp(24px,4vw,40px) clamp(20px,4vw,32px) 80px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 'clamp(1.4rem,3vw,1.8rem)', fontWeight: 600, letterSpacing: '-.02em' }}>
            法規制ルール {RULES.length}本の文面レビュー
          </h1>
          <span className="hb-badge no-print">{checked} / {RULES.length} 確認済み</span>
          <button onClick={() => window.print()} className="hb-btn hb-dark no-print" style={{ marginLeft: 'auto' }}>
            印刷 / PDF保存
          </button>
        </div>
        <p className="hb-muted" style={{ marginTop: 12, fontSize: 14, lineHeight: 1.85, maxWidth: '42em' }}>
          利用者に出る文面をそのまま並べています。実務目線で「言い過ぎ」「足りない」「窓口が違う」を見つけたら、
          その項目のIDを控えて <code>packages/rules/src/rules/all.ts</code> を直してください。
          チェックはこの端末にのみ残ります。
        </p>
        <p className="hb-faint" style={{ fontSize: 12, marginTop: 10 }}>
          サンプル入力: 第一種住居地域／市街化区域／準防火／幅員4m／延床150㎡／1975年／検査済証なし／住宅→カフェ／地目=畑／浄化槽
        </p>

        <div style={{ display: 'grid', gap: 12, marginTop: 26 }}>
          {rows.map((r) => (
            <section key={r.id} className="hb-panel" style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={!!done[r.id]}
                  onChange={() => setDone((d) => ({ ...d, [r.id]: !d[r.id] }))}
                  style={{ marginTop: 5 }}
                  aria-label={`${r.title} を確認済みにする`}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: '1rem' }}>{r.title}</b>
                    <span className="hb-badge">{r.category}</span>
                    <span className="hb-faint" style={{ fontSize: 11 }}>{r.id}</span>
                    {r.f && (
                      <span className="hb-badge">
                        {VERDICT_MARK[r.f.verdict as Verdict]} {VERDICT_LABEL[r.f.verdict as Verdict]}
                      </span>
                    )}
                    {!r.applies && <span className="hb-badge">このサンプルでは非該当</span>}
                  </div>
                  {r.f && (
                    <>
                      <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.85 }}>{r.f.summary}</p>
                      <p className="hb-muted" style={{ marginTop: 8, fontSize: 13.5, lineHeight: 1.85 }}>{r.f.detail}</p>
                      <p className="hb-faint" style={{ marginTop: 8, fontSize: 12 }}>
                        確認先: {r.f.confirmWith.join(' / ') || 'なし'}
                      </p>
                      <ul style={{ marginTop: 8, paddingLeft: '1.1em' }}>
                        {r.f.questions.map((q, i) => (
                          <li key={i} className="hb-muted" style={{ fontSize: 13, lineHeight: 1.8 }}>「{q}」</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      </main>

      <style>{`@media print{.no-print{display:none}.hb-panel{break-inside:avoid;box-shadow:none}}`}</style>
    </div>
  );
}
