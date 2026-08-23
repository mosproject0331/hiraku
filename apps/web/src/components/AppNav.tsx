'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import LlmStatus from '@/components/LlmStatus';

const MAIN = [
  { href: '/app/wizard', label: '探す', hint: 'これから物件を探す' },
  { href: '/app/diagnose', label: '診断', hint: '法規制を確かめる' },
  { href: '/app/editor', label: '間取り', hint: '図面をつくる・測る' },
  { href: '/app/site', label: '敷地', hint: '住所から場所と方位を決める' },
  { href: '/app/frame', label: '骨組み', hint: '柱と梁を見る・中を歩く' },
  { href: '/app/plan', label: '改修', hint: '3案と概算' },
  { href: '/app/checklist', label: '内見', hint: '現地で見るところを記録' },
  { href: '/app/survey', label: '調査書', hint: '現況調査報告書' },
  { href: '/app/quote', label: '見積書', hint: 'そのまま渡せる御見積書' },
  { href: '/app/project', label: '案件', hint: '保存・ToDo・質問' },
] as const;

const SETTINGS = [
  { href: '/app/prices', label: '単価データ' },
  { href: '/app/rules', label: 'ルールの確認' },
] as const;

export default function AppNav() {
  const path = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // 項目が増えて横に流れるので、いま開いている画面を見える位置へ寄せる
  useEffect(() => {
    const el = scroller.current?.querySelector('[data-on="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [path]);
  const isHome = path === '/app' || path === '/app/';

  return (
    <nav className="appnav" aria-label="機能の切り替え">
      <Link href="/app" className="hb-logo appnav-logo" aria-current={isHome ? 'page' : undefined}>
        <span className="dot" />HIRAKU
      </Link>

      <div className="appnav-scroll" ref={scroller}>
        {MAIN.map((m) => {
          const active = path.startsWith(m.href);
          return (
            <Link
              key={m.href}
              href={m.href}
              className="appnav-item"
              data-on={active}
              title={m.hint}
              aria-current={active ? 'page' : undefined}
            >
              {m.label}
            </Link>
          );
        })}
      </div>

      <div className="appnav-right">
        <LlmStatus />
        <div className="appnav-menu">
          <button
            type="button"
            className="hb-btn hb-outline appnav-more"
            aria-expanded={open}
            aria-haspopup="true"
            onClick={() => setOpen((v) => !v)}
          >
            設定
          </button>
          {open && (
            <>
              <button className="appnav-scrim" aria-label="閉じる" onClick={() => setOpen(false)} />
              <div className="appnav-pop" role="menu">
                {SETTINGS.map((s) => (
                  <Link key={s.href} href={s.href} role="menuitem" onClick={() => setOpen(false)}>
                    {s.label}
                  </Link>
                ))}
                <Link href="/" role="menuitem" onClick={() => setOpen(false)}>
                  紹介ページ
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
