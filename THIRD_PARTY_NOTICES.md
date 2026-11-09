# Third-party notices / 外部ライブラリ・地図サービスの権利情報

PSEUDO-HOLOGRAPHIC MAP（Public Version 1.0.0）は、以下の外部ライブラリ・地図サービスを利用します。本ソフトウェアのMITライセンスとは別に、それぞれのライセンスやサービス利用条件が適用されます。

外部のJavaScriptライブラリ、地図タイル、スタイルデータなどは、このZIPへ一括同梱していません。ブラウザ上で必要な外部サービスから読み込みます。

## MapLibre GL JS

- 用途：地図の表示・操作、マーカーの配置、3D建物表示
- バージョン：6.16.0
- ライセンス：BSD 3-Clause License
- 公式サイト：https://maplibre.org/
- ライセンス：https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt

## Three.js

- 用途：標準GLB・独自GLBの読み込み、ホログラム風の3D描画
- バージョン：0.181.0
- ライセンス：MIT License
- 公式サイト：https://threejs.org/
- ライセンス：https://github.com/mrdoob/three.js/blob/master/LICENSE

## OpenFreeMap / OpenFreeMap Styles

- 用途：Dark／Positronの地図スタイル、地図タイル、建物データの配信
- OpenFreeMapプロジェクトのライセンス：MIT License
- スタイルや同梱される素材には、BSD 3-Clause License、CC BY 4.0など個別の条件が適用される場合があります。
- 公式サイト・出典表示：https://openfreemap.org/
- スタイルのライセンス情報：https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md
- OpenFreeMapのライセンス情報：https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md

Positronなど、個々のスタイルには独自のデザイン・著作権条件があります。詳細は提供元の情報をご確認ください。

## OpenMapTiles

- 用途：地図データスキーマとスタイル関連の技術・デザイン
- ライセンス：対象によってBSD 3-Clause License、CC BY 4.0など
- 公式サイト：https://openmaptiles.org/
- ライセンス：https://github.com/openmaptiles/openmaptiles/blob/master/LICENSE.md

## OpenStreetMap

- 用途：地図の元データ
- 著作者表示：© OpenStreetMap contributors
- データライセンス：Open Database License（ODbL）1.0
- 著作権・ライセンス：https://www.openstreetmap.org/copyright

## Nominatim（OpenStreetMap Foundationの公開API）

- 用途：MARKERSの「座標を検索」で、入力した住所から緯度・経度を検索
- サービス：https://nominatim.openstreetmap.org/
- 公式利用ポリシー：https://operations.osmfoundation.org/policies/nominatim/
- 関連する地理データ：OpenStreetMap／ODbL

公開APIにはアクセス量、アプリの識別、帰属表示、利用目的などの条件があります。特に、**サイト・アプリ全体で最大毎秒1リクエスト**という制限は、個々のユーザーごとではありません。公開・配布形態によってはこのAPIを利用できない場合があり、別サービスへの切り替えが必要です。自動補完や大量の住所検索は実装していません。

住所検索の入力値は外部のNominatimサーバーに送信されます。個人情報や機密情報の入力は避けてください。

## 外部配信サービス

MapLibre GL JSはunpkg、Three.jsはjsDelivrから、地図関連データはOpenFreeMapから読み込む構成です。これらのサービスの利用規約や稼働状況にも依存します。

## 地図上の著作者表示

MapLibre GL JSとOpenFreeMapを組み合わせた地図には、通常、地図データとスタイルの出典が表示されます。**地図上の帰属表示・関連リンクは削除したり隠したりしないでください。**

本書は利用する外部コンポーネントの案内です。各ライセンス本文やサービス利用条件の代わりにはなりません。第三者コンポーネントの再配布・改変などを行う場合は、該当するライセンスの条件をご確認ください。
