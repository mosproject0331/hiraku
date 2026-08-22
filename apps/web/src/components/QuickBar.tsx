'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/app/wizard', label: '物件を探す' },
  { href: '/app/diagnose', label: '法規制を診断' },
  { href: '/app/editor', label: '間取りをつくる' },
  { href: '/app/plan', label: '改修の相談' },
  { href: '/app/project', label: '案件を開く' },
] as const;

/** 紹介ページの最上部に置く、道具への直行バー */
export default function QuickBar() {
  const [resume, setResume] = useState<{ href: string; label: string } | null>(null);

  useEffect(() => {
    try {
      const projects = JSON.parse(window.localStorage.getItem('hiraku-projects') ?? '{}') as Record<
        string,
        { name?: string; updatedAt?: string }
      >;
      const latest = Object.values(projects).sort((a, b) =>
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
      )[0];
      if (latest?.name) {
        setResume({ href: '/app/project', label: `${latest.name} の続きから` });
        return;
      }
      const editor = JSON.parse(window.localStorage.getItem('hiraku-editor') ?? '{}') as {
        state?: { model?: { levels?: { walls?: unknown[] }[] } };
      };
      if ((editor.state?.model?.levels?.[0]?.walls?.length ?? 0) > 0) {
        setResume({ href: '/app/editor', label: '作りかけの間取りを開く' });
      }
    } catch {
      // 保存が読めなくても、通常のリンクは使える
    }
  }, []);

  return (
    <div className="quickbar">
      <div className="quickbar-in">
        <Link href="/app" className="quickbar-cta">
          道具を開く<span aria-hidden="true"> →</span>
        </Link>
        <div className="quickbar-links">
          {resume && (
            <Link href={resume.href} className="quickbar-resume">
              {resume.label}
            </Link>
          )}
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </div>
        <span className="quickbar-note">登録なしで、すぐ使えます</span>
      </div>
    </div>
  );
}
