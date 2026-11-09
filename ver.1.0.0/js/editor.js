/* PSEUDO-HOLOGRAPHIC MAP — ジェネレーター専用。
 * 設定の入力は MAP STYLE / MARKERS、公開ソースの生成は EXPORT に集約。
 */
(() => {
  'use strict';
  const base = window.HOLO_SETTINGS;
  if (!base) return;
  const $ = id => document.getElementById(id);
  const clone = data => JSON.parse(JSON.stringify(data));
  const draft = clone(base);
  const uploaded = new Map();
  if (!Array.isArray(draft.pins) || draft.pins.length !== 1) throw new Error('ピン設定は1件だけにしてください。');
  const selected = draft.pins[0].id;
  let mapReady = false;
  let editingTab = 'style';
  const builtinModels = ['pin','building'];
  const assets = draft.standardAssets;
  const placeholders = draft.placeholderAssets;
  const notifyAssetChange = () => document.dispatchEvent(new Event('holo-editor:asset-change'));
  // 各マーカー設定の未指定項目に初期値を補完する。
  for (const pin of draft.pins) {
    for (const [key,value] of Object.entries({
      imageMode:'standard',imageAnchor:'bottom',
      imageOffsetX:0,imageOffsetY:0,imageOpacity:1,
      scale:1,rotation:0,altitude:0,holoTransparency:78,
      zoomSizesPercent:{15:50,16:100,17:150}
    })) if (pin[key]===undefined) pin[key]=value;
  }
  const uploadedKey = path => uploaded.get(path)?.previewURL || path;
  const selectedPin = () => draft.pins[0];
  const status = (msg,error=false) => { $('editor-status-message').textContent=msg; $('editor-status').classList.toggle('is-error',error); };
  const numeric = value => String(value).trim() === '' ? NaN : Number(value);
  const safeFilename = name => name.replace(/[^a-zA-Z0-9_.-]/g,'_').replace(/^\.+/,'') || 'asset';
  const fmt = n => Number(n).toFixed(2).replace(/\.00$/,'');

  function switchTab(next){
    editingTab = next;
    document.querySelectorAll('[data-studio-tab]').forEach(button=>{
      const active=button.dataset.studioTab===next;
      button.classList.toggle('is-active',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    });
    document.querySelectorAll('.studio-tab-content').forEach(panel=>{
      const active=panel.id==='studio-'+next;
      panel.hidden=!active;
      panel.classList.toggle('is-active',active);
    });
  }
  document.querySelectorAll('[data-studio-tab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.studioTab)));
  document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.goto)));

  // スマホ版は設定パネルを開閉し、地図プレビューの表示領域を確保する。
  const mobile = window.matchMedia('(max-width: 780px)');
  let manuallyToggled=false;
  function toggleEditor(open){
    const aside=$('studio-controls');
    aside.classList.toggle('is-collapsed',!open);
    $('mobile-editor-toggle').setAttribute('aria-expanded',String(open));
    $('mobile-editor-toggle').querySelector('span').textContent=open?'閉じる':'開く';
    $('mobile-editor-toggle').querySelector('.toggle-arrow').textContent=open?'⌃':'⌄';
  }
  function initialMobile(){if(!manuallyToggled)toggleEditor(!mobile.matches);}
  $('mobile-editor-toggle').addEventListener('click',()=>{
    manuallyToggled=true;
    toggleEditor($('studio-controls').classList.contains('is-collapsed'));
  });
  mobile.addEventListener('change',()=>{manuallyToggled=false;initialMobile();});
  initialMobile();

  function renderFields(){
    const p=selectedPin();if(!p)return;
    const defaults={scale:1,rotation:0,altitude:0,
      imageMode:'standard',imageAnchor:'bottom',imageOffsetX:0,imageOffsetY:0,imageOpacity:1,
      holoTransparency:78,zoomSizesPercent:{15:50,16:100,17:150}};
    for(const [key,value] of Object.entries(defaults))if(p[key]===undefined)p[key]=value;
    for(const [id,key] of [
      ['edit-name','name'],['edit-address','address'],['edit-lat','lat'],['edit-lng','lng'],
      ['edit-color','color'],['edit-scale','scale'],['edit-rotation','rotation'],['edit-altitude','altitude'],
      ['edit-image-anchor','imageAnchor'],['edit-image-offset-x','imageOffsetX'],['edit-image-offset-y','imageOffsetY'],
    ]) $(id).value=p[key]??'';
    $('edit-type').value=p.type;
    const standard=builtinModels.includes(p.model);
    $('edit-model').value=standard?p.model:'custom';
    $('custom-glb-upload').hidden=standard;
    $('edit-image-mode').value=p.imageMode;
    $('custom-image-wrap').hidden=p.imageMode!=='custom';
    $('edit-scale-range').value=String(p.scale);
    $('edit-scale-value').textContent=fmt(p.scale)+'×';
    $('edit-rotation-range').value=String(p.rotation);
    $('edit-rotation-value').textContent=fmt(p.rotation)+'°';
    for(const z of [15,16,17]) $('edit-zoom-size-'+z).value=p.zoomSizesPercent[z];
    $('edit-image-opacity').value=Math.round((1-p.imageOpacity)*100);
    $('edit-image-opacity-value').textContent=Math.round((1-p.imageOpacity)*100)+'%';
    $('holo-opacity').value=p.holoTransparency;
    $('holo-opacity-value').textContent=p.holoTransparency+'%';
    $('editor-3d-fields').hidden=p.type!=='3d';
    $('editor-image-fields').hidden=p.type!=='image';
    $('upload-glb').value='';$('upload-image').value='';
    const preview=$('asset-preview-img');
    const imagePath=p.imageMode==='standard'?assets.image:(p.image||placeholders.image);
    if(imagePath) preview.src=uploadedKey(imagePath);else preview.removeAttribute('src');
  }
  function render(){renderFields();}

  function change(id,key,parse=v=>v){
    $(id).addEventListener('input',e=>{
      const p=selectedPin();if(!p)return;
      p[key]=parse(e.target.value);
      if(key==='model')p.customModelUrl=p.model;
      if(key==='model'||key==='image')notifyAssetChange();
      if(key==='scale') { $('edit-scale-range').value=String(p.scale);$('edit-scale').value=String(p.scale);$('edit-scale-value').textContent=fmt(p.scale)+'×'; }
      if(key==='rotation'){$('edit-rotation-range').value=String(p.rotation);$('edit-rotation').value=String(p.rotation);$('edit-rotation-value').textContent=fmt(p.rotation)+'°';}
      if(key==='imageOpacity')$('edit-image-opacity-value').textContent=Math.round((1-p.imageOpacity)*100)+'%';
      status('変更を編集中です。「地図に反映」で更新できます。');
    });
  }
  for(const [id,key] of [
    ['edit-name','name'],['edit-address','address']
  ])change(id,key);
  for(const [id,key] of [
    ['edit-lat','lat'],['edit-lng','lng'],['edit-scale','scale'],['edit-scale-range','scale'],
    ['edit-rotation','rotation'],['edit-rotation-range','rotation'],['edit-altitude','altitude'],
    ['edit-image-offset-x','imageOffsetX'],['edit-image-offset-y','imageOffsetY'],
  ])change(id,key,numeric);
  for(const zoom of [15,16,17]){
    $('edit-zoom-size-'+zoom).addEventListener('input',e=>{
      selectedPin().zoomSizesPercent[zoom]=numeric(e.target.value);
      status('ZOOM '+zoom+' の表示比率（％）を編集中です。');
    });
  }
  change('edit-image-opacity','imageOpacity',v=>1-numeric(v)/100);
  change('edit-color','color');change('edit-image-anchor','imageAnchor');
  $('edit-type').addEventListener('change',e=>{selectedPin().type=e.target.value;render();notifyAssetChange();status('表示形式を切り替えました。');});
  $('edit-model').addEventListener('change',e=>{
    const p=selectedPin();
    if(e.target.value==='custom')p.model=p.customModelUrl||placeholders.glb;
    else {if(!builtinModels.includes(p.model))p.customModelUrl=p.model;p.model=e.target.value;}
    renderFields();notifyAssetChange();status('3Dモデルを変更しました。');
  });
  $('edit-image-mode').addEventListener('change',e=>{
    selectedPin().imageMode=e.target.value;
    renderFields();notifyAssetChange();status('画像マーカーを切り替えました。');
  });
  $('holo-opacity').addEventListener('input',e=>{
    const p=selectedPin();if(!p || p.type!=='3d')return;
    p.holoTransparency=numeric(e.target.value);
    $('holo-opacity-value').textContent=p.holoTransparency+'%';
    status('このピンの透過率を変更しました。');
  });
  async function uploadFile(kind,file){
    if(!file)return;
    const ext=file.name.split('.').pop().toLowerCase();
    if(kind==='image'&&!['jpg','jpeg','png','svg','webp'].includes(ext)){status('画像はJPG・PNG・SVG・WebPを選んでください。',true);return;}
    if(kind==='model'&&ext!=='glb'){status('3DモデルはGLBファイルを選んでください。',true);return;}
    if(file.size>25*1024*1024){status('素材は25MB以下にしてください。',true);return;}
    // 拡張子だけでなくGLB 2.0のヘッダーを検査する（完全な互換性検査ではない）。
    if(kind==='model'){
      try{
        const header=new DataView(await file.slice(0,12).arrayBuffer());
        if(header.byteLength<12 || header.getUint32(0,true)!==0x46546c67 ||
           header.getUint32(4,true)!==2 || header.getUint32(8,true)!==file.size){
          status('GLB 2.0形式のファイルではありません。ファイル形式を確認してください。',true);return;
        }
      }catch{status('GLBファイルの形式を確認できませんでした。',true);return;}
    }
    const path=(kind==='image'?'./images/':'./models/')+safeFilename(file.name);
    const old=uploaded.get(path);if(old)URL.revokeObjectURL(old.previewURL);
    uploaded.set(path,{file,previewURL:URL.createObjectURL(file)});
    const p=selectedPin();
    if(kind==='image'){
      p.type='image';p.imageMode='custom';p.image=path;
    }else{p.type='3d';p.model=path;}
    render();notifyAssetChange();status('素材をプレビューに設定しました。独自素材は生成コードで入力パスを参照します。');
  }
  $('upload-image').addEventListener('change',e=>uploadFile('image',e.target.files?.[0]));
  $('upload-glb').addEventListener('change',e=>uploadFile('model',e.target.files?.[0]));
  const previewPins=()=>[draft.pins[0]].map(p=>{
    const copy=clone(p);
    if(copy.type==='3d')copy.model=uploadedKey(copy.model||placeholders.glb);
    if(copy.type==='image')copy.image=copy.imageMode==='standard' ? assets.image : uploadedKey(copy.image||placeholders.image);
    return copy;
  });

  function validate(){
    if(draft.pins.length!==1 || draft.pins[0].enabled===false)throw new Error('ピンは1件のみ設定できます。');
    const ids=new Set();
    for(const p of draft.pins.filter(p=>p.enabled!==false)){
      if(!p.id||ids.has(p.id))throw new Error('ピンIDが重複しています。');ids.add(p.id);
      if(!Number.isFinite(p.lat)||p.lat < -85||p.lat > 85||!Number.isFinite(p.lng)||p.lng < -180||p.lng>180)
        throw new Error(p.id+' の緯度・経度を確認してください。');
      if(![15,16,17].every(z=>Number.isFinite(p.zoomSizesPercent?.[z])&&p.zoomSizesPercent[z]>=1&&p.zoomSizesPercent[z]<=500))
        throw new Error(p.id+' のZOOM 15・16・17の表示比率は各1～500%で指定してください。');
      if(p.type==='3d'){
        if(!Number.isFinite(p.holoTransparency)||p.holoTransparency<0||p.holoTransparency>95)
          throw new Error(p.id+' の3D透過率は0～95%です。');
        if(!(/^#[\da-f]{6}$/i.test(p.color)))throw new Error(p.id+' の色コードが不正です。');
        if(!(Number.isFinite(p.scale)&&p.scale>=.05&&p.scale<=30))throw new Error(p.id+' の倍率は0.05～30です。');
        if(!Number.isFinite(p.rotation)||Math.abs(p.rotation)>360||!Number.isFinite(p.altitude))throw new Error(p.id+' の回転角は±360°以内、高さは数値で指定してください。');
        if(typeof p.model!=='string')throw new Error(p.id+' のGLB URL・パスが不正です。');
      }else if(p.type==='image'){
        if(!['standard','custom'].includes(p.imageMode))throw new Error(p.id+' の画像マーカーの種類が不正です。');
        if(typeof p.image!=='string')throw new Error(p.id+' の画像URL・パスが不正です。');
        if(!['bottom','center'].includes(p.imageAnchor))throw new Error(p.id+' の画像基準位置を選択してください。');
        if(!Number.isFinite(p.imageOffsetX)||!Number.isFinite(p.imageOffsetY)||
           Math.abs(p.imageOffsetX)>1000||Math.abs(p.imageOffsetY)>1000)throw new Error(p.id+' の位置オフセットは±1000px以内です。');
        if(!Number.isFinite(p.imageOpacity)||p.imageOpacity<0||p.imageOpacity>1)
          throw new Error(p.id+' の画像透過率を確認してください。');
      }else throw new Error(p.id+' の表示形式が不正です。');
    }
  }
  let applying=false;
  function applyPreview(focus=false){
    try{validate();}catch(e){status(e.message,true);return false;}
    if(!mapReady){status('地図の読み込み待ちです。設定の出力は可能です。',true);return false;}
    if(applying)return false;
    applying=true;
    const handler=e=>{
      document.removeEventListener('holo-editor:applied',handler);applying=false;
      if(!e.detail?.ok){status(e.detail?.error||'地図への反映に失敗しました。',true);return;}
      if(focus)document.dispatchEvent(new CustomEvent('holo-editor:focus',{detail:{id:selected}}));
      status('地図に反映しました。');
    };
    document.addEventListener('holo-editor:applied',handler);
    document.dispatchEvent(new CustomEvent('holo-editor:apply',{detail:{pins:previewPins()}}));
    return true;
  }
  $('apply-preview').addEventListener('click',()=>applyPreview());
  $('apply-preview-details').addEventListener('click',()=>applyPreview());
  $('focus-marker').addEventListener('click',()=>applyPreview(true));
  $('locate-on-map').addEventListener('click',()=>{
    if(!mapReady){status('地図を読み込んでから指定してください。',true);return;}
    document.dispatchEvent(new CustomEvent('holo-editor:pick',{detail:{id:selected}}));
    status('右側の地図で設置位置をクリックしてください。');
  });
  document.addEventListener('holo-editor:picked',e=>{
    const p=draft.pins.find(q=>q.id===e.detail?.id);if(!p)return;
    p.lat=Number(e.detail.lat.toFixed(7));p.lng=Number(e.detail.lng.toFixed(7));
    render();document.dispatchEvent(new Event('holo-editor:draft-change'));
    status('座標を入力しました。「地図に反映」で確認できます。');
  });
  $('address-search').addEventListener('click',async()=>{
    const p=selectedPin();if(!p?.address?.trim()){status('住所を先に入力してください。',true);return;}
    status('住所を検索しています…');
    try{
      const url='https://nominatim.openstreetmap.org/search?format=json&limit=1&q='+encodeURIComponent(p.address);
      const res=await fetch(url,{headers:{'Accept-Language':'ja'}});
      if(!res.ok)throw new Error('検索サービスが応答しません（'+res.status+'）');
      const data=await res.json();if(!data.length)throw new Error('座標が見つかりません');
      p.lat=Number(data[0].lat);p.lng=Number(data[0].lon);
      renderFields();document.dispatchEvent(new Event('holo-editor:draft-change'));
      status('座標を取得しました。地図に反映してください。');
    }catch(e){status(e.message+'。検索が制限される場合は座標を直接入力してください。',true);}
  });

  // MAP STYLE: 地図のスタイル変更は外側HTMLからイベントを受けて同期する。
  document.querySelectorAll('[data-map-style]').forEach(button=>button.addEventListener('click',()=>{
    if(!button.disabled)draft.map.initialStyle=button.dataset.mapStyle;
  }));
  const heightInput=$('edit-map-height');
  heightInput.value=String(draft.map.height);
  document.documentElement.style.setProperty('--studio-map-height',draft.map.height+'px');
  heightInput.addEventListener('change',()=>{
    const v=numeric(heightInput.value);
    if(!Number.isInteger(v)||v<260||v>1100){status('高さは260～1100pxで指定してください。',true);heightInput.value=draft.map.height;return;}
    draft.map.height=v;document.documentElement.style.setProperty('--studio-map-height',v+'px');
    document.dispatchEvent(new CustomEvent('holo-editor:height',{detail:{height:v}}));
    status('地図の高さを'+v+'pxに変更しました。');
  });
  document.addEventListener('holo-map:ready',()=>{mapReady=true;status('地図の準備ができました。');});

  function publishSettings(){
    validate();
    const settings=clone(draft);
    settings.pins=[settings.pins[0]].map(p=>{
      const common={id:p.id,type:p.type,name:p.name,address:p.address,lng:p.lng,lat:p.lat,
        zoomSizesPercent:p.zoomSizesPercent};
      // 1ピンのみ出力。表示形式と無関係な設定は省きます。
      if(p.type==='3d'){
        return {...common,model:p.model,color:p.color,scale:p.scale,rotation:p.rotation,
          altitude:p.altitude,holoTransparency:p.holoTransparency};
      }
      return {...common,imageMode:p.imageMode,image:p.image,
        imageAnchor:p.imageAnchor,imageOffsetX:p.imageOffsetX,
        imageOffsetY:p.imageOffsetY,imageOpacity:p.imageOpacity};
    });
    return settings;
  }
  // EXPORTのコード生成と保存は exporter.js が担当する。
  render();switchTab('style');
  window.__holoEditorDiagnostics={draft,uploaded,validate,get selected(){return selected;},publishSettings,applyPreview,switchTab};
})();
