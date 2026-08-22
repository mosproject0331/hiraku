'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  applyOps,
  detectRooms,
  serialize,
  type RenovationOp,
  type SpaceModel,
} from '@hiraku/core';
import { DIY_CLASS_LABEL, estimatePlan, type PlanEstimate } from '@hiraku/estimate';
import type { HearingPlan } from '@hiraku/llm';
import { useEditor } from '@/lib/store';

function yen(n: number): string {
  return n.toLocaleString('ja-JP');
}

function opLabel(op: RenovationOp, model: SpaceModel): string {
  const level = model.levels[0]!;
  const rooms = detectRooms(level);
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? id;
  switch (op.op) {
    case 'remove_partition': return '間仕切り壁を撤去する';
    case 'add_partition': return '間仕切り壁を新設する';
    case 'add_opening': return '開口部を新設する';
    case 'close_opening': return '開口部をふさぐ';
    case 'change_floor': return `${roomName(op.roomId)}の床を替える`;
    case 'change_wall_finish': return `${roomName(op.roomId)}の壁を仕上げ直す`;
    case 'change_ceiling': return `${roomName(op.roomId)}の天井を仕上げ直す`;
    case 'add_water_unit': {
      const u = { kitchen: 'キッチン', toilet: 'トイレ', bath: '風呂', sink: '洗面' }[op.unit];
      return `${roomName(op.roomId)}に${u}を新設する`;
    }
    case 'insulate': {
      const t = { floor: '床下断熱', ceiling: '天井断熱', window_inner: '内窓' }[op.target];
      return `${t}を入れる`;
    }
    case 'electrical': {
      const w = { add_outlet: 'コンセント増設', add_circuit: '専用回路増設', lighting_diy: '照明器具の取付' }[op.work];
      return `${w} × ${op.count}`;
    }
  }
}

function PlanCard({ plan, model }: { plan: HearingPlan; model: SpaceModel }) {
  const router = useRouter();
  const est: PlanEstimate = estimatePlan(model, plan.ops);
  const warnings = est.lines.filter((l) => l.structuralWarning);
  return (
    <div className="rounded-lg border border-slate-300 bg-white p-4">
      <div className="text-lg font-bold">{plan.name}</div>
      <p className="mt-1 text-sm text-slate-600">{plan.intent}</p>

      <ul className="mt-3 list-disc pl-5 text-sm">
        {plan.ops.map((op, i) => (
          <li key={i}>{opLabel(op, model)}</li>
        ))}
      </ul>

      {warnings.length > 0 && (
        <div className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">
          <b>構造確認要:</b> この案には耐力壁の疑いがある壁への工事が含まれます。撤去・開口の可否は現地で専門家の確認が必要です。
        </div>
      )}

      <div className="mt-3 grid gap-1 rounded bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>(a) DIY材料費<span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">参考値・要検証</span></span>
          <b>{yen(est.diyMaterial.lowYen)}〜{yen(est.diyMaterial.highYen)}円</b>
        </div>
        <div className="flex justify-between">
          <span>(b) 専門・有資格工事の材料費<span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">参考値・要検証</span></span>
          <b>{yen(est.proMaterial.lowYen)}〜{yen(est.proMaterial.highYen)}円</b>
        </div>
        <div className="text-xs text-slate-500">(b)の施工費は含みません(要見積)。総額の一本値は出しません。</div>
        {est.permitFlags.length > 0 && (
          <div className="mt-1 text-xs text-slate-600">
            <b>(c) 資格・届出:</b> {est.permitFlags.join(' / ')}
          </div>
        )}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-600">工事項目の内訳と手順({est.lines.length}件)</summary>
        <div className="mt-2 space-y-2">
          {est.lines.map((l, i) => (
            <div key={i} className="rounded border border-slate-200 p-2">
              <div className="flex items-center justify-between">
                <b>{l.name}</b>
                <span className="text-xs text-slate-500">{l.qty}{l.unit} / {yen(l.lowYen)}〜{yen(l.highYen)}円</span>
              </div>
              <div className="mt-0.5 text-xs">
                <span className={
                  'rounded px-1.5 py-0.5 ' +
                  (l.diyClass === 'diy' ? 'bg-green-100 text-green-800'
                    : l.diyClass === 'diy_hard' ? 'bg-lime-100 text-lime-800'
                    : l.diyClass === 'licensed' ? 'bg-red-100 text-red-800'
                    : 'bg-slate-200 text-slate-700')
                }>
                  {DIY_CLASS_LABEL[l.diyClass]}
                </span>
                {l.requiredLicense && <span className="ml-2 text-red-700">{l.requiredLicense}</span>}
                {l.note && <span className="ml-2 text-slate-500">{l.note}</span>}
              </div>
              <ol className="mt-1 list-decimal pl-5 text-xs text-slate-600">
                {l.steps.map((s, j) => <li key={j}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>
      </details>

      <button
        onClick={() => {
          const next = applyOps(model, plan.ops);
          useEditor.getState().loadModel(next);
          router.push('/app/editor');
        }}
        className="mt-3 w-full rounded border border-slate-300 py-2 text-sm hover:bg-slate-50"
      >
        この案を間取りに適用して見る
      </button>
    </div>
  );
}

export default function PlanPage() {
  const model = useEditor((s) => s.model);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [plans, setPlans] = useState<HearingPlan[] | null>(null);
  const [busy, setBusy] = useState(false);

  const hasModel = model.levels[0]!.walls.length > 0;

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const userMessages = [...messages.filter((m) => m.role === 'user').map((m) => m.text), text];
    setMessages((ms) => [...ms, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/hearing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ modelJson: serialize(model), userMessages }),
      });
      const turn = (await res.json()) as { reply?: string; plans?: HearingPlan[]; error?: string };
      if (turn.error) throw new Error(turn.error);
      if (turn.reply) setMessages((ms) => [...ms, { role: 'assistant', text: turn.reply! }]);
      if (turn.plans) {
        setPlans(turn.plans);
        useEditor.getState().setPlans(turn.plans);
      }
    } catch (e) {
      setMessages((ms) => [...ms, { role: 'assistant', text: 'エラーが起きました: ' + (e instanceof Error ? e.message : '') }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <Link href="/app" className="text-sm text-slate-500 hover:text-slate-800">← HIRAKU</Link>
      <h1 className="mt-2 text-2xl font-bold">改修の相談</h1>
      <p className="mt-1 text-sm text-slate-600">
        いまエディタにある間取り({model.levels[0]!.rooms.length}部屋)をもとに、要望を聞いて3案つくります。
        金額はすべて材料費ベースの参考レンジです。
      </p>

      {!hasModel && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          間取りがまだ空です。先に<Link href="/app/editor" className="underline">エディタ</Link>でサンプルを読み込むか、壁を描いてください。
        </div>
      )}

      <div className="mt-5 rounded-lg border border-slate-300 bg-white">
        <div className="max-h-72 space-y-2 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-sm text-slate-400">
              例:「みんなが集まれる土間のカフェにしたい。できるだけ自分たちで直したい」
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <span
                className={
                  'inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ' +
                  (m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-slate-100')
                }
              >
                {m.text}
              </span>
            </div>
          ))}
          {busy && <div className="text-sm text-slate-400">考えています…</div>}
        </div>
        <div className="flex gap-2 border-t border-slate-200 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void send()}
            disabled={!hasModel || busy}
            placeholder="やりたいこと・予算感・自分でやりたい度合いなど"
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button onClick={() => void send()} disabled={!hasModel || busy} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-40">
            送信
          </button>
        </div>
      </div>

      {plans && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <PlanCard key={p.name} plan={p} model={model} />
          ))}
        </div>
      )}
    </main>
  );
}
