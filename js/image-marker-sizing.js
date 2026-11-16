/*
 * 画像マーカーの％表示サイズ専用。座標・アンカーはMapLibre側で管理する。
 * 外部ライブラリ不要。初回読込・キャッシュ済み画像・ズーム変更で同じ計算を使用。
 */
(function(global){
  'use strict';
  function percentAtZoom(sizes, zoom) {
    if (!sizes) return NaN;
    const z = Math.max(15, Math.min(17, Number(zoom)));
    const lo = Math.floor(z), hi = Math.min(17, lo + 1);
    const left = Number(sizes[lo]), right = Number(sizes[hi]);
    if (!Number.isFinite(z) || !Number.isFinite(left) || !Number.isFinite(right)) return NaN;
    return left + (right - left) * (z - lo);
  }
  function attach({element, image, point, getZoom, onError}) {
    let stopped = false;
    let loaded = false;
    let lastWidth = null, lastHeight = null;
    element.style.visibility = 'hidden';
    function update(){
      if (stopped) return false;
      const w = image.naturalWidth, h = image.naturalHeight;
      if (!(w > 0) || !(h > 0)) return false;
      const percent = percentAtZoom(point.zoomSizesPercent, getZoom());
      if (!(percent > 0) || !Number.isFinite(percent)) return false;
      const multiplier = Number(point.imageScale ?? 1);
      if (!(multiplier > 0) || !Number.isFinite(multiplier)) return false;
      const width = w * multiplier * percent / 100;
      const height = h * multiplier * percent / 100;
      // DOMの表示サイズを直接確定する。imgのwidth/height属性やCSSのmax-widthに依存しない。
      if (width !== lastWidth || height !== lastHeight){
        element.style.width = width + 'px';
        element.style.height = height + 'px';
        image.style.width = width + 'px';
        image.style.height = height + 'px';
        lastWidth = width; lastHeight = height;
      }
      element.style.visibility = 'visible';
      element.dataset.zoomPercent = String(percent);
      loaded = true;
      return true;
    }
    function load(){ update(); }
    function fail(){
      if(stopped) return;
      element.style.visibility = 'hidden';
      if (typeof onError === 'function') onError();
    }
    image.addEventListener('load', load);
    image.addEventListener('error', fail);
    // srcが既に読み込まれている場合でも、loadイベントに依存せず初期化する。
    if (image.complete && image.naturalWidth > 0) update();
    return {
      update,
      get loaded(){return loaded;},
      get width(){return lastWidth;},
      get height(){return lastHeight;},
      dispose(){ stopped = true; image.removeEventListener('load',load); image.removeEventListener('error',fail); }
    };
  }
  global.HoloImageMarkerSizing = Object.freeze({percentAtZoom,attach});
})(window);
