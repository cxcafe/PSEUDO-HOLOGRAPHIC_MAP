/* PSEUDO-HOLOGRAPHIC MAP — EXPORT
 * 標準素材はmodels/・images/の実ファイルから読み込み、生成時に選択した1種類だけ内包する。
 * 独自素材はEXPORTのパスを参照する。
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = window.__holoEditorDiagnostics;
  const standardAssets = editor?.draft?.standardAssets;
  const sampleMimeTypes = Object.freeze({
    pin: 'model/gltf-binary', building: 'model/gltf-binary', magic: 'model/gltf-binary',
    png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp'
  });
  // 生成コードのテンプレートをファイルから読み込む。
  const templateFiles = Object.freeze({
    image: './templates/MAP_code_png.html',
    glb: './templates/MAP_code_glb.html'
  });
  const templateCache = new Map();
  if (!editor || !standardAssets) {
    if ($('editor-status-message')) {
      $('editor-status-message').textContent = 'EXPORTを初期化できませんでした。';
      $('editor-status').classList.add('is-error');
    }
    return;
  }
  const placeholders = editor.draft.placeholderAssets;
  const builtins = ['pin', 'building', 'magic'];
  const builtinImages = ['png', 'svg', 'webp'];
  const field = $('publish-model-url');
  const exportPaths = { image: '', glb: '' };
  const status = (message, error = false) => {
    $('editor-status-message').textContent = message;
    $('editor-status').classList.toggle('is-error', error);
  };

  // 独自素材の出力パスはプレビュー設定と分離する。
  function selectedCustomKind() {
    const marker = editor.draft.pins[0];
    if (marker.type === 'image') return marker.imageMode === 'custom' ? 'image' : null;
    if (marker.type === '3d') return builtins.includes(marker.model) ? null : 'glb';
    return null;
  }
  function syncFromMarkers() {
    const kind = selectedCustomKind();
    field.disabled = !kind;
    field.value = kind ? exportPaths[kind] : '';
    field.placeholder = kind === 'image' ? placeholders.image
      : kind === 'glb' ? placeholders.glb
      : '標準素材は生成コードに内包されます';
  }
  field.addEventListener('input', () => {
    const kind = selectedCustomKind();
    if (kind) exportPaths[kind] = field.value;
  });
  document.addEventListener('holo-editor:asset-change', syncFromMarkers);
  syncFromMarkers();

  // EXPORTのパスが未入力の場合、独自素材用の仮の相対パスを使用する。
  function configForExport() {
    editor.validate();
    const marker = editor.draft.pins[0];
    const map = editor.draft.map;
    // 入力値をテンプレート内のSETTINGS項目に対応付ける。
    const location = {
      name: marker.name, address: marker.address, lng: marker.lng, lat: marker.lat
    };
    const mapSettings = {
      style: map.initialStyle,
      height: map.height,
      zoom: map.zoom,
      minZoom: map.minZoom,
      maxZoom: map.maxZoom,
      pitch: map.pitch,
      bearing: map.bearing,
      showScale: map.showScale,
      show3D: map.show3D,
      buildingColorDark: map.buildingColors.dark,
      buildingColorPositron: map.buildingColors.positron,
      defaultBuildingHeight: map.defaultBuildingHeight
    };
    const activeZoom = marker.type === 'image' ? marker.imageZoomSizesPercent : marker.zoomSizesPercent;
    const zoomSizesPercent = {
      15: activeZoom[15],
      16: activeZoom[16],
      17: activeZoom[17]
    };
    if (marker.type === 'image') {
      const standard = builtinImages.includes(marker.imageMode);
      return {
        kind: 'image',
        assetKey: standard ? marker.imageMode : null,
        config: {
          location,
          marker: {
            iconUrl: standard ? '' : (exportPaths.image.trim() || placeholders.image),
            // 画像の読み込み前に使用する仮の寸法。
            width: 256, height: 128,
            anchor: marker.imageAnchor,
            offsetX: marker.imageOffsetX,
            offsetY: marker.imageOffsetY,
            transparencyPercent: Math.round((1 - marker.imageOpacity) * 100),
            scale: marker.imageScale,
            zoomSizesPercent
          },
          map: mapSettings
        }
      };
    }
    if (marker.type === '3d') {
      const standard = builtins.includes(marker.model);
      const baseWidthMeters = 10;
      return {
        kind: 'glb',
        assetKey: standard ? marker.model : null,
        config: {
          location,
          model: {
            glbUrl: standard ? '' : (exportPaths.glb.trim() || placeholders.glb),
            baseWidthMeters,
            scale: marker.scale,
            color: marker.color,
            transparencyPercent: marker.holoTransparency,
            rotationDegrees: marker.rotation,
            altitudeMeters: marker.altitude,
            zoomSizesPercent
          },
          map: mapSettings
        }
      };
    }
    throw new Error('表示形式が正しくありません。');
  }

  // テンプレートのSETTINGS領域だけを置換する。
  const safeJson = data => JSON.stringify(data, null, 2)
    .replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, ' ');

  async function loadTemplate(kind) {
    if (!templateFiles[kind]) throw new Error('書き出し形式が不正です。');
    if (templateCache.has(kind)) return templateCache.get(kind);
    const response = await fetch(templateFiles[kind], {cache:'no-store'});
    if (!response.ok) throw new Error('テンプレートを読み込めません（' + response.status + '）：' + templateFiles[kind]);
    const text = await response.text();
    // 開始・終了コメントで設定領域を特定する。
    const begin = '// ===== ユーザー設定：ここだけ変更 =====';
    const end = '// ===== ユーザー設定ここまで =====';
    if (text.split(begin).length !== 2 || text.split(end).length !== 2 ||
        !text.includes('const SETTINGS = {')) {
      throw new Error('テンプレートの設定部分が見つかりません：' + templateFiles[kind]);
    }
    templateCache.set(kind, text);
    return text;
  }

  async function compose(kind, config) {
    const source = await loadTemplate(kind);
    const begin = '// ===== ユーザー設定：ここだけ変更 =====';
    const end = '// ===== ユーザー設定ここまで =====';
    const start = source.indexOf(begin) + begin.length;
    const finish = source.indexOf(end);
    const settingsBlock = source.slice(start, finish);
    if (!/^\s*const SETTINGS = \{[\s\S]*\};\s*$/.test(settingsBlock)) {
      throw new Error('テンプレートの設定部分を確認できませんでした。');
    }
    return source.slice(0, start) + '\nconst SETTINGS = ' + safeJson(config) + ';\n' + source.slice(finish);
  }

  // 標準素材はディレクトリ内のファイルを唯一の元データとする。
  // 生成時に最新のバイナリを読み込み、Webサイトへ貼るコードにだけ埋め込む。
  async function embedStandardAsset(key) {
    const filePath = standardAssets[key];
    const mimeType = sampleMimeTypes[key];
    if (!filePath || !mimeType) throw new Error('標準素材の設定が見つかりません：' + key);

    const response = await fetch(filePath, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error('標準素材を読み込めません（' + response.status + '）：' + filePath);
    }
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error('標準素材のファイルが空です：' + filePath);
    if (mimeType === 'model/gltf-binary') {
      // 誤ったGLBに差し替えた場合、生成前に形式エラーを知らせる。
      if (buffer.byteLength < 12) throw new Error('GLB 2.0形式ではありません：' + filePath);
      const header = new DataView(buffer);
      if (header.getUint32(0, true) !== 0x46546c67 ||
          header.getUint32(4, true) !== 2 ||
          header.getUint32(8, true) !== buffer.byteLength) {
        throw new Error('GLB 2.0形式ではありません：' + filePath);
      }
    }
    // ファイル内容を変更せずにデータURIへ変換。SVG等の文字化けも防ぐ。
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result) : reject(new Error('素材の変換に失敗しました：' + filePath));
      reader.onerror = () => reject(new Error('素材を変換できません：' + filePath));
      reader.readAsDataURL(new Blob([buffer], { type: mimeType }));
    });
  }

  let latest = '';
  let generatedFingerprint = '';
  let busy = false;
  const fingerprint = () => JSON.stringify({map:editor.draft.map,pins:editor.draft.pins,exportPaths});
  const output = $('generated-source');
  const copyButton = $('copy-source');
  const downloadButton = $('download-source');
  const clearButton = $('clear-source');

  function updateOutputButtons() {
    const hasCode = latest.length > 0;
    copyButton.disabled = !hasCode;
    downloadButton.disabled = !hasCode;
    clearButton.disabled = !hasCode;
  }

  function resetOutput(showMessage = false) {
    latest = '';
    generatedFingerprint = '';
    output.value = '';
    updateOutputButtons();
    if (showMessage) status('生成結果を消去しました。');
  }

  function invalidateStaleOutput() {
    if (latest && generatedFingerprint !== fingerprint()) {
      resetOutput();
      status('設定が変わりました。新しい設定でコードを生成してください。');
    }
  }
  // 入力、選択、地図上での位置指定などの編集をまとめて監視する。
  for (const eventName of ['input','change','click']) {
    $('studio-controls').addEventListener(eventName, () => queueMicrotask(invalidateStaleOutput));
  }
  for (const eventName of ['holo-editor:asset-change','holo-editor:picked','holo-editor:draft-change']) {
    document.addEventListener(eventName, () => queueMicrotask(invalidateStaleOutput));
  }

  // ブラウザが前回の入力内容を復元しても、初期状態は必ず空欄にする。
  resetOutput();
  window.addEventListener('pageshow', () => resetOutput());

  async function generate() {
    if (busy) return null;
    busy = true;
    $('make-source').disabled = true;
    try {
      const {kind, config, assetKey} = configForExport();
      const startingFingerprint = fingerprint();
      if (assetKey) {
        const url = await embedStandardAsset(assetKey);
        if (kind === 'image') config.marker.iconUrl = url;
        else config.model.glbUrl = url;
      }
      const code = await compose(kind, config);
      if (startingFingerprint !== fingerprint()) throw new Error('生成中に設定が変更されました。もう一度生成してください。');
      latest = code;
      generatedFingerprint = startingFingerprint;
      output.value = latest;
      updateOutputButtons();
      status((assetKey ? '標準素材内包' : '独自素材参照') + 'の埋め込みコードを生成しました（'
        + (new Blob([latest]).size / 1024).toFixed(1) + 'KB）。');
      return latest;
    } catch (error) {
      resetOutput();
      status('EXPORT: ' + (error?.message || String(error)), true);
      return null;
    } finally {
      busy = false;
      $('make-source').disabled = false;
    }
  }
  $('make-source').addEventListener('click', generate);
  clearButton.addEventListener('click', () => resetOutput(true));
  copyButton.addEventListener('click', async () => {
    invalidateStaleOutput();
    const code = latest;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      status('埋め込みコードをコピーしました。');
    } catch {
      $('generated-source').focus();
      $('generated-source').select();
      status('コードを選択しました。Ctrl/Cmd+Cでコピーしてください。');
    }
  });
  downloadButton.addEventListener('click', () => {
    invalidateStaleOutput();
    const code = latest;
    if (!code) return;
    const full = '<!doctype html>\n<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pseudo-Holographic Map</title></head><body>\n'
      + code + '\n</body></html>';
    const url = URL.createObjectURL(new Blob([full], {type:'text/html;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'embed-test.html'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    status('動作確認用HTMLを保存しました。');
  });
  window.__HoloExportQA = {generate, compose, configForExport, resetOutput, get latest(){return latest;}};
})();
