'use client';

import { deserialize } from '@hiraku/core';
import sampleRaw from '@hiraku/core/fixtures/sample-minka.json';
import BackdropLoader from '@/components/BackdropLoader';
import { useEditor } from '@/lib/store';

/** 間取りが空のときに出る、最初の一手 */
export default function EditorStart() {
  const { loadModel, setTool } = useEditor.getState();

  return (
    <div className="editorstart">
      <div className="editorstart-card">
        <h2>間取りをつくる</h2>
        <p>
          図面が残っていなくて大丈夫です。撮った動画や古い間取り図を下絵にして、
          その上をなぞるのがいちばん早い方法です。
        </p>

        <div className="editorstart-grid">
          <div className="editorstart-opt editorstart-opt--primary">
            <b>動画・写真から始める</b>
            <span>室内を一周撮った動画、または間取り図の写真。おすすめの入り方です。</span>
            <BackdropLoader />
          </div>

          <div className="editorstart-opt">
            <b>まず触ってみる</b>
            <span>古民家のサンプル（土間＋廊下＋和室3室）を読み込んで、操作を試せます。</span>
            <button
              className="hb-btn hb-outline"
              onClick={() => loadModel(deserialize(JSON.stringify(sampleRaw)))}
            >
              サンプルを読み込む
            </button>
          </div>

          <div className="editorstart-opt">
            <b>白紙から描く</b>
            <span>寸法が分かっているなら、そのまま壁を描いていけます。</span>
            <button className="hb-btn hb-outline" onClick={() => setTool('wall')}>
              壁を描きはじめる
            </button>
          </div>
        </div>

        <p className="editorstart-note">
          描いた内容はこの端末の中だけに残ります。どこかに送信されることはありません。
        </p>
      </div>
    </div>
  );
}
