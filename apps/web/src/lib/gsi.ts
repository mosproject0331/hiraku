/**
 * 国土地理院の地図を使う。
 *
 * 鍵も契約も要らず、日本の住所と航空写真がそろっている。
 * 出典の表示だけが決まりなので、画面に必ず出す。
 */

export const GSI_CREDIT = '地理院タイル（国土地理院）';
const TILE_HOST = 'https://cyberjapandata.gsi.go.jp/xyz';

export interface Place {
  title: string;
  lat: number;
  lon: number;
}

/** 住所から場所を引く。候補が複数返ることがある */
export async function searchAddress(q: string, signal?: AbortSignal): Promise<Place[]> {
  const query = q.trim();
  if (!query) return [];
  const res = await fetch(
    'https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(query),
    { signal },
  );
  if (!res.ok) throw new Error('住所を引けませんでした');
  const data = (await res.json()) as {
    geometry?: { coordinates?: [number, number] };
    properties?: { title?: string };
  }[];
  return data
    .filter((f) => Array.isArray(f.geometry?.coordinates))
    .map((f) => ({
      title: f.properties?.title ?? query,
      lon: f.geometry!.coordinates![0],
      lat: f.geometry!.coordinates![1],
    }))
    .slice(0, 8);
}

export type Layer = 'photo' | 'map';

export const LAYERS: { id: Layer; label: string; maxZoom: number }[] = [
  { id: 'photo', label: '航空写真', maxZoom: 18 },
  { id: 'map', label: '地図', maxZoom: 18 },
];

export function tileUrl(layer: Layer, z: number, x: number, y: number): string {
  return layer === 'photo'
    ? `${TILE_HOST}/seamlessphoto/${z}/${x}/${y}.jpg`
    : `${TILE_HOST}/pale/${z}/${x}/${y}.png`;
}
