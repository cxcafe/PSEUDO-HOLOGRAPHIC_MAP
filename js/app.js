(async () => {
  const importFallback = async (urls, label) => {
    let failure;
    for (const url of urls) {
      try { return await import(url); } catch (error) { failure = error; console.warn(label + ' failed from ' + url, error); }
    }
    throw new Error(label + ' を読み込めませんでした。CDNまたはブラウザの制限を確認してください。', { cause: failure });
  };
  // Three.js 本体と GLB ローダーは importmap で同じバージョンを参照します。
  const [maplibregl, THREE] = await Promise.all([
    importFallback([
      'https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs',
      'https://cdn.jsdelivr.net/npm/maplibre-gl@6.16.0/dist/maplibre-gl.mjs'
    ], 'MapLibre GL JS'),
    import('three')
  ]);

  // 地図とマーカーの初期設定は config.js から取得する。
  const SETTINGS = window.HOLO_SETTINGS;
  if (!SETTINGS || !Array.isArray(SETTINGS.pins)) {
    throw new Error('地図設定を読み込めません。設定情報をご確認ください。');
  }


  const config = SETTINGS.map;
  if (SETTINGS.pins.length !== 1 || SETTINGS.pins[0].enabled === false) {
    throw new Error('ピン設定は有効な1件だけにしてください。');
  }
  const points = SETTINGS.pins;
  const ids = new Set();
  for (const p of points) {
    // 表示形式が未指定のピンは3Dとして扱う。
    p.type = p.type ?? '3d';
    if (typeof p.id !== 'string' || !p.id.trim() || ids.has(p.id)) {
      throw new Error('マーカーの id が空、または重複しています: ' + p.id);
    }
    if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat) ||
        p.lng < -180 || p.lng > 180 || p.lat < -85 || p.lat > 85) {
      throw new Error(p.id + ' の緯度・経度が正しくありません。');
    }
    if (p.type !== '3d' && p.type !== 'image') {
      throw new Error(p.id + ' の type は 3d または image にしてください。');
    }
    if (p.type === '3d') {
      if (!/^#[0-9a-fA-F]{6}$/.test(p.color)) {
        throw new Error(p.id + ' の color は #RRGGBB で指定してください。');
      }
      if (!(typeof p.model === 'string' && (
        typeof p.model==='string' && p.model.trim().length>0
      ))) {
        throw new Error(p.id + ' の model にGLBのURL・パスを指定してください。');
      }
    } else {
      if (typeof p.image !== 'string' || !p.image.trim()) {
        throw new Error(p.id + ' の image に画像ファイルへのパスを指定してください。');
      }
      if (p.imageAnchor !== undefined && !['bottom','center'].includes(p.imageAnchor)) {
        throw new Error(p.id + ' の imageAnchor は bottom / center を指定してください。');
      }
      for (const key of ['imageOffsetX','imageOffsetY']) {
        if (p[key] !== undefined && (!Number.isFinite(p[key]) || Math.abs(p[key])>1000))
          throw new Error(p.id + ' の ' + key + ' は ±1000px 以内にしてください。');
      }
      if (p.imageOpacity !== undefined && (!Number.isFinite(p.imageOpacity) || p.imageOpacity < 0 || p.imageOpacity > 1)) {
        throw new Error(p.id + ' の imageOpacity は 0～1 の数値にしてください。');
      }
    }
    if (![15,16,17].every(z=>Number.isFinite(p.zoomSizesPercent?.[z]) && p.zoomSizesPercent[z]>=1 && p.zoomSizesPercent[z]<=500))
      throw new Error(p.id + ' のZOOM 15・16・17の表示比率は各1～500%で指定してください。');
    if (p.type === '3d' && (!Number.isFinite(p.holoTransparency ?? 78) ||
        (p.holoTransparency ?? 78) < 0 || (p.holoTransparency ?? 78) > 95))
      throw new Error(p.id + ' の3D透過率は0～95%です。');
    ids.add(p.id);
  }
  let threeDPoints = points.filter((p) => p.type === '3d');
  let has3DMarkers = threeDPoints.length > 0;
  // 1件だけのピンが地図の中心です。
  let mainPin = points[0];
  const rotationAngles = [0, 90, 180, 270].map((angle) => config.bearing + angle);

  const shell = document.getElementById('holo-map-shell');
  const status = document.getElementById('map-status');
  const card = document.getElementById('holo-place-card');
  const cardClose = document.getElementById('holo-card-close');
  const placeName = document.getElementById('place-name');
  const placeAddress = document.getElementById('place-address');
  const placeLink = document.getElementById('place-map-link');
  const hudZoom = document.getElementById('hud-zoom');
  const hudPitch = document.getElementById('hud-pitch');
  const hudBearing = document.getElementById('hud-bearing');
  const mobileCardMedia = window.matchMedia('(max-width: 1024px)');

  shell.style.setProperty('--map-height', config.height + 'px');

  let currentStyle = config.initialStyle;
  // 地図に合わせて、地図内のボタン・情報カード・ラベルもライト／ダークを切り替える。
  function applyMapUITheme(style) {
    shell.dataset.mapTheme = style === 'positron' ? 'positron' : 'dark';
  }
  applyMapUITheme(currentStyle);
  let requestedStyle = null;
  let rotationIndex = 0;
  let selectedPointId = mainPin.id;
  const markerEntries = [];

  const map = new maplibregl.Map({
    container: 'holo-map',
    style: config.styles[currentStyle],
    center: [mainPin.lng, mainPin.lat],
    zoom: config.zoom,
    minZoom: config.minZoom,
    maxZoom: config.maxZoom,
    pitch: config.pitch,
    bearing: config.bearing,
    canvasContextAttributes: { antialias: true }
  });

  map.setPadding(config.padding);
  map.scrollZoom.enable({ around: 'center' });
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.touchPitch?.disable();

  function publishState() {
    document.dispatchEvent(new CustomEvent('holo-map:state', {
      detail: {
        style: requestedStyle ?? currentStyle,
        changingStyle: requestedStyle !== null
      }
    }));
  }

  function showLocation(point, revealCard = true) {
    selectedPointId = point.id;
    placeName.textContent = point.name;
    placeAddress.textContent = point.address;
    placeLink.href = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(point.lat + ',' + point.lng);
    if (revealCard) card.classList.add('is-open');

    card.classList.remove('is-highlighted');
    void card.offsetWidth;
    card.classList.add('is-highlighted');
  }

  function updateHud() {
    hudZoom.textContent = 'ZOOM ' + map.getZoom().toFixed(1);
    hudPitch.textContent = 'PITCH ' + Math.round(map.getPitch()) + '°';
    hudBearing.textContent = 'BEARING ' + Math.round(map.getBearing()) + '°';
  }

  function updateMarkerOrder() {
    // 1ピン固定。前後の並べ替えは不要です。
    if (markerEntries[0]) markerEntries[0].element.style.zIndex = '1';
  }

  // ===== 3D建物除外 =====
  const BUILDING_SOURCE = 'holo-buildings-source';
  const BUILDING_LAYER = 'holo-buildings-3d';
  function buildingFilter(point) {
    return [
      'all',
      ['!=', ['get', 'hide_3d'], true],
      ['>', ['distance', {
        type: 'Point',
        coordinates: [point.lng, point.lat]
      }], 0]
    ];
  }
  function updateBuildingFilter() {
    if (config.show3D && map.getLayer(BUILDING_LAYER)) {
      map.setFilter(BUILDING_LAYER, buildingFilter(mainPin));
    }
  }

  function install3DBuildings() {
    if (!config.show3D || map.getLayer(BUILDING_LAYER)) return;

    const firstLabel = map.getStyle().layers.find(
      (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
    );
    if (!map.getSource('holo-buildings-source')) {
      map.addSource('holo-buildings-source', {
        type: 'vector',
        url: config.buildingSourceUrl
      });
    }

    // setStyle() で独自レイヤーは消えるため、style.load のたびに再登録する。
    // 周辺建物の配色はマーカーの色と分離して設定する。
    const theme = requestedStyle ?? currentStyle;
    const buildingColor = config.buildingColors?.[theme] ??
      (theme === 'positron' ? '#afb7c0' : '#364451');
    const buildingOpacity = config.buildingOpacities?.[theme] ??
      (theme === 'positron' ? 1 : 0.92);
    map.addLayer({
      id: BUILDING_LAYER,
      type: 'fill-extrusion',
      source: BUILDING_SOURCE,
      'source-layer': 'building',
      minzoom: config.buildingStartZoom,
      filter: buildingFilter(mainPin),
      paint: {
        'fill-extrusion-color': buildingColor,
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          config.buildingStartZoom, 0,
          config.buildingFullZoom, ['coalesce', ['get', 'render_height'], config.defaultBuildingHeight]
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': buildingOpacity
      }
    }, firstLabel?.id);
  }

  function makeMarker(point) {
    // MapLibre の Marker を共通で利用。座標やカードは3Dと画像で共用します。
    const element = document.createElement('button');
    element.type = 'button';
    const isImage = point.type === 'image';
    element.className = 'holo-marker ' + (isImage ? 'holo-marker-image' : 'holo-marker-3d');
    element.setAttribute('aria-label', point.name + (isImage ? 'の画像マーカー' : 'の3Dホログラム') + 'の情報を表示');
    if (isImage) {
      // 素材URLは、MapLibreマーカーを追加した後に設定する。
      // 画像の読込完了前・キャッシュ済みのどちらにも対応するため、画像のサイズ制御を独立させた。
      element.style.visibility = 'hidden';
      const image = document.createElement('img');
      image.alt = ''; // ボタン自体に読み上げ用の名前を設定済み
      image.draggable = false;
      image.decoding = 'async';
      image.style.opacity = String(point.imageOpacity ?? 1);
      element.appendChild(image);
    }
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      showLocation(point);
    });
    return element;
  }

  // 画像をマーカーに登録した後で読み込む。これによりキャッシュ・初回とも同じ処理になる。
  function attachImageSizer(entry){
    const {point,element}=entry;
    const image=element.querySelector('img');
    if(!image) return;
    const sizing=window.HoloImageMarkerSizing;
    if(!sizing) throw new Error('image-marker-sizing.js を読み込めません。');
    entry.imageSizer=sizing.attach({
      element,image,point,
      getZoom:()=>map.getZoom(),
      onError:()=>{
        if (!markerEntries.includes(entry)) return;
        failedImages.add(point.id);
        imageErrorMessage = '画像 '+point.id+' を読み込めません: '+point.image;
        console.error('画像マーカーの読み込みに失敗:',point.id,point.image);
        updateMarkerStatus();
      }
    });
    image.addEventListener('load', () => {
      if (!markerEntries.includes(entry)) return;
      failedImages.delete(point.id);
      imageErrorMessage = '';
      updateMarkerStatus();
    });
    // イベントリスナーを登録してからsrcを指定する。
    image.src=point.image;
    entry.imageSizer.update();
  }

  // ───────────────────── 3D表示処理 ─────────────────────
  // 3Dマーカーの透過率はピンごとの設定値を使用する。
  const holoOpacity = point => Math.max(.05, 1-Math.min(95,Math.max(0,Number(point?.holoTransparency ?? 78)))/100);
  const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
  function zoomSizePercent(point,zoom){
    // ZOOM 15・16・17の表示比率を隣接するズーム間で線形補間する。
    const sizes=point.zoomSizesPercent;
    const z=clamp(zoom,15,17);
    const low=Math.floor(z),high=Math.min(17,low+1);
    return sizes[low]+(sizes[high]-sizes[low])*(z-low);
  }
  const scene = new THREE.Scene();
  // v1.6の立体的な材質表現を維持し、指定色に干渉しない白色光で照らす。
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.2));
  const sunlight = new THREE.DirectionalLight(0xffffff, 1.1);
  sunlight.position.set(18,35,15);
  scene.add(sunlight);
  const camera = new THREE.Camera();
  const mapMatrix = new THREE.Matrix4();
  const transformation = new THREE.Matrix4();
  let mapOrigin = maplibregl.MercatorCoordinate.fromLngLat([mainPin.lng,mainPin.lat],0);
  let metersToMerc = mapOrigin.meterInMercatorCoordinateUnits();
  // X=東、Y=上、Z=南。MercatorCoordinateへ変換（緯度経度は各ピンが持つ）。
  let localToMerc = new THREE.Matrix4()
    .makeTranslation(mapOrigin.x,mapOrigin.y,mapOrigin.z)
    .multiply(new THREE.Matrix4().makeScale(metersToMerc,-metersToMerc,metersToMerc))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));

  const anchors = new Map();
  const translucentMaterials = [];
  const outlineMaterials = [];
  const quality = { instances:0, drawGroups:0, loadedGlb:0 };
  let renderer = null, mapReady = false;
  const failedModels = new Set();
  const failedImages = new Set();
  const loadingModels = new Set();
  let modelErrorMessage = '';
  let imageErrorMessage = '';
  let mapErrorMessage = '';
  // 現在選択中の素材だけの状態を表示する。
  function updateMarkerStatus() {
    const message = modelErrorMessage || imageErrorMessage || mapErrorMessage ||
      (loadingModels.size ? 'GLBを読み込み中…' : '');
    if (message) {
      if (status.textContent !== message) status.textContent = message;
      status.hidden = false;
    } else if (mapReady) {
      status.hidden = true;
    } else {
      status.textContent = '地図を読み込み中…';
      status.hidden = false;
    }
  }
  let glbLoaderPromise;
  function getGlbLoader(){
    if(!glbLoaderPromise){
      glbLoaderPromise=import('three/addons/loaders/GLTFLoader.js')
        .then(({GLTFLoader})=>new GLTFLoader())
        .catch(error => { glbLoaderPromise=null; throw error; });
    }
    return glbLoaderPromise;
  }
  function showModelError(point,error){
    failedModels.add(point.id);
    modelErrorMessage = point.id + ': 3Dモデル「' + point.model + '」を読み込めません。' +
      (error?.message ? ' ' + error.message : ' URL・配信元の設定を確認してください。');
    console.error('[GLB]',modelErrorMessage,error);
    updateMarkerStatus();
  }
  function loadWithTimeout(promise, milliseconds) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer=setTimeout(() => reject(new Error('GLBの読み込みが時間内に完了しませんでした。')), milliseconds);
      })
    ]).finally(() => clearTimeout(timer));
  }
  async function createGlb(holder,point){
    const stillCurrent = () => anchors.get(point.id)?.holder === holder;
    loadingModels.add(point.id);
    updateMarkerStatus();
    try{
      const isStandard = ['pin','building','magic'].includes(point.model);
      // プレビューとEXPORTは同じ標準GLBファイルを読み込む。
      const modelUrl = isStandard ? SETTINGS.standardAssets[point.model] : point.model;
      if (location.protocol === 'file:' && !/^(https?:|blob:|data:)/i.test(modelUrl)) {
        throw new Error('ローカルファイルから相対パスのGLBは読み込めません。');
      }
      const loader=await loadWithTimeout(getGlbLoader(), 30000);
      if(!stillCurrent()) return;
      const result=await loadWithTimeout(loader.loadAsync(modelUrl), 30000);
      if(!stillCurrent()) return;
      const model=result.scene;
      // モデルの横幅（X軸）を10mに揃える。
      const bounds=new THREE.Box3().setFromObject(model);
      if(bounds.isEmpty()) throw new Error('GLB内に表示可能なメッシュがありません');
      if(!bounds.isEmpty()){
        const size=bounds.getSize(new THREE.Vector3());
        if(!Number.isFinite(size.x) || size.x <= 0) throw new Error('モデルの横幅が不正です。');
        const factor=10/size.x;
        const center=bounds.getCenter(new THREE.Vector3());
        model.scale.multiplyScalar(factor);
        model.position.set(-center.x*factor,-bounds.min.y*factor,-center.z*factor);
      }
      const tint=new THREE.Color(point.color);
      model.traverse((child)=>{
        if(!child.isMesh) return;
        child.frustumCulled=false;
        child.renderOrder=1;
        const customize = (original)=>{
          // 元の材質を複製して頂点アルファ・材質表現を維持する。
          const mat=original.clone();
          if(mat.color) mat.color.copy(tint);
          if(mat.emissive) mat.emissive.copy(tint);
          if('emissiveIntensity' in mat) mat.emissiveIntensity=.28;
          mat.transparent=true;
          mat.opacity=holoOpacity(point)*Number(original.opacity ?? 1);
          mat.depthWrite=false;
          mat.depthTest=true;
          mat.side=THREE.DoubleSide;
          mat.needsUpdate=true;
          translucentMaterials.push({material:mat,multiplier:1,owner:point.id});
          return mat;
        };
        child.material=Array.isArray(child.material)
          ? child.material.map(customize) : customize(child.material);
        const edges = new THREE.EdgesGeometry(child.geometry, 22);
        const positions = edges.getAttribute('position');
        if (positions && positions.count > 0) {
          const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
            color: tint,
            transparent: true,
            opacity: Math.max(0, Math.min(1, (.32 + holoOpacity(point)) * .65)),
            depthWrite: false,
            depthTest: true
          }));
          lines.frustumCulled = false;
          lines.renderOrder = 3;
          child.add(lines);
          outlineMaterials.push({material:lines.material,multiplier:1,owner:point.id});
        } else {
          edges.dispose();
        }
      });
      holder.add(model);
      measureAnchor(point.id);
      updateZoomMarkerSizes();

      quality.loadedGlb++;
      model.traverse(child => {
        if (child.isMesh) quality.instances++;
        if (child.isMesh || child.isLineSegments) quality.drawGroups++;
      });
      failedModels.delete(point.id);
      modelErrorMessage = '';
      map.triggerRepaint();
    }catch(error){
      if(stillCurrent()) showModelError(point,error);
    }finally{
      if(stillCurrent()){
        loadingModels.delete(point.id);
        updateMarkerStatus();
      }
    }
  }

  function makeAnchor(point){
    const p=maplibregl.MercatorCoordinate.fromLngLat([point.lng,point.lat],0);
    const root=new THREE.Group();
    root.position.set((p.x-mapOrigin.x)/metersToMerc,point.altitude??1,(p.y-mapOrigin.y)/metersToMerc);
    scene.add(root);
    const holder=new THREE.Group();
    holder.rotation.y=THREE.MathUtils.degToRad(Number(point.rotation)||0);
    root.add(holder);
    anchors.set(point.id,{root,holder,point,baseHeight:0,computedPixels:0});
    createGlb(holder,point);
  }
  // 3Dモデルの基準寸法を保持。ZOOM別の%はこの寸法に対して適用する。
  function measureAnchor(id){
    const entry=anchors.get(id);if(!entry)return;
    entry.holder.scale.setScalar(1);
    entry.holder.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(entry.holder);
    const size=bounds.getSize(new THREE.Vector3());
    entry.baseHeight=Math.max(.01,size.y);
  }
  function updateZoomMarkerSizes(){
    const zoom=map.getZoom();
    for(const entry of markerEntries){
      if(entry.point.type!=='image')continue;
      // ジェネレーターで変えた％と現在の地図ZOOMの両方を反映する。
      entry.imageSizer?.update();
    }
    for(const entry of anchors.values()){
      if(!entry.baseHeight)continue;
      const point=entry.point;
      const metersPerPixel=Math.cos(point.lat*Math.PI/180)*40075016.686/(512*Math.pow(2,zoom));
      const percent=zoomSizePercent(point,zoom)/100;
      // 100%はpoint.scaleで指定した実寸。地図のズーム自体も自然に反映される。
      const actualScale=Number(point.scale??1)*percent;
      entry.holder.scale.setScalar(actualScale);
      entry.computedPixels=entry.baseHeight*actualScale/metersPerPixel;
    }
    if(has3DMarkers)map.triggerRepaint();
  }
  threeDPoints.forEach(makeAnchor);
  updateZoomMarkerSizes();

  function applyHoloVisibility(){
    anchors.forEach(({root})=>{root.visible=true;});
    map.triggerRepaint();
  }

  // 3Dマーカーを地図の上に重ねるため、描画用キャンバスを分離する。
  // MapLibreのWebGL深度バッファと共有しない、透明なThree.js専用canvasを
  // 地図canvasの上に重ねる。MapLibreからは投影行列だけを取得して同期する。
  // これにより地図の建物・道路・地名はそのまま、ホログラムの描画優先度を保証する。
  // 注意: 物理的な前後遮蔽ではなく、意図的な「3Dマーカー優先」の合成。
  let overlayCanvas=null;
  let overlaySize={width:0,height:0};
  const custom3DLayer={
    id:'holo-real-3d-markers',type:'custom',renderingMode:'2d',
    onAdd(mapInstance){
      if(!overlayCanvas){
        overlayCanvas=document.createElement('canvas');
        overlayCanvas.className='holo-three-overlay';
        overlayCanvas.setAttribute('aria-hidden','true');
      }
      // MapLibreとは独立したcanvas。style変更後も同一canvasを再利用する。
      if(overlayCanvas.parentElement!==mapInstance.getContainer()){
        mapInstance.getContainer().appendChild(overlayCanvas);
      }
      overlayCanvas.hidden=false;
      if(!renderer){
        renderer=new THREE.WebGLRenderer({
          canvas:overlayCanvas,alpha:true,antialias:true,
          premultipliedAlpha:true,powerPreference:'low-power'
        });
        renderer.autoClear=true;
        renderer.setClearColor(0x000000,0); // 地図を上書きせず透かす
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
        renderer.shadowMap.enabled=false;
        renderer.outputColorSpace=THREE.SRGBColorSpace;
      }
    },
    render(_gl,args){
      const view=args?.defaultProjectionData?.mainMatrix;
      if(!renderer||!view||!overlayCanvas||overlayCanvas.hidden)return;
      const mapCanvas=map.getCanvas();
      const width=Math.max(1,Math.round(mapCanvas.clientWidth||map.getContainer().clientWidth));
      const height=Math.max(1,Math.round(mapCanvas.clientHeight||map.getContainer().clientHeight));
      if(width!==overlaySize.width||height!==overlaySize.height){
        renderer.setSize(width,height,false);
        overlaySize={width,height};
      }
      // 投影は元の地図と同じ。背景の深度バッファだけを分離する。
      mapMatrix.fromArray(view);
      transformation.multiplyMatrices(mapMatrix,localToMerc);
      camera.projectionMatrix.copy(transformation);
      camera.projectionMatrixInverse.copy(transformation).invert();
      renderer.render(scene,camera);
      if(!mapReady) mapReady=true;
      updateMarkerStatus();
    },
    onRemove(){ /* style切替時も3D用canvasを再利用する */ }
  };
  function installHoloLayer(){
    if (!has3DMarkers) {
      if(overlayCanvas)overlayCanvas.hidden=true;
      mapReady=true;
      updateMarkerStatus();
      return;
    }
    if(overlayCanvas)overlayCanvas.hidden=false;
    if(map.getLayer(custom3DLayer.id))return;
    map.addLayer(custom3DLayer);
    map.triggerRepaint();
  }
  window.__holoDiagnostics = {
    get markerTypes(){return Object.fromEntries(points.map(p=>[p.id,p.type]));},
    get imageIds(){return points.filter(p=>p.type==='image').map(p=>p.id);},
    get modelIds(){return points.filter(p=>p.type==='3d').map(p=>p.id);},
    get visibleMarkerIds(){return markerEntries.filter(e=>e.visible).map(e=>e.point.id);},
    get buildingPartCount(){return quality.instances;},
    get drawGroups(){return quality.drawGroups;},
    get map3DReady(){return mapReady;},
    get zoomPixelSizes(){return Object.fromEntries([...anchors].map(([id,item])=>[id,item.computedPixels]));},
    get imagePixelSizes(){return Object.fromEntries(markerEntries.filter(e=>e.point.type==='image').map(e=>[e.point.id,{width:e.imageSizer?.width??null,height:e.imageSizer?.height??null,percent:window.HoloImageMarkerSizing.percentAtZoom(e.point.zoomSizesPercent,map.getZoom()),zoom:map.getZoom()}]));},
    get modelTransparency(){return Object.fromEntries([...anchors].map(([id,item])=>[id,item.point.holoTransparency??78]));},
    get mapCenter(){return [mainPin.lng,mainPin.lat];},
    get visibleIds(){return [...anchors.entries()].filter(([,x])=>x.root.visible).map(([id])=>id);},
    get markerDepthMode(){return 'front-overlay';},
    get overlayCanvasReady(){return !!overlayCanvas && overlayCanvas.isConnected && !overlayCanvas.hidden;},
    get overlayCanvasSize(){return {...overlaySize};},
    get hiddenMapLayers(){return [];},
    get buildingReplacementFilter(){return map.getLayer(BUILDING_LAYER)?.filter ?? null;}
  };

  // マーカーは1件のみです。
  function refreshMarkerVisibility() {
    markerEntries.forEach(entry => { entry.visible = true; entry.element.style.display = ''; });
    updateMarkerOrder();
    applyHoloVisibility();
    publishState();
  }

  function setMapStyle(key) {
    if (!Object.hasOwn(config.styles, key) || requestedStyle !== null || key === currentStyle) return;
    requestedStyle = key;
    applyMapUITheme(key);
    publishState();
    map.setStyle(config.styles[key]);
  }

  function resetView() {
    rotationIndex = 0;
    map.stop();
    map.easeTo({
      center: [mainPin.lng, mainPin.lat],
      zoom: config.zoom,
      pitch: config.pitch,
      bearing: config.bearing,
      padding: config.padding,
      duration: config.animationDuration
    });
    showLocation(mainPin, false);
    card.classList.toggle('is-open', !mobileCardMedia.matches);
    updateMarkerOrder();
  }

  function customControl(className, label, title, action) {
    return {
      onAdd() {
        const container = document.createElement('div');
        container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.textContent = label;
        if (className === 'holo-rotate-button') {
          button.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M10.6 5.3a7.9 7.9 0 1 0 9 8.9"/><path d="M9.9 1.4v8.2l6-4.1z" fill="currentColor" stroke="none"/></svg>';
        }
        button.addEventListener('click', () => action(button));
        container.appendChild(button);
        this.container = container;
        return container;
      },
      onRemove() {
        this.container.remove();
      }
    };
  }

  function rotateView(button) {
    if (button.disabled) return;
    rotationIndex = (rotationIndex + 1) % rotationAngles.length;
    const targetBearing = rotationAngles[rotationIndex];
    const difference = ((targetBearing - map.getBearing() + 540) % 360) - 180;
    if (Math.abs(difference) < 0.001) {
      updateMarkerOrder();
      return;
    }
    button.disabled = true;
    map.once('moveend', () => {
      updateMarkerOrder();
      button.disabled = false;
    });
    map.easeTo({ bearing: targetBearing, duration: config.animationDuration });
  }

  // ジェネレーターからの地図プレビュー更新。再読み込みせず差し替えるため軽量です。
  function replacePreviewPins(nextPins) {
    if (!Array.isArray(nextPins) || nextPins.length !== 1 || nextPins[0].enabled === false)
      throw new Error('ピン設定は有効な1件だけにしてください。');
    const nextActive = nextPins;
    const nextIds = new Set();
    for (const p of nextPins) {
      if (!p.id || nextIds.has(p.id)) throw new Error('ピンのIDが空、または重複しています。');
      nextIds.add(p.id);
      if (!Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng)) ||
          Number(p.lat) < -85 || Number(p.lat) > 85 || Number(p.lng) < -180 || Number(p.lng) > 180)
        throw new Error(p.id + ' の座標が正しくありません。');
      if (!['3d', 'image'].includes(p.type)) throw new Error(p.id + ' の表示種別が正しくありません。');
    }
    // 先にすべてを検証し、異常があれば今の地図を壊さない。
    markerEntries.forEach(entry => { entry.imageSizer?.dispose(); entry.mapMarker?.remove(); });
    markerEntries.length = 0;
    anchors.forEach(({root}) => {
      root.traverse(node => {
        if(node.geometry && typeof node.geometry.dispose==='function') node.geometry.dispose();
      });
      scene.remove(root);
    });
    anchors.clear();
    for(const {material} of [...translucentMaterials,...outlineMaterials]) material.dispose();
    translucentMaterials.length=0; outlineMaterials.length=0;
    quality.instances=0; quality.drawGroups=0; quality.loadedGlb=0;
    failedModels.clear(); failedImages.clear(); loadingModels.clear();
    modelErrorMessage=''; imageErrorMessage='';
    updateMarkerStatus();
    points.splice(0,points.length,...nextActive);
    mainPin=points[0];
    threeDPoints=points.filter(p=>p.type==='3d');
    has3DMarkers=threeDPoints.length>0;
    // 原点の再計算で遠方に配置した地点でも地図座標を維持する。
    mapOrigin=maplibregl.MercatorCoordinate.fromLngLat([mainPin.lng,mainPin.lat],0);
    metersToMerc=mapOrigin.meterInMercatorCoordinateUnits();
    localToMerc=new THREE.Matrix4()
      .makeTranslation(mapOrigin.x,mapOrigin.y,mapOrigin.z)
      .multiply(new THREE.Matrix4().makeScale(metersToMerc,-metersToMerc,metersToMerc))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI/2));
    nextActive.forEach((point,index) => {
      const element=makeMarker(point);
      const mapMarker=new maplibregl.Marker({
        element,
        anchor: point.type === 'image' ? (point.imageAnchor || 'bottom') : 'bottom',
        offset: point.type === 'image' ? [point.imageOffsetX ?? 0,point.imageOffsetY ?? 0] : [0,0]
      })
        .setLngLat([point.lng,point.lat]).addTo(map);
      const entry={element,point,index,visible:true,mapMarker};
    markerEntries.push(entry);
    if(point.type==='image')attachImageSizer(entry);
    });
    threeDPoints.forEach(makeAnchor);
    updateZoomMarkerSizes();
    updateBuildingFilter();

    if(has3DMarkers){installHoloLayer();}
    else if(map.getLayer(custom3DLayer.id)) { map.removeLayer(custom3DLayer.id); if(overlayCanvas)overlayCanvas.hidden=true; updateMarkerStatus(); }
    refreshMarkerVisibility();
    showLocation(mainPin,false);
    // 地図の視点は維持。ジェネレーターの「地点へ移動」は別操作。
    map.triggerRepaint();
  }

  document.addEventListener('holo-editor:apply', event => {
    try {
      const next=event.detail;
      replacePreviewPins(next.pins);

      document.dispatchEvent(new CustomEvent('holo-editor:applied',{detail:{ok:true}}));
    }catch(error){
      console.error('[GENERATOR]',error);
      document.dispatchEvent(new CustomEvent('holo-editor:applied',{detail:{ok:false,error:error.message}}));
    }
  });
  document.addEventListener('holo-editor:focus', event => {
    const p=points.find(q=>q.id===event.detail?.id);
    if (!p) return;
    map.easeTo({center:[p.lng,p.lat],duration:500});
    showLocation(p,true);
  });
  document.addEventListener('holo-editor:pick', event => {
    const id=event.detail?.id;
    const canvas=map.getCanvas();
    canvas.style.cursor='crosshair';
    map.once('click', e => {
      canvas.style.cursor='';
      document.dispatchEvent(new CustomEvent('holo-editor:picked',{
        detail:{id, lat:e.lngLat.lat, lng:e.lngLat.lng}
      }));
    });
  });

  // 初期表示とイベントの登録
  showLocation(mainPin, false);
  card.classList.toggle('is-open', !mobileCardMedia.matches);
  card.addEventListener('animationend', () => card.classList.remove('is-highlighted'));
  cardClose.addEventListener('click', () => card.classList.remove('is-open'));
  mobileCardMedia.addEventListener('change', (event) => {
    card.classList.toggle('is-open', !event.matches);
  });

  map.addControl(new maplibregl.NavigationControl({
    showZoom: true,
    showCompass: false
  }), 'top-right');
  if (config.rotationEnabled) {
    map.addControl(customControl(
      'holo-rotate-button', '', '地図を右に90度回転', rotateView
    ), 'top-right');
  }
  map.addControl(customControl(
    'holo-reset-button', 'RESET', '地図を初期表示に戻す', resetView
  ), 'top-right');
  if (config.showScale) {
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-left');
  }

  points.forEach((point, index) => {
    const element = makeMarker(point);
    const mapMarker = new maplibregl.Marker({
      element,
      anchor: point.type === 'image' ? (point.imageAnchor || 'bottom') : 'bottom',
      offset: point.type === 'image' ? [point.imageOffsetX ?? 0,point.imageOffsetY ?? 0] : [0,0]
    })
      .setLngLat([point.lng, point.lat])
      .addTo(map);
    const entry={element,point,index,visible:true,mapMarker};
    markerEntries.push(entry);
    if(point.type==='image')attachImageSizer(entry);
  });
  refreshMarkerVisibility();
  updateZoomMarkerSizes();

  map.on('move', () => {
    updateHud();
    updateZoomMarkerSizes();
    if (config.rotationEnabled) updateMarkerOrder();
  });
  map.on('style.load', () => {
    try {
      install3DBuildings();
      installHoloLayer();
      mapErrorMessage='';
      updateMarkerStatus();

      if (requestedStyle !== null) {
        currentStyle = requestedStyle;
        requestedStyle = null;
        applyMapUITheme(currentStyle);
        publishState();
      }
    } catch (error) {
      console.error('3Dレイヤー初期化エラー', error);
      mapErrorMessage = '3D表示の初期化に失敗: ' + (error?.message || String(error));
      updateMarkerStatus();
    }
  });
  map.on('load', () => {
    updateMarkerStatus();
    document.dispatchEvent(new CustomEvent('holo-map:ready'));
    publishState();
  });

  // ジェネレーターの表示高さを、地図本体と同期。
  document.addEventListener('holo-editor:height', event => {
    const height=Number(event.detail?.height);
    if(!Number.isInteger(height)||height<260||height>1100)return;
    config.height=height;
    shell.style.setProperty('--map-height',height+'px');
    map.resize();
  });

  document.addEventListener('holo-map:request-style', (event) => {
    setMapStyle(event.detail?.style);
  });
  map.on('error', (event) => {
    const message = event.error?.message || String(event.error || '');
    console.error('[MapLibre]', message);
    if (!map.isStyleLoaded()) {
      mapErrorMessage = '地図の読み込みエラー: ' + message;
      updateMarkerStatus();
    }
  });
  updateHud();
})().catch((error) => {
  console.error('3D地図の読み込みに失敗しました。', error);
  const status = document.getElementById('map-status');
  if (status) status.textContent = '読み込み失敗: ' + (error?.message || String(error));
});
