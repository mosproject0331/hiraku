/**
 * レーザー距離計アダプタ(§5-M5)。
 * Web Bluetooth 実装(Leica DISTO / Bosch GLM)は実機でのプロトコル検証が必要なため、
 * 今は手入力のみ。iOS SafariはWeb Bluetooth非対応のため、手入力が常に主経路。
 */
export interface DistanceMeterAdapter {
  readonly name: string;
  /** 計測値(mm)を1回取得する。取得できない場合はnull */
  read(): Promise<number | null>;
}

/** 手入力(既定)。UI側のinputが実体なので、アダプタとしては常にnull */
export class ManualAdapter implements DistanceMeterAdapter {
  readonly name = '手入力';
  async read(): Promise<number | null> {
    return null;
  }
}

// TODO(human): Web Bluetooth 実装のスケルトン
// - Leica DISTO: GATT service 3ab10100-f831-4395-b29d-570977d5bf94 系(要実機確認)
// - Bosch GLM: 独自プロトコル(要実機確認)
// Android Chrome でのみ動作。navigator.bluetooth.requestDevice → characteristic notify を購読。
export class WebBluetoothAdapter implements DistanceMeterAdapter {
  readonly name = 'レーザー距離計(未実装)';
  async read(): Promise<number | null> {
    throw new Error('Web Bluetooth対応は実機検証が必要なため未実装です(手入力をご利用ください)');
  }
}
