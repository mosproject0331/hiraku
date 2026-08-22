'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { applyOps, detectRooms, type RenovationOp, type SpaceModel } from '@hiraku/core';
import { BASIS_LABEL, DIY_CLASS_LABEL, estimatePlan, type PlanEstimate } from '@hiraku/estimate';
import {
  canPropose, HANDS_LABEL, intakeProgress, nextQuestion, opsOf, QUESTIONS, roomNames, STAGE_LABEL,
  type Proposal, type Question, type Stage, type WorkStep,
} from '@hiraku/proposal';
import PlanPerspective from '@/components/PlanPerspective';
import { jp } from '@/components/Jp';
import { useEditor } from '@/lib/store';

/**
 * 改修の相談。
 *
 * 聞くことと、返すこと。どちらも順番が要る。
 * 問いは一度にひとつだけ出し、なぜ聞くのかを添える。
 * 案は「安い・普通・高い」ではなく、三つの構えとして並べ、
 * 段（開けるために要る／開けた日に効く／あとからでいい）で組む。
 */

const KANJI = ['壱', '弐', '参', '四', '伍'];
const STAGE_KANJI: Record<Stage, string> = { 1: '一', 2: '二', 3: '三' };
const yen = (n: number) => n.toLocaleString('ja-JP');

function opLabel(op: RenovationOp, model: SpaceModel, names?: Map<string, string>): string {
  const level = model.levels[0]!;
  const rooms = detectRooms(level);
  const roomName = (id: string) => names?.get(id) ?? rooms.find((r) => r.id === id)?.name ?? id;
  switch (op.op) {
    case 'remove_partition': return '間仕切り壁を撤去';
    case 'add_partition': return '間仕切り壁を新設';
    case 'add_opening': return '開口部を新設';
    case 'close_opening': return '開口部を塞ぐ';
    case 'change_floor': return `${roomName(op.roomId)}の床`;
    case 'change_wall_finish': return `${roomName(op.roomId)}の壁`;
    case 'change_ceiling': return `${roomName(op.roomId)}の天井`;
    case 'add_water_unit': return `${roomName(op.roomId)}に${{ kitchen: 'キッチン', toilet: 'トイレ', bath: '浴室', sink: '洗面' }[op.unit]}`;
    case 'insulate': return `${{ floor: '床下', ceiling: '天井', window_inner: '内窓' }[op.target]}の断熱`;
    case 'electrical': return `${{ add_outlet: 'コンセント', add_circuit: '専用回路', lighting_diy: '照明' }[op.work]} ×${op.count}`;
  }
}

/* ───────────────── ヒアリング ───────────────── */

function Intake() {
  const hearing = useEditor((s) => s.hearing);
  const answer = useEditor((s) => s.answerHearing);
  const make = useEditor((s) => s.makeProposals);
  const [draft, setDraft] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);

  const q = useMemo(() => {
    let next = nextQuestion(hearing);
    while (next && skipped.includes(next.id)) {
      const after = QUESTIONS.slice(QUESTIONS.findIndex((x) => x.id === next!.id) + 1).find(
        (x) => !skipped.includes(x.id) && hearing[x.id] === undefined,
      );
      next = after ?? null;
    }
    return next;
  }, [hearing, skipped]);

  const prog = intakeProgress(hearing);
  const ready = canPropose(hearing);

  const submit = (raw: string | number) => {
    if (!q) return;
    answer(q.id, raw);
    setDraft('');
  };

  const answered = QUESTIONS.filter((x) => hearing[x.id] !== undefined && String(hearing[x.id] ?? '').length > 0);

  return (
    <div className="intake">
      <header className="intake-head">
        <p className="intake-kicker">改修の相談</p>
        <h1 className="intake-title">{jp('この場を、何のための場にしますか。')}</h1>
        <p className="intake-sub">
          聞くのは{QUESTIONS.length}つ。答えたぶんだけ、案の精度が上がります。
          分からないものは飛ばして構いません。
        </p>
        <div className="intake-bar">
          <span style={{ width: `${Math.round((prog.answered / prog.total) * 100)}%` }} />
        </div>
      </header>

      {q ? (
        <section className="ask">
          <p className="ask-no">
            問 <b>{prog.answered + 1}</b> / {prog.total}
          </p>
          <h2 className="ask-q">{jp(q.ask)}</h2>
          <div className="ask-why">
            <span>なぜ聞くのか</span>
            <p>{q.why}</p>
          </div>

          <AnswerField q={q} draft={draft} setDraft={setDraft} onSubmit={submit} />

          <div className="ask-actions">
            {q.optional && (
              <button className="hb-btn hb-outline" onClick={() => setSkipped((s) => [...s, q.id])}>
                この問いは飛ばす
              </button>
            )}
            {ready && (
              <button className="hb-btn hb-dark" onClick={make}>
                ここまでで案を出す
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="ask">
          <h2 className="ask-q">{jp('聞くことは、ひととおり伺いました。')}</h2>
          <p className="ask-why-plain">図面・内見の記録・法規の診断と合わせて、三つの構えで案を組みます。</p>
          <button className="hb-btn hb-cta ask-go" onClick={make}>案を組む</button>
        </section>
      )}

      {answered.length > 0 && (
        <section className="answered">
          <h3>答えたこと</h3>
          <dl>
            {answered.map((a) => (
              <div key={a.id}>
                <dt>{a.ask.replace(/[。？?]$/, '')}</dt>
                <dd>
                  {formatAnswer(a, hearing[a.id])}
                  <button
                    onClick={() => {
                      useEditor.setState({ hearing: { ...hearing, [a.id]: undefined } });
                      setSkipped((s) => s.filter((x) => x !== a.id));
                    }}
                  >
                    直す
                  </button>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

function formatAnswer(q: Question, v: unknown): string {
  if (Array.isArray(v)) return v.join('・');
  if (q.options) return q.options.find((o) => o.value === String(v))?.label ?? String(v);
  if (typeof v === 'number') return v.toLocaleString('ja-JP') + (q.unit ?? '');
  if (typeof v === 'boolean') return v ? '住みながら' : '住まない';
  return String(v ?? '');
}

function AnswerField({
  q, draft, setDraft, onSubmit,
}: {
  q: Question; draft: string; setDraft: (v: string) => void; onSubmit: (v: string | number) => void;
}) {
  if (q.kind === 'choice' || q.kind === 'scale') {
    return (
      <div className="ask-choices">
        {q.options?.map((o) => (
          <button key={o.value} className="choice" onClick={() => onSubmit(o.value)}>
            <b>{o.label}</b>
            {o.hint && <em>{o.hint}</em>}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="ask-input">
      <input
        type={q.kind === 'number' ? 'number' : 'text'}
        inputMode={q.kind === 'number' ? 'numeric' : undefined}
        value={draft}
        placeholder={q.placeholder ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) onSubmit(q.kind === 'number' ? Number(draft) : draft);
        }}
      />
      {q.unit && <span className="ask-unit">{q.unit}</span>}
      <button
        className="hb-btn hb-cta"
        disabled={!draft.trim()}
        onClick={() => onSubmit(q.kind === 'number' ? Number(draft) : draft)}
      >
        次へ
      </button>
    </div>
  );
}

/* ───────────────── 案 ───────────────── */

function StepRow({ step, model, index, names }: { step: WorkStep; model: SpaceModel; index: number; names: Map<string, string> }) {
  return (
    <li className={'step by-' + step.by}>
      <span className="step-no">{String(index + 1).padStart(2, '0')}</span>
      <div className="step-body">
        <div className="step-head">
          <h4>{jp(step.title)}</h4>
          <span className="step-by">{HANDS_LABEL[step.by]}</span>
        </div>
        <p className="step-why">{step.why}</p>
        {step.ops.length > 0 && (
          <p className="step-ops">{step.ops.map((o) => opLabel(o, model, names)).join(' ／ ')}</p>
        )}
        {step.blockedBy?.map((b, i) => (
          <p key={i} className="step-block">先に確かめる — {b}</p>
        ))}
        {step.basedOn?.map((b, i) => (
          <p key={i} className="step-based">見たこと — {b}</p>
        ))}
      </div>
    </li>
  );
}

function ProposalSheet({ p, model, index }: { p: Proposal; model: SpaceModel; index: number }) {
  const router = useRouter();
  const priceBook = useEditor((s) => s.priceBook);
  const ops = useMemo(() => opsOf(p), [p]);
  const est: PlanEstimate = useMemo(() => estimatePlan(model, ops, priceBook), [model, ops, priceBook]);
  const unverified = est.unverified.length;
  const warnings = est.lines.filter((l) => l.structuralWarning);

  const stages: Stage[] = [1, 2, 3];
  const names = useMemo(() => roomNames(model), [model]);

  return (
    <article className="sheet">
      <header className="sheet-head">
        <span className="sheet-no">{KANJI[index] ?? index + 1}</span>
        <h2>{jp(p.name)}</h2>
        <p className="sheet-line">{jp(p.line)}</p>
      </header>

      <section className="sheet-because">
        <h3>なぜこの案か</h3>
        <p>{p.because}</p>
      </section>

      <PlanPerspective
        model={model}
        ops={ops}
        planName={p.name}
        desiredUse={useEditor.getState().hearing.use ?? useEditor.getState().lastDiagnosis?.input.desiredUse}
      />

      {stages.map((s) => {
        const steps = p.steps.filter((x) => x.stage === s);
        if (!steps.length) return null;
        return (
          <section key={s} className={'stage stage-' + s}>
            <h3>
              <span className="stage-kanji">{STAGE_KANJI[s]}</span>
              {STAGE_LABEL[s]}
            </h3>
            <ol className="steps">
              {steps.map((st, i) => (
                <StepRow key={st.id} step={st} model={model} index={i} names={names} />
              ))}
            </ol>
          </section>
        );
      })}

      <div className="sheet-cols">
        <section className="notnow">
          <h3>今回はやらないこと</h3>
          <ul>{p.notNow.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
        <section className="assume">
          <h3>置いている前提</h3>
          <ul>{p.assumptions.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </section>
      </div>

      <section className="nexttwo">
        <h3>次の一手</h3>
        <ol>{p.nextTwo.map((n, i) => <li key={i}>{n}</li>)}</ol>
      </section>

      {warnings.length > 0 && (
        <p className="hb-warn sheet-warn">
          この案には耐力壁の疑いがある壁への工事が含まれます。撤去・開口の可否は、現地で建築士の確認が要ります。
        </p>
      )}

      {p.fit?.budgetYen !== undefined && (
        <section className={'budget' + (p.fit!.over ? ' is-over' : '')}>
          <h3>予算に対して</h3>
          <div className="budget-row">
            <span>この案の見込み</span>
            <b className="num">{yen(p.fit!.lowYen)}〜{yen(p.fit!.highYen)}円</b>
          </div>
          <div className="budget-row">
            <span>聞いた予算</span>
            <b className="num">{yen(p.fit!.budgetYen)}円</b>
          </div>
          <div className="budget-bar">
            <span style={{ width: `${Math.min(100, Math.round((p.fit!.highYen / p.fit!.budgetYen) * 100))}%` }} />
          </div>
          <p>
            {p.fit!.over
              ? '開けるために要る手だけで、予算をはみ出しています。予算を上げるか、用途を軽い形に変えるかの二択です。'
              : p.fit!.trimmed.length
                ? `${p.fit!.trimmed.length}件を後ろの段から外して、予算に収めました。外したものは下に書いています。`
                : '予算のなかに収まっています。'}
          </p>
        </section>
      )}

      <section className="money">
        <div>
          <span>(a) 自分たちで動かす分{unverified > 0 && <em>参考値・要検証</em>}</span>
          <b>{yen(est.diyMaterial.lowYen)}〜{yen(est.diyMaterial.highYen)}円</b>
        </div>
        <div>
          <span>(b) 専門・有資格工事{unverified > 0 && <em>参考値・要検証</em>}</span>
          <b>{yen(est.proMaterial.lowYen)}〜{yen(est.proMaterial.highYen)}円</b>
        </div>
        <p className="money-note">
          (b)の施工費は含みません（要見積）。総額の一本値は出しません。
          内訳の種別 —{' '}
          {(Object.entries(est.basisMix) as [keyof typeof est.basisMix, number][])
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${BASIS_LABEL[k]} ${n}件`)
            .join(' / ')}
        </p>
        {unverified > 0 && (
          <p className="money-todo">
            この{est.lines.length}件のうち<b>{unverified}件</b>は、まだ自分の単価になっていません。
            いちばん金額が動くのは「{est.unverified[0]!.name}」です。{' '}
            <Link href="/app/prices">単価帳で埋める</Link>
          </p>
        )}
        {est.permitFlags.length > 0 && (
          <p className="money-note"><b>(c) 資格・届出</b> — {est.permitFlags.join(' / ')}</p>
        )}
      </section>

      <details className="breakdown">
        <summary>工事項目の内訳と手順（{est.lines.length}件）</summary>
        <div>
          {est.lines.map((l, i) => (
            <div key={i} className="bd-item">
              <div className="bd-top">
                <b>{l.name}</b>
                <span>{l.qty}{l.unit} ／ {yen(l.lowYen)}〜{yen(l.highYen)}円</span>
              </div>
              <div className="bd-tags">
                <span className={'bd-class c-' + l.diyClass}>{DIY_CLASS_LABEL[l.diyClass]}</span>
                <span className={'price-basis b-' + l.basis}>{BASIS_LABEL[l.basis]}</span>
                {!l.verified && <span className="bd-note">単価は{l.priceSource}</span>}
                {l.requiredLicense && <span className="bd-lic">{l.requiredLicense}</span>}
                {l.note && <span className="bd-note">{l.note}</span>}
              </div>
              <ol>{l.steps.map((s, j) => <li key={j}>{s}</li>)}</ol>
            </div>
          ))}
        </div>
      </details>

      <div className="sheet-actions">
        <button
          className="hb-btn hb-outline"
          onClick={() => {
            useEditor.getState().loadModel(applyOps(model, ops));
            router.push('/app/editor');
          }}
        >
          この案を間取りに写す
        </button>
        <button
          className="hb-btn hb-dark"
          onClick={() => {
            useEditor.getState().setPlans([{ name: p.name, intent: p.line, ops }]);
            router.push('/app/quote');
          }}
        >
          この案で見積書をつくる
        </button>
      </div>
    </article>
  );
}

/* ───────────────── 画面 ───────────────── */

export default function PlanPage() {
  const model = useEditor((s) => s.model);
  const proposals = useEditor((s) => s.proposals);
  const hearing = useEditor((s) => s.hearing);
  const reset = useEditor((s) => s.resetHearing);
  const make = useEditor((s) => s.makeProposals);
  const hasModel = model.levels.some((lv) => lv.walls.length > 0);

  // 案は持ち越さない（形が変わると古い案が壊れる）。聞いた内容から作り直す
  useEffect(() => {
    if (!proposals.length && hasModel && canPropose(hearing)) make();
  }, [proposals.length, hasModel, hearing, make]);

  if (!hasModel) {
    return (
      <main className="plan">
        <div className="intake">
          <header className="intake-head">
            <p className="intake-kicker">改修の相談</p>
            <h1 className="intake-title">{jp('先に、間取りが要ります。')}</h1>
            <p className="intake-sub">
              案は、この家の部屋の並び・窓の位置・傷んでいるところから組みます。
              図面が無いと、どの案も同じ顔になってしまいます。
            </p>
          </header>
          <a href="/app/editor" className="hb-btn hb-cta ask-go">間取りをつくる</a>
        </div>
      </main>
    );
  }

  if (!proposals.length) {
    return (
      <main className="plan">
        <Intake />
      </main>
    );
  }

  return (
    <main className="plan">
      <header className="plan-head">
        <div>
          <p className="intake-kicker">改修の三案</p>
          <h1 className="intake-title">{jp('同じ家を、三つの構えで見る。')}</h1>
        </div>
        <div className="plan-head-actions">
          <button className="hb-btn hb-outline" onClick={make}>組み直す</button>
          <button className="hb-btn hb-outline" onClick={reset}>聞き直す</button>
        </div>
      </header>
      <p className="plan-note">
        金額はすべて材料費ベースの参考レンジです。総額の一本値は出しません。
        案の順番は値段ではなく、どこに先に手を入れるかの違いです。
      </p>
      {proposals.map((p, i) => (
        <ProposalSheet key={p.id} p={p} model={model} index={i} />
      ))}
    </main>
  );
}
