// 場域包：水源市場周邊（公館）。純地圖版本，沒有 AR、沒有血量。
// 地形與建築在 atlas.js（由 tools/build-atlas.py 產生）；這裡只放圖名、地標與要顯示的路名。
// 公開網站的顏色、時間、天氣在 style.js。

window.ATLAS_SITE = {
  id: 'shuiyuan',
  name: { zh: '水源市場', en: 'Shuiyuan Market' },
  sub: { zh: '周邊地圖', en: 'Neighbourhood Map' },
  place: { zh: '臺北市中正區　公館', en: 'Gongguan, Taipei' },

  // 地標：用引線標在地圖上。mark: 'main' 是主體（水源市場），mark: true 把所在的建築塗成黃色。
  // crowd：人流分析裡這個點會聚集多少人（相對值，是推估不是實測）。
  notes: [
    { zh: '水源市場', en: 'Shuiyuan Market', lat: 25.01353, lng: 121.53506, mark: 'main', crowd: 1.2 },
    { zh: '公館站', en: 'MRT Gongguan', lat: 25.014437, lng: 121.53442, crowd: 1 },   // 一號出口旁的人行道上
    { zh: '新店溪', en: 'Xindian River', lat: 25.00965, lng: 121.53010 },
    { zh: '寶藏巖', en: 'Treasure Hill', lat: 25.01055, lng: 121.53330, mark: true, crowd: 0.5 },
    { zh: '自來水園區', en: 'Museum of Drinking Water', lat: 25.01256, lng: 121.53020, mark: true, crowd: 0.35 },
    { zh: '蟾蜍山', en: 'Chanchu Hill', lat: 25.00900, lng: 121.53800 },
    { zh: '臺灣大學', en: 'National Taiwan University', lat: 25.01560, lng: 121.53760, crowd: 0.5 },
  ],

  // 水源市場各樓層（由下往上）。from / to 是這一層的地板與天花板高度（公尺），天橋接在第二層的地板高度。
  // kind 決定切開後裡面畫什麼：market 是攤位，office 是隔間，theatre 是舞台與座位。
  // name 和 text 可以直接改。目前只有一、二樓和十樓查得到資料，三到九樓的單位待補。
  floors: [
    { id: '1F', from: 0, to: 5, kind: 'market', name: '水源市場　一樓', text: '小吃與餐飲、蔬果、南北雜貨。手扶梯從這裡上二樓。' },
    { id: '2F', from: 5, to: 9.5, kind: 'market', name: '水源市場　二樓', text: '肉品、海鮮，還有縫補、生活百貨的攤位。跨過羅斯福路的天橋從這一層接進來。' },
    { id: '3F', from: 9.5, to: 13, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '4F', from: 13, to: 16.5, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '5F', from: 16.5, to: 20, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '6F', from: 20, to: 23.5, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '7F', from: 23.5, to: 27, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '8F', from: 27, to: 30.5, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '9F', from: 30.5, to: 34, kind: 'office', name: '辦公樓層', text: '公家機關的辦公空間（單位待補）。' },
    { id: '10F', from: 34, to: 40, kind: 'theatre', name: '水源劇場', text: '大約五百席的表演場地，前身是兵役單位的禮堂。' },
  ],

  // 不要畫出來的建築（用 OpenStreetMap 上的名稱）。公館站是地下車站，地圖資料把它的範圍當成一棟房子，會蓋在羅斯福路上
  hide: ['公館站'],
  roofText: '機房、水塔、太陽能板。',

  // 資料來源：顯示在頁面右下角的「資料來源」裡。url 可以不寫。
  sources: [
    { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright', note: '建築、道路、橋、水域與綠地的圖資（ODbL 授權）。建築高度多由樓層數換算，缺資料的是估計值。' },
    { label: '維基百科：Wellspring Theater', url: 'https://en.wikipedia.org/wiki/Wellspring_Theater', note: '水源劇場位於十樓、大樓沿革。' },
    { label: '關鍵評論網：水源劇場專訪', url: 'https://www.thenewslens.com/article/52689', note: '劇場約五百席，前身為兵役單位禮堂，與市場、公家機關同棟。' },
    { label: 'etnet：水源市場介紹', url: 'https://www.etnet.com.hk/www/tc/health/101920', note: '一、二樓市場的攤位類型。' },
    { label: '本站推估', note: '人流、車流是依路網與道路等級推估的示意，不是實測。山的高度、各樓層的高度與室內配置為示意。三到九樓的使用單位待補。' },
  ],

  // 要寫在路面上的路名
  roads: ['羅斯福路四段', '汀州路三段', '基隆路四段', '思源街', '福和橋', '永福橋', '舟山路'],
};
