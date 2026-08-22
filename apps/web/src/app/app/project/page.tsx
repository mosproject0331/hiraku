'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Project } from '@hiraku/core';
import { runDiagnosis } from '@hiraku/rules';
import { renderDiagnosisReport, renderSurveyReport } from '@hiraku/report';
import { estimatePlan } from '@hiraku/estimate';
import { nextHints } from '@hiraku/knowledge';
import ReportFrame from '@/components/ReportFrame';
import { useEditor } from '@/lib/store';

type Tab = 'overview' | 'diagnosis' | 'survey' | 'plans';

export default function ProjectPage() {
  const s = useEditor();
  const [tab, setTab] = useState<Tab>('overview');
  const [list, setList] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [saveMsg, setSaveMsg] = useState('');
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshList() {
    try {
      setList(await (await fetch('/api/projects')).json());
    } catch {
      setList([]);
    }
  }
  useEffect(() => {
    void refreshList();
  }, []);

  async function save() {
    const project = s.toProject();
    useEditor.setState({ projectId: project.id });
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(project),
    });
    setSaveMsg(res.ok ? '保存しました(' + new Date().toLocaleTimeString('ja-JP') + ')' : '保存に失敗しました');
    void refreshList();
  }

  async function load(id: string) {
    const res = await fetch('/api/projects/' + id);
    if (!res.ok) return;
    s.hydrateProject((await res.json()) as Project);
    setSaveMsg('読み込みました');
  }

  async function ask() {
    const q = question.trim();
    if (!q || busy) return;
    setQuestion('');
    setBusy(true);
    try {
      const context = JSON.stringify({
        name: s.projectName,
        rooms: s.model.levels[0]!.rooms.map((r) => ({ name: r.name, areaM2: r.areaM2 })),
        diagnosis: s.lastDiagnosis
          ? s.lastDiagnosis.report.findings.map((f) => ({ title: f.title, verdict: f.verdict, summary: f.summary }))
          : null,
        plans: s.lastPlans?.map((p) => p.name) ?? null,
        measurements: s.measurements.length,
        pins: s.damagePins.length,
      });
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: q, context }),
      });
      const { answer } = (await res.json()) as { answer: string };
      setQa((x) => [...x, { q, a: answer }]);
    } finally {
      setBusy(false);
    }
  }

  const hints = nextHints({
    hasModel: s.model.levels[0]!.walls.length > 0,
    roomCount: s.model.levels[0]!.rooms.length,
    hasDiagnosis: !!s.lastDiagnosis,
    heavyFindings: s.lastDiagnosis
      ? s.lastDiagnosis.report.findings.filter((f) => f.verdict === 'ng' || f.verdict === 'hard').length
      : 0,
    hasPlans: !!s.lastPlans?.length,
    measuredCount: s.measurements.length,
    pinCount: s.damagePins.length,
    todoTotal: 0,
    todoDone: Object.values(s.todoDone).filter(Boolean).length,
  });

  const todoItems = (s.lastDiagnosis?.report.findings ?? [])
    .filter((f) => f.verdict !== 'ok')
    .flatMap((f) =>
      f.confirmWith.map((desk, di) => ({
        key: f.id + ':' + di,
        desk,
        title: f.title,
        questions: f.questions,
      })),
    );

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: '概要・ToDo' },
    { id: 'diagnosis', label: '診断レポート' },
    { id: 'survey', label: '現況調査' },
    { id: 'plans', label: '改修3案' },
  ];

  return (
    <div className="flex h-screen flex-col bg-slate-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Link href="/app" className="text-sm font-semibold text-slate-500 hover:text-slate-800">HIRAKU</Link>
        <input
          value={s.projectName}
          onChange={(e) => s.setProjectName(e.target.value)}
          placeholder="物件・プロジェクト名"
          className="w-56 rounded border border-slate-300 px-3 py-1.5 text-sm"
        />
        <button onClick={() => void save()} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-700">
          保存
        </button>
        <span className="text-xs text-slate-500">{saveMsg}</span>
        <div className="ml-auto flex overflow-hidden rounded-md border border-slate-300">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={'px-3 py-1.5 text-sm ' + (tab === t.id ? 'bg-slate-800 text-white' : 'bg-white hover:bg-slate-50')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'overview' && (
          <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
            <section className="rounded-lg border border-slate-300 bg-white p-4">
              <h2 className="font-semibold">保存済みプロジェクト</h2>
              {list.length === 0 && <p className="mt-1 text-sm text-slate-400">まだありません。右上の「保存」で現在の状態を保存できます。</p>}
              <ul className="mt-2 divide-y divide-slate-100">
                {list.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-1.5 text-sm">
                    <span>{p.name}<span className="ml-2 text-xs text-slate-400">{p.updatedAt.slice(0, 16).replace('T', ' ')}</span></span>
                    <button onClick={() => void load(p.id)} className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                      読み込む
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {hints.length > 0 && (
              <section className="rounded-lg border border-slate-300 bg-white p-4">
                <h2 className="font-semibold">いま、考えてみてほしいこと</h2>
                <div className="mt-2 space-y-3">
                  {hints.map((h) => (
                    <p
                      key={h.id}
                      className={
                        'rounded-md px-4 py-3 text-sm leading-relaxed ' +
                        (h.kind === 'kokoro'
                          ? 'bg-stone-50 text-stone-700'
                          : 'border border-amber-200 bg-amber-50 text-amber-900')
                      }
                    >
                      {h.text}
                    </p>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-slate-300 bg-white p-4">
              <h2 className="font-semibold">確認事項ToDo — 窓口×質問文</h2>
              {todoItems.length === 0 && (
                <p className="mt-1 text-sm text-slate-400">
                  <Link href="/app/diagnose" className="underline">法規制診断</Link>を実行すると、確認先ごとのToDoがここに並びます。
                </p>
              )}
              <ul className="mt-2 space-y-2">
                {todoItems.map((it) => (
                  <li key={it.key} className="rounded border border-slate-200 p-2 text-sm">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={!!s.todoDone[it.key]}
                        onChange={() => s.toggleTodo(it.key)}
                        className="mt-1"
                      />
                      <span className={s.todoDone[it.key] ? 'text-slate-400 line-through' : ''}>
                        <b>{it.desk}</b>: {it.title}
                        <span className="mt-0.5 block text-xs text-slate-500">{it.questions[0]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-lg border border-slate-300 bg-white p-4">
              <h2 className="font-semibold">AIに質問する</h2>
              <p className="text-xs text-slate-500">このプロジェクトの内容(診断・間取り・計画)の範囲で答えます。範囲外は「判断できない」と答えます。</p>
              <div className="mt-2 space-y-2">
                {qa.map((x, i) => (
                  <div key={i} className="text-sm">
                    <div className="font-semibold">Q. {x.q}</div>
                    <div className="mt-0.5 whitespace-pre-wrap text-slate-700">{x.a}</div>
                  </div>
                ))}
                {busy && <div className="text-sm text-slate-400">考えています…</div>}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void ask()}
                  placeholder="例: 次に何をすればいいですか"
                  className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
                />
                <button onClick={() => void ask()} disabled={busy} className="rounded bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-40">
                  質問
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === 'diagnosis' &&
          (s.lastDiagnosis ? (
            <ReportFrame
              html={renderDiagnosisReport(
                s.lastDiagnosis.input,
                runDiagnosis(s.lastDiagnosis.input),
                s.regionPackId,
              )}
            />
          ) : (
            <p className="p-6 text-sm text-slate-500">
              診断がまだありません。<Link href="/app/diagnose" className="underline">モードB診断</Link>を実行してください。
            </p>
          ))}

        {tab === 'survey' && (
          <ReportFrame html={renderSurveyReport(s.model, s.measurements, s.damagePins, s.surveyNotes)} />
        )}

        {tab === 'plans' && (
          <div className="mx-auto max-w-4xl px-6 py-6">
            {!s.lastPlans && (
              <p className="text-sm text-slate-500">
                改修案がまだありません。<Link href="/app/plan" className="underline">改修の相談</Link>で3案をつくってください。
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-3">
              {(s.lastPlans ?? []).map((p) => {
                const est = estimatePlan(s.model, p.ops, s.priceBook);
                return (
                  <div key={p.name} className="rounded-lg border border-slate-300 bg-white p-4 text-sm">
                    <div className="font-bold">{p.name}</div>
                    <p className="mt-1 text-slate-600">{p.intent}</p>
                    <div className="mt-2 text-xs text-slate-500">
                      DIY材料費 {est.diyMaterial.lowYen.toLocaleString()}〜{est.diyMaterial.highYen.toLocaleString()}円 /
                      専門材料費 {est.proMaterial.lowYen.toLocaleString()}〜{est.proMaterial.highYen.toLocaleString()}円
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">参考値・要検証</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
