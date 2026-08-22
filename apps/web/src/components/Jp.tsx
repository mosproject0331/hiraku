import { Fragment, type ReactNode } from 'react';

/**
 * 日本語の見出しを、語の途中で折らないようにする。
 *
 * ブラウザは和文をどこでも折るので、「何のた／めの場」のような割れ方をする。
 * 句読点と助詞の切れ目にだけ折る場所を置き、それ以外では折らせない。
 * （word-break: keep-all と組で使う）
 */

/** ここで折ってよい、という印を入れる場所 */
const BREAKS = /(、|。|・|，|,|」|）|\)|——|—)/;

/** 助詞のあと。文が長いときだけ使う */
const PARTICLES = /(?<=[はがをにでとやへも])(?=[^\s、。])/g;

export function jp(text: string): ReactNode {
  const parts = text.split(BREAKS).filter((s) => s !== '');
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    // 長いかたまりは、助詞のあとでも折れるようにする
    const chunks = part.length > 14 ? part.split(PARTICLES) : [part];
    chunks.forEach((c, j) => {
      out.push(
        <Fragment key={`${i}-${j}`}>
          <span className="jp-chunk">{c}</span>
          <wbr />
        </Fragment>,
      );
    });
  });
  return out;
}

export default function Jp({ children, as: As = 'span', className }: {
  children: string;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'p';
  className?: string;
}) {
  return <As className={className}>{jp(children)}</As>;
}
