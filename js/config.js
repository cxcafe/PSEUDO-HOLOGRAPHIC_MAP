// ジェネレーターの初期設定です。ジェネレーター専用です。生成コードには設定値のみを埋め込みます。
// 起動時のキャッシュ更新キー。素材差し替え後の再読込で最新ファイルを取得します。
const holoStandardAssetRevision = '?v=' + Date.now();
window.HOLO_SETTINGS = {
    map: { // 地図の初期設定
      styles: {
        dark: 'https://tiles.openfreemap.org/styles/dark',
        positron: 'https://tiles.openfreemap.org/styles/positron'
      },
      initialStyle: 'dark',
      height: 480,
      zoom: 16, minZoom: 15, maxZoom: 17,
      pitch: 60, bearing: -45,
      padding: { top: 100, bottom: 0, left: 0, right: 0 },
      rotationEnabled: true,
      showScale: true,
      show3D: true,
      buildingSourceUrl: 'https://tiles.openfreemap.org/planet',
      // 周辺の3D建物は地図スタイル別に指定。ホログラムの色とは独立。
      // Positronは明るいグレー、Darkは暗いグレーを使用する。
      buildingColors: { positron: '#afb7c0', dark: '#364451' },
      buildingOpacities: { positron: 1, dark: 0.92 },
      defaultBuildingHeight: 10,
      buildingOpacity: 0.88,
      buildingStartZoom: 15,
      buildingFullZoom: 16,
      animationDuration: 650
    },

    // 標準素材の唯一の参照元。プレビューとEXPORTは同じファイルを読み込みます。
    standardAssets: {
      pin: './models/pin-marker_x10units.glb' + holoStandardAssetRevision,
      building: './models/pin-building_x10units.glb' + holoStandardAssetRevision,
      magic: './models/pin-magic-circle_x10units.glb' + holoStandardAssetRevision,
      png: './images/pin-marker.png' + holoStandardAssetRevision,
      svg: './images/pin-marker.svg' + holoStandardAssetRevision,
      webp: './images/pin-marker.webp' + holoStandardAssetRevision
    },
    // EXPORTの独自素材パスが空欄のときに出力する仮の相対パス。
    placeholderAssets: {
      glb: './models/your-model.glb',
      image: './images/your-image.png'
    },

    // 1ピン固定の設定（MARKERS タブから位置・種類・素材を編集できます）。
    // type:'3d' は Three.js、type:'image' は透過画像。
    // GLBと画像は倍率・ZOOM別表示比率を別々に保持します。
    // 3D の rotation はモデルの方位角、holoTransparency はこのピンだけの透過率。
    // 表示比率はZOOMごとに指定し、ピンの地理座標は固定します。
    pins: [
      {
        id: 'A', enabled: true, type: '3d',
        name: '六本木ヒルズ',
        address: '〒106-6108 東京都港区六本木6-10-1',
        lng: 139.7292361, lat: 35.6603972,
        model: 'pin', color: '#69ecff', scale: 10, rotation: 0, altitude: 1,
        holoTransparency: 50, zoomSizesPercent: {15: 100, 16: 100, 17: 100},
        imageMode: 'png', image: './images/your-image.png', imageOpacity: 1,
        imageScale: 1, imageZoomSizesPercent: {15: 50, 16: 75, 17: 100}
      }
    ]
  };
