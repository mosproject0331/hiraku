'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import './landing.css';

const USES = [
  { slug: 'cafe', label: 'カフェ' },
  { slug: 'minpaku', label: '宿' },
  { slug: 'sharehouse', label: 'シェアハウス' },
  { slug: 'atelier', label: '工房' },
] as const;

export default function Landing() {
  const [use, setUse] = useState<(typeof USES)[number]>(USES[0]);

  useEffect(() => {
    const els = document.querySelectorAll('.rv');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.08 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing">
      <header>
        <div className="wrap">
          <div className="bar">
            <a className="logo" href="#top"><span className="dot"></span>HIRAKU</a>
            <nav className="mainnav" aria-label="主要ナビゲーション">
              <a href="#features">機能</a><a href="#usecases">できること</a><a href="#onsite">現地調査</a><a href="#pricing">プラン</a><a href="#faq">よくある質問</a>
            </nav>
            <Link className="btn btn-cta btn-sm" href="/app">はじめる</Link>
          </div>
        </div>
      </header>

      <main id="top">

      {/*HERO*/}
      <section className="hero">
        <div className="wrap">
          <h1>動画一本から、<br />空き家の可能性を確かめる</h1>
          <p className="sub">法規制の診断、間取りと3Dの作成、改修計画と概算見積まで。<br />空き家を活かしたい人のための、確かめるための道具です。</p>

          <div className="prompt">
            <p className="phx"><b>築60年の空き家を{use.label}にしたい。</b>用途地域は不明、延床は120㎡くらい。何から確かめればいい？<span className="cursor"></span></p>
            <div className="prow">
              <div className="chips" role="group" aria-label="やりたいこと">
                {USES.map((u) => (
                  <button
                    key={u.slug}
                    className="chip"
                    type="button"
                    aria-pressed={use.slug === u.slug}
                    onClick={() => setUse(u)}
                  >［{u.label}］</button>
                ))}
              </div>
              <Link className="btn btn-cta" href={`/app/diagnose?use=${use.slug}`}>診断する<span className="ar">→</span></Link>
            </div>
          </div>
          <p className="hero-note">クレジットカード不要 ／ 開発版につき無料で利用できます</p>
          <figure className="mock rv" aria-label="診断レポートの画面イメージ">
            <svg viewBox="0 0 1060 470" width="100%" role="img" aria-hidden="true" style={{display:'block'}}>
              <defs>
                <filter id="gr"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
                <clipPath id="cpL"><rect x="0" y="44" width="396" height="426"/></clipPath>
              </defs>
              <rect width="1060" height="470" fill="#fff"/>
              {/*top bar*/}
              <rect width="1060" height="44" fill="#f4f1ec"/><path d="M0 44H1060" stroke="#e9e4dc"/>
              <circle cx="24" cy="22" r="4.5" fill="#ded8ce"/><circle cx="40" cy="22" r="4.5" fill="#ded8ce"/><circle cx="56" cy="22" r="4.5" fill="#ded8ce"/>
              <text x="80" y="26" fontFamily="Geist" fontSize="12.5" fill="#6d6a67">三田市 ○○町 ／ 木造平屋 120㎡ ／ 築60年</text>
              <text x="960" y="26" fontFamily="Geist" fontSize="11.5" fill="#918d88">診断 2/8 完了</text>

              {/*LEFT: orange verdict field*/}
              <g clipPath="url(#cpL)">
                <rect x="0" y="44" width="396" height="426" fill="#ff773c"/>
                <rect x="0" y="44" width="396" height="426" filter="url(#gr)" className="grain" opacity=".14" style={{mixBlendMode:'multiply'}}/>
                <text x="36" y="104" fontFamily="Geist" fontSize="13" fontWeight="600" fill="#181818" opacity=".62">やりたいこと</text>
                <text x="36" y="136" fontFamily="Geist" fontSize="24" fontWeight="600" fill="#181818" letterSpacing="-.5">カフェ営業</text>
                <text x="36" y="212" fontFamily="Geist" fontSize="86" fontWeight="600" fill="#181818" letterSpacing="-3">条件付き</text>
                <text x="36" y="248" fontFamily="Geist" fontSize="13.5" fill="#181818" opacity=".72">用途変更の手続きと、保健所の施設基準が鍵になります</text>
                <path d="M36 282H360" stroke="#181818" strokeOpacity=".2"/>
                <g fontFamily="Geist" fontSize="13" fill="#181818">
                  <text x="36" y="312">確認できた項目</text><text x="360" y="312" textAnchor="end" fontWeight="600">14</text>
                  <text x="36" y="344">情報が足りない項目</text><text x="360" y="344" textAnchor="end" fontWeight="600">6</text>
                  <text x="36" y="376">要専門家確認</text><text x="360" y="376" textAnchor="end" fontWeight="600">2</text>
                </g>
                <path d="M36 288H360" stroke="none"/>
                <rect x="36" y="404" width="150" height="34" rx="17" fill="#181818"/>
                <text x="111" y="426" textAnchor="middle" fontFamily="Geist" fontSize="13" fontWeight="600" fill="#ff773c">レポートを印刷</text>
              </g>
              <path d="M396 44V470" stroke="#e9e4dc"/>

              {/*RIGHT: plan + rules*/}
              <rect x="396" y="44" width="664" height="426" fill="#f9f7f4"/>
              <g stroke="#e9e4dc" strokeWidth="1">
                <path fill="none" d="M452 92V300M498 92V300M544 92V300M590 92V300M636 92V300M682 92V300M728 92V300M774 92V300M820 92V300M866 92V300
                         M452 138H912M452 184H912M452 230H912M452 276H912M912 92V300"/>
              </g>
              <path fill="none" stroke="#a8a29a" strokeWidth="5" d="M452 92H912V300H452Z"/>
              <path fill="none" stroke="#2f7a58" strokeWidth="4" d="M682 92V230"/>
              <path fill="none" stroke="#c08a12" strokeWidth="4" d="M452 230H912"/>
              <rect x="540" y="296" width="62" height="8" fill="#f9f7f4"/><path d="M540 300H602" stroke="#a8a29a" strokeWidth="1.5"/>
              <g fontFamily="Geist" fontSize="11" fill="#6d6a67">
                <text x="567" y="170" textAnchor="middle" fontWeight="500">座敷 8.0帖</text>
                <text x="797" y="170" textAnchor="middle" fontWeight="500">土間 6.0帖</text>
                <text x="690" y="176" fontSize="9.5" fill="#2f7a58">2,730 ✓</text>
                <text x="560" y="256" fontSize="9.5" fill="#c08a12">910 × 4 ?</text>
              </g>
              {/*rule rows*/}
              <g>
                <rect x="452" y="332" width="460" height="34" rx="8" fill="#fff" stroke="#e9e4dc"/>
                <circle cx="472" cy="349" r="5" fill="#2f7a58"/>
                <text x="490" y="353" fontFamily="Geist" fontSize="12.5" fill="#0f0f0f">用途地域 — 近隣商業地域。飲食店の営業が可能</text>
                <rect x="452" y="374" width="460" height="34" rx="8" fill="#fff" stroke="#e9e4dc"/>
                <circle cx="472" cy="391" r="5" fill="#c08a12"/>
                <text x="490" y="395" fontFamily="Geist" fontSize="12.5" fill="#0f0f0f">用途変更 — 延床120㎡のため確認申請は不要の可能性</text>
                <rect x="452" y="416" width="460" height="34" rx="8" fill="#fff" stroke="#e9e4dc"/>
                <circle cx="472" cy="433" r="5" fill="#a8a29a"/>
                <text x="490" y="437" fontFamily="Geist" fontSize="12.5" fill="#0f0f0f">検査済証 — 有無が不明。建築指導課に確認が必要</text>
              </g>
            </svg>
          </figure>

        </div>
      </section>

      {/*BUILT IN*/}
      <section id="features">
        <div className="wrap">
          <div className="shead center rv">
            <span className="tag">オールインワン</span>
            <h2>確かめる道具をすべて内蔵<br />専門知識も不要</h2>
            <p className="sub">法令の読み込み、CADソフト、積算資料。バラバラに揃える必要はありません。必要な機能がはじめから揃っているので、気になる物件をすぐ診断できます。</p>
          </div>
          <div className="builtin rv">
            <div className="bi"><svg viewBox="0 0 24 24"><path d="M4 21V9l8-6 8 6v12"/><path d="M9 21v-7h6v7"/></svg>法規制ルールを標準搭載</div>
            <div className="bi"><svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/></svg>動画から間取りを自動生成</div>
            <div className="bi"><svg viewBox="0 0 24 24"><path d="M3 17L17 3l4 4L7 21H3v-4z"/><path d="M14 6l4 4"/></svg>実測でモデルを高精度化</div>
            <div className="bi"><svg viewBox="0 0 24 24"><path d="M8 3h8v4H8z"/><path d="M6 7h12v14H6z"/><path d="M9 12h6M9 16h4"/></svg>材料費ベースの概算見積</div>
            <div className="bi"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></svg>資格・許可の要否を判定</div>
            <div className="bi"><svg viewBox="0 0 24 24"><path d="M4 4h16v13H12l-5 4v-4H4z"/><path d="M8 9h8M8 12h5"/></svg>窓口への質問文を自動作成</div>
          </div>
        </div>
      </section>


      {/*COLLAGE*/}
      <section style={{paddingTop:'0'}}>
        <div className="wrap rv">
          <div className="collage">
            {/*A: 色面 + 大きなグリフ*/}
            <div style={{position:'relative',background:'#3b51e5'}}>
              <svg viewBox="0 0 300 380" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" aria-hidden="true" style={{display:'block'}}>
                <defs><filter id="gr2"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>
                <rect width="300" height="380" fill="#3b51e5"/>
                {/*家＋間取りのグリフ*/}
                <g fill="#2436b8">
                  <path d="M150 96 L252 178 L232 178 L232 292 L68 292 L68 178 L48 178 Z"/>
                </g>
                <g stroke="#3b51e5" strokeWidth="7" fill="none">
                  <path d="M150 186V292M68 240H232"/>
                </g>
                <g fill="none" stroke="#7d8cf5" strokeWidth="5">
                  <path d="M104 210H126M174 210H196"/>
                </g>
                <g fill="#5c6ff0"><rect x="138" y="256" width="24" height="36" rx="2"/></g>
                <g stroke="#5c6ff0" strokeWidth="2.5" fill="none" opacity=".8">
                  <path d="M48 330H252M48 322V338M252 322V338"/>
                </g>
                <text x="150" y="356" textAnchor="middle" fontFamily="Geist" fontSize="13" fontWeight="500" fill="#a9b4f8" letterSpacing="1.5">910mm × 8</text>
                <rect width="300" height="380" filter="url(#gr2)" className="grain" opacity=".14" style={{mixBlendMode:'multiply'}}/>
              </svg>
            </div>

            {/*B: 実写*/}
            <div className="ph">
              <img src="/img/scene-trace.svg" alt="古民家の座敷でスマホをかざし、室内を記録している様子（イラスト）" loading="lazy" />
            </div>

            {/*C: オレンジ帯*/}
            <div className="stripe" style={{background:'#ff773c',position:'relative'}}>
              <svg viewBox="0 0 84 380" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true" style={{display:'block'}}>
                <rect width="84" height="380" fill="#ff773c"/>
                <g stroke="#181818" strokeOpacity=".3" strokeWidth="1.5" fill="none">
                  <path d="M0 46H84M0 110H84M0 174H84M0 238H84M0 302H84"/>
                </g>
              </svg>
            </div>
          </div>
          <div className="cap">
            <span><b>撮る。</b>スマホ一台で、部屋の形をなぞって図面に</span>
            <span><b>整える。</b>910mmの物差しに合わせて図面へ</span>
            <span><b>確かめる。</b>測った箇所から順に、緑に変わる</span>
          </div>
        </div>
      </section>

      {/*THREE PILLARS*/}
      <section id="usecases" style={{paddingTop:'0'}}>
        <div className="wrap">
          <div className="shead rv">
            <h2>できることは、ひとつじゃない</h2>
            <p className="sub">調べる、描く、見積もる。空き家活用でつまずくポイントを、まとめて引き受けます。</p>
          </div>
          <div className="pillars rv">

            <article className="pillar">
              <div className="vis">
                <svg viewBox="0 0 300 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                  <rect width="300" height="190" fill="#1e1e24"/>
                  <text x="20" y="34" fontFamily="Geist" fontSize="10.5" fill="#a5a19c">判定</text>
                  <text x="20" y="74" fontFamily="Geist" fontSize="34" fontWeight="600" fill="#fff" letterSpacing="-1">条件付き</text>
                  <rect x="20" y="96" width="260" height="26" rx="6" fill="#26252c" stroke="#3a3941"/>
                  <circle cx="34" cy="109" r="4" fill="#2f7a58"/><text x="48" y="113" fontFamily="Geist" fontSize="10.5" fill="#eeeceb">用途地域 — 飲食店が可能</text>
                  <rect x="20" y="128" width="260" height="26" rx="6" fill="#26252c" stroke="#3a3941"/>
                  <circle cx="34" cy="141" r="4" fill="#c08a12"/><text x="48" y="145" fontFamily="Geist" fontSize="10.5" fill="#eeeceb">用途変更 — 200㎡以下</text>
                  <rect x="20" y="160" width="260" height="26" rx="6" fill="#26252c" stroke="#3a3941"/>
                  <circle cx="34" cy="173" r="4" fill="#a8a29a"/><text x="48" y="177" fontFamily="Geist" fontSize="10.5" fill="#eeeceb">検査済証 — 不明</text>
                </svg>
              </div>
              <h3>法規制の診断</h3>
              <p>用途地域、市街化調整区域、用途変更、許認可。この物件でやりたいことが成立するかを整理し、根拠と確認先まで示します。</p>
              <Link className="lnk" href="/app/diagnose">診断をはじめる<span className="ar">→</span></Link>
            </article>

            <article className="pillar">
              <div className="vis">
                <svg viewBox="0 0 300 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                  <rect width="300" height="190" fill="#f4f1ec"/>
                  <g stroke="#e2ddd3" strokeWidth="1" fill="none">
                    <path d="M42 26V164M65 26V164M88 26V164M111 26V164M134 26V164M157 26V164M180 26V164M203 26V164M226 26V164M249 26V164
                             M42 49H258M42 72H258M42 95H258M42 118H258M42 141H258M258 26V164"/>
                  </g>
                  <path fill="none" stroke="#a8a29a" strokeWidth="5" d="M42 26H258V164H42Z"/>
                  <path fill="none" stroke="#2f7a58" strokeWidth="4" d="M157 26V118"/>
                  <path fill="none" stroke="#c08a12" strokeWidth="4" d="M42 118H258"/>
                  <rect x="96" y="160" width="44" height="8" fill="#f4f1ec"/><path d="M96 164H140" stroke="#a8a29a" strokeWidth="1.5"/>
                  <text x="100" y="80" textAnchor="middle" fontFamily="Geist" fontSize="10" fill="#6d6a67" fontWeight="500">座敷</text>
                  <text x="208" y="80" textAnchor="middle" fontFamily="Geist" fontSize="10" fill="#6d6a67" fontWeight="500">土間</text>
                  <text x="163" y="84" fontFamily="Geist" fontSize="8.5" fill="#2f7a58">2,730</text>
                  <text x="96" y="140" fontFamily="Geist" fontSize="8.5" fill="#c08a12">910 × 4 ?</text>
                </svg>
              </div>
              <h3>間取りと3D</h3>
              <p>スマホで撮った動画や、古い間取り図の写真を下絵にして、その上をなぞるだけ。図面が残っていない家でも、平面図と簡易3Dがその場でつくれます。</p>
              <Link className="lnk" href="/app/editor">下絵から間取りを描く<span className="ar">→</span></Link>
            </article>

            <article className="pillar">
              <div className="vis">
                <svg viewBox="0 0 300 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                  <defs><filter id="gr4"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>
                  <rect width="300" height="190" fill="#ff773c"/>
                  <text x="20" y="34" fontFamily="Geist" fontSize="10.5" fill="#181818" opacity=".65">標準案 ／ 材料費</text>
                  <text x="20" y="76" fontFamily="Geist" fontSize="36" fontWeight="600" fill="#181818" letterSpacing="-1.5">¥68–104万</text>
                  <g fontFamily="Geist" fontSize="10.5" fill="#181818">
                    <text x="20" y="106">床フローリング 26㎡</text><text x="280" y="106" textAnchor="end" fontWeight="600">DIY可</text>
                    <path d="M20 116H280" stroke="#181818" strokeOpacity=".25"/>
                    <text x="20" y="136">回路増設 2箇所</text><text x="280" y="136" textAnchor="end" fontWeight="600">要 電気工事士</text>
                    <path d="M20 146H280" stroke="#181818" strokeOpacity=".25"/>
                    <text x="20" y="166">間仕切り撤去 1枚</text><text x="280" y="166" textAnchor="end" fontWeight="600">要 構造確認</text>
                  </g>
                  <rect width="300" height="190" filter="url(#gr4)" className="grain" opacity=".14" style={{mixBlendMode:'multiply'}}/>
                </svg>
              </div>
              <h3>改修計画と概算</h3>
              <p>要望を伝えると、最小・標準・攻めの3案。必要な工事、材料費ベースの概算レンジ、DIYできる範囲と資格が要る工事まで示します。</p>
              <Link className="lnk" href="/app/plan">プランを作る<span className="ar">→</span></Link>
            </article>

          </div>
        </div>
      </section>


      {/*FABRIC PANEL*/}
      <section style={{paddingTop:'0'}}>
        <div className="wrap rv">
          <div className="fabric">
            <div className="fgrid">
              <div>
                <h2>調べ方も、<br />まるごと入っている</h2>
                <p className="fp">法令を読み解くのも、窓口を探すのも、本来はプロの仕事です。HIRAKUはその手順をそのまま道具にしました。あなたは、やりたいことを言葉にするだけ。</p>
              </div>
              <div className="fitems">
                <div className="fitem"><h3>25項目の法規制チェック</h3><p>用途地域から農地法まで。全国共通の法律をルールとして実装しています。</p></div>
                <div className="fitem"><h3>窓口ごとの質問文</h3><p>都市計画課、保健所、消防。誰に何を聞くかまで文章で用意します。</p></div>
                <div className="fitem"><h3>不明点は不明のまま</h3><p>わからないことは埋めずに残し、確かめる先に紐づけます。</p></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*ON SITE*/}
      <section id="onsite" style={{paddingTop:'0'}}>
        <div className="wrap">
          <div className="shead rv">
            <h2>現地で測るほど、<br />モデルは正確になる</h2>
            <p className="sub">AIの推定で終わらせません。メジャー1本あれば、その場でモデルを確定させていけます。どこが推定で、どこが実測かは、常に色でわかります。</p>
          </div>
          <div className="onsite rv">
            <div className="os">
              <h3>確からしさが、色でわかる</h3>
              <p>すべての寸法に確度を持たせています。測るたびに図面が緑に変わり、見積の精度も上がっていきます。</p>
              <div className="kv"><span className="pill est">推定</span><span className="pill hyp">仮説</span><span className="pill mea">実測</span></div>
            </div>
            <div className="os">
              <h3>次に測るべき場所を提案</h3>
              <p>闇雲に全部測る必要はありません。全体の精度に効く箇所を計算して、3つだけ提案します。</p>
              <div className="kv"><span className="pill">計測ナビ</span><span className="pill">対角チェック</span></div>
            </div>
            <div className="os">
              <h3>劣化を、図面上に記録</h3>
              <p>雨染み、腐朽、傾き。写真とメモを図面の位置に紐づけて、そのまま現況調査報告書になります。</p>
              <div className="kv"><span className="pill">写真ピン</span><span className="pill">傾き記録</span><span className="pill">報告書出力</span></div>
            </div>
            <div className="os">
              <h3>910mmの物差しで整える</h3>
              <p>日本の木造は尺モジュールが基本。グリッドに合わせて自動で整えつつ、実測した箇所の歪みはそのまま残します。</p>
              <div className="kv"><span className="pill">尺モジュール</span><span className="pill">IFC書き出し</span></div>
            </div>
          </div>
          <figure className="scene rv" style={{marginTop:'16px'}} aria-label="実測前と実測後のモデル比較">
            <svg viewBox="0 0 1060 300" width="100%" role="img" aria-hidden="true" style={{display:'block'}}>
              <rect width="1060" height="300" fill="#f4f1ec"/>
              <path d="M530 0V300" stroke="#ded8ce" strokeDasharray="6 6"/>
              <text x="40" y="40" fontFamily="Geist" fontSize="12" fontWeight="600" fill="#918d88">BEFORE ／ 動画からの推定のみ</text>
              <text x="570" y="40" fontFamily="Geist" fontSize="12" fontWeight="600" fill="#2f7a58">AFTER ／ 実測を4箇所入力</text>
              {/*before*/}
              <g stroke="#e2ddd3" strokeWidth="1" fill="none">
                <path d="M86 76V254M131 76V254M176 76V254M221 76V254M266 76V254M311 76V254M356 76V254M401 76V254M446 76V254
                         M86 121H491M86 166H491M86 211H491M491 76V254"/>
              </g>
              <path fill="none" stroke="#a8a29a" strokeWidth="5" d="M88 78 L489 74 L491 252 L86 254Z"/>
              <path fill="none" stroke="#a8a29a" strokeWidth="4" d="M290 76V212"/>
              <path fill="none" stroke="#a8a29a" strokeWidth="4" d="M87 212H490"/>
              <g fontFamily="Geist" fontSize="10.5" fill="#918d88">
                <text x="188" y="152" textAnchor="middle">? 8.0帖</text>
                <text x="390" y="152" textAnchor="middle">? 6.0帖</text>
                <text x="200" y="238">寸法はすべて推定値</text>
              </g>
              {/*after*/}
              <g stroke="#e2ddd3" strokeWidth="1" fill="none">
                <path d="M616 76V254M661 76V254M706 76V254M751 76V254M796 76V254M841 76V254M886 76V254M931 76V254M976 76V254
                         M616 121H1021M616 166H1021M616 211H1021M1021 76V254"/>
              </g>
              <path fill="none" stroke="#2f7a58" strokeWidth="5" d="M616 76H1021V254H616Z"/>
              <path fill="none" stroke="#2f7a58" strokeWidth="4" d="M820 76V211"/>
              <path fill="none" stroke="#c08a12" strokeWidth="4" d="M616 211H1021"/>
              <g fontFamily="Geist" fontSize="10.5" fill="#6d6a67">
                <text x="718" y="148" textAnchor="middle" fontWeight="500">座敷 8.0帖</text>
                <text x="718" y="164" textAnchor="middle" fontSize="9.5" fill="#2f7a58">3,640 × 3,640 ✓</text>
                <text x="920" y="148" textAnchor="middle" fontWeight="500">土間 6.0帖</text>
                <text x="920" y="164" textAnchor="middle" fontSize="9.5" fill="#2f7a58">2,730 × 3,640 ✓</text>
                <text x="640" y="238" fill="#2f7a58">4箇所の実測で全体が確定</text>
              </g>
              {/*実測ピン*/}
              <g>
                <circle cx="820" cy="76" r="7" fill="#2f7a58"/><circle cx="1021" cy="165" r="7" fill="#2f7a58"/>
                <circle cx="616" cy="144" r="7" fill="#2f7a58"/><circle cx="900" cy="254" r="7" fill="#2f7a58"/>
              </g>
            </svg>
          </figure>

        </div>
      </section>

      {/*DARK BAND*/}
      <section style={{paddingTop:'0'}}>
        <div className="wrap">
          <div className="dark-band rv">
            <div className="db-grid">
              <div>
                <span className="tag">窓口に持っていける</span>
                <h2>調べて終わり、にしない</h2>
                <p className="sub" style={{marginTop:'18px'}}>いちばん困るのは、そもそも何を聞けばいいか分からないこと。HIRAKUは診断と一緒に、窓口ごとの質問文まで用意します。印刷して持っていけます。</p>
              </div>
              <div className="sheet">
                <p className="st">確認先マトリクス（自動生成）</p>
                <div className="qrow"><span className="to">都市計画課</span><span>この住所の用途地域と、飲食店を営業する場合の規模の制限を教えてください。</span></div>
                <div className="qrow"><span className="to">保健所</span><span>この平面図で、飲食店営業許可の施設基準を満たしますか。厨房の区画についてご確認ください。</span></div>
                <div className="qrow"><span className="to">建築指導課</span><span>延床120㎡の住宅を店舗にする場合、確認申請は必要でしょうか。</span></div>
              </div>
            </div>
            <div className="stats">
              <div className="stat"><p className="v num">25<span style={{fontSize:'.6em'}}>項目</span></p><p className="l">初期搭載の法規制チェック</p></div>
              <div className="stat"><p className="v num">40<span style={{fontSize:'.6em'}}>項目</span></p><p className="l">工事項目マスタ（資格要否つき）</p></div>
              <div className="stat"><p className="v num">910<span style={{fontSize:'.6em'}}>mm</span></p><p className="l">日本の木造に合わせた基準寸法</p></div>
            </div>
          </div>
        </div>
      </section>



      {/*HALFTONE BAND + QUOTE*/}
      <section className="dotted" style={{borderRadius:'0',marginTop:'clamp(24px,4vw,48px)'}}>
        <div className="wrap">
          <div className="htband rv" style={{marginBottom:'clamp(48px,6vw,72px)'}}>
            <img src="/img/scene-halftone.png" alt="改装中の土間で作業する人たち（網点のイラスト）" loading="lazy" />
            <div className="card">
              <h3>調べる時間を、つくる時間へ</h3>
              <p>制度を調べるのに数週間かけていた工程を、一時間に縮めます。浮いた時間は、どんな場所にするかを考えることに使えます。</p>
              <div className="rb" aria-hidden="true">↗</div>
            </div>
          </div>

          <div className="quote rv">
            <p className="who">建石大貴 — 合同会社IShIZUE 代表社員 ／ 一般社団法人日々 副代表理事</p>
            <blockquote>「やりたい人はいる。<br />止まっているのは、確かめる手段がないからだった」</blockquote>
            <div className="qf">
              <a href="#faq">この道具の考え方を読む →</a>
            </div>
          </div>
        </div>
      </section>

      {/*EDITORIAL*/}
      <section style={{paddingTop:'0'}}>
        <div className="wrap rv">
          <div className="editorial">
            <div className="bgph ph"><img src="/img/scene-work.svg" alt="改装中の土間で人が集まり作業している様子（イラスト）" loading="lazy" /></div>
            <div className="veil"></div>
            <div className="ed-in">
              <span className="tag" style={{background:'rgba(255,255,255,.14)',borderColor:'rgba(255,255,255,.22)',color:'#fff'}}>なぜ作っているか</span>
              <h2>空き家は問題じゃない。<br />いちばん自由な余白だ。</h2>
              <p>使われていない家は、全国に900万戸あると言われています。そのほとんどは、活かしたい人がいないからではなく、活かせるかどうかを確かめる手段がないから止まっています。<br /><br />調べ方さえ手に入れば、あとは人の手が動きます。HIRAKUは、その最初のひと押しだけを引き受けます。</p>
            </div>
          </div>
          <p className="phcap">図版はすべて自作のイラストです（写真ではありません）</p>
        </div>
      </section>

      {/*PRICING*/}
      <section id="pricing">
        <div className="wrap">
          <div className="shead center rv">
            <h2>いまは、すべて無料</h2>
            <p className="sub">開発版として公開しています。使いながら一緒に育ててくださる方を探しています。</p>
          </div>
          <div className="plans rv" style={{maxWidth:'840px',marginInline:'auto'}}>
            <div className="plan hi">
              <span className="badge">開発版</span>
              <p className="pn">フリー</p>
              <p className="pp">¥0<small> /月</small></p>
              <p className="pd">物件の診断から改修計画まで、すべての機能を制限なく使えます。</p>
              <Link className="btn btn-cta" href="/app">無料ではじめる</Link>
              <ul>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>法規制診断（全国対応）</li>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>間取り作成・実測モード</li>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>改修3案と概算見積</li>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>レポートの印刷・書き出し</li>
              </ul>
            </div>
            <div className="plan">
              <p className="pn">事業者向け</p>
              <p className="pp">準備中</p>
              <p className="pd">自治体・不動産事業者・中間支援組織向けのプランを検討しています。</p>
              <a className="btn btn-outline" href="#top">相談する</a>
              <ul>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>地域パック（条例・補助金・窓口）</li>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>複数物件の一括管理</li>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>独自の単価データの取り込み</li>
                <li><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>レポートのブランド設定</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/*FAQ*/}
      <section id="faq" style={{paddingTop:'0'}}>
        <div className="wrap">
          <div className="shead center rv"><h2>HIRAKU に関するよくある質問</h2></div>
          <div className="faq-w rv">
            <details className="faq"><summary>診断結果はそのまま信じていいですか？<span className="x"></span></summary>
              <p className="a">いいえ。診断は一次スクリーニングであり、法的助言ではありません。「可能性が高い／条件付き／難しい」という見立てと根拠、そして確認すべき窓口と質問文をセットで出します。最終確認は必ず行政・専門家と行ってください。</p></details>
            <details className="faq"><summary>見積はどのくらい正確ですか？<span className="x"></span></summary>
              <p className="a">材料費ベースの参考レンジです。数量は間取りモデルから自動で拾うため、実測が進むほど精度が上がります。専門工事の施工費は現地見積が必要なので、金額ではなく「要見積」と表示します。総額の一本値は出しません。</p></details>
            <details className="faq"><summary>どの地域で使えますか？<span className="x"></span></summary>
              <p className="a">法規制診断の核は全国共通の法律で動きます。条例・補助金・窓口といった地域固有の情報は「地域パック」として順次拡充しており、最初のパックは兵庫県三田市です。未対応の地域でも、確認先の種類と聞き方は提示できます。</p></details>
            <details className="faq"><summary>建築士や行政に相談しなくてよくなりますか？<span className="x"></span></summary>
              <p className="a">逆です。相談が上手くなるための道具です。何も分からないまま窓口に行くのと、図面・診断・質問リストを持って行くのとでは、話の進み方がまるで違います。専門家の時間を、いちばん価値のある判断に使ってもらうために作っています。</p></details>
            <details className="faq"><summary>図面が残っていない家でも使えますか？<span className="x"></span></summary>
              <p className="a">むしろそのために作りました。空き家は図面が失われていることがほとんどです。スマホで室内を一周撮影すれば、間取りの下書きを自動生成します。現地でメジャーを当てて実測すれば、そのまま精度の高い現況図になります。</p></details>
            <details className="faq"><summary>壁を抜けるかどうかは分かりますか？<span className="x"></span></summary>
              <p className="a">断定はしません。写真や動画から構造の安全性を判定することは原理的にできないためです。間仕切り撤去を含む案には必ず構造確認のフラグを付け、建築士への相談を促します。ここは譲らない設計にしています。</p></details>
          </div>
        </div>
      </section>

      {/*FINAL*/}
      <section className="final">
        <div className="wrap rv">
          <h2>気になるあの家を、<br />いますぐ確かめる</h2>
          <p className="sub">まずは一軒から。診断は数分で終わります。</p>
          <Link className="btn btn-cta" href="/app" style={{padding:'16px 32px',fontSize:'16px'}}>無料ではじめる<span className="ar">→</span></Link>
        </div>
      </section>

      </main>

      <footer>
        <div className="wrap">
          <div className="fgrid">
            <div className="fcol">
              <a className="logo" href="#top" style={{marginBottom:'14px'}}><span className="dot"></span>HIRAKU</a>
              <p style={{maxWidth:'22em'}}>空き家を活かしたい人のための、確かめるための道具。</p>
            </div>
            <div className="fcol"><h4>プロダクト</h4><a href="#features">機能</a><a href="#usecases">できること</a><a href="#pricing">プラン</a></div>
            <div className="fcol"><h4>リソース</h4><a href="#faq">よくある質問</a><a href="#onsite">現地調査ガイド</a><a href="#top">地域パックについて</a></div>
            <div className="fcol"><h4>法的情報</h4><a href="#top">プライバシーポリシー</a><a href="#top">利用規約</a><a href="#top">免責事項</a></div>
          </div>
          <p className="disc">本ツールの診断・見積は情報整理を目的とした参考情報であり、法的助言、建築士による設計・調査、不動産取引の媒介ではありません。実際の可否・費用・安全性は、必ず所管行政庁および建築士等の専門家にご確認ください。</p>
          <div className="fbtm"><span>© 2026 HIRAKU</span><span>Made in 兵庫県三田市</span></div>
        </div>
      </footer>
    </div>
  );
}
