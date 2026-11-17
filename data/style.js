// 網站的顏色與天氣。
//
// 怎麼私下修改：
//   1. 在 Finder 裡對這個專案的 index.html 按兩下，用瀏覽器打開（這樣開只有你自己看得到）。
//   2. 右上角的「時間・天氣」會變成「編輯」，裡面除了時間和天氣，還多了調顏色和「Render 存成 PNG」。
//      掃 QR code 進網站的人只看得到時間和天氣，沒有調色和 Render。
//   3. 顏色調好後，按「複製 style.js 的內容」，把這個檔案的內容整個換成複製到的文字，存檔。
//   4. 用 GitHub Desktop commit 並 push，網站就會換成新的顏色。
//
// 也可以直接改下面引號裡的色碼（六位數，例如 #d81b72）。時間不用設定，網站會跟著看的人當下的時刻走。
window.ATLAS_STYLE = {
  palette: {
    // 底圖
    paper: '#fbdfdf',      // 紙底（空地的顏色）
    slab: '#cdbd9c',       // 底座側邊
    ink: '#a45c28',        // 墨線、路名
    // 水
    sea: '#cfedf7',        // 水面的底色
    wave: '#39799d',       // 青海波的線
    // 綠地
    hill: '#599a4c',       // 山的底色
    wood: '#e7ffe0',       // 山的圖案線條
    lawn: '#c7d3a1',       // 草地的底色
    lawnLine: '#56b364',   // 草地的條紋
    // 道路
    major: '#ce7b6f',      // 大馬路
    minor: '#e9ad9f',      // 街道
    lane: '#e6c4b5',       // 巷道
    foot: '#f9d890',       // 步道
    deck: '#c86c5f',       // 高架橋的橋面
    pier: '#d8ccb2',       // 橋墩、橋的側邊
    busLane: '#38c6b8',    // 羅斯福路中間的公車專用道
    zebra: '#fffdf6',      // 斑馬線（行人穿越道）
    // 建築
    wall: '#ffe0e0',       // 一般建築
    tint: '#ffe0e0',       // 市場周邊的房子（會自動調淡，越靠近市場越濃）。只影響周邊房子，不會動到市場主體
    key2: '#ffb92e',       // 地標建築、一般天橋
    // 水源市場主體（只有主體用這三色）
    heroBlue: '#1a44c8',   // 深藍：塔樓、柱子
    heroSky: '#2f8fe6',    // 淺藍：樓身、天橋欄杆
    heroPink: '#ec3cb4',   // 杜鵑：格子、色塊、人流與步行圈
  },
  treeMix: 'random',       // 樹種怎麼分布：random 每棵隨機散落、zone 一片一種（同一座山、同一條路的行道樹同一種）
  people: 'crayon',        // 人物的畫法：crayon 蠟筆插畫、water 水彩剪影
  trees: [12, 13, 14, 15, 16, 17],   // 地圖上用圖鑑裡的哪幾種樹。0–11 是水彩樹（水滴、同心圓、葉片、橫紋、圓葉、針葉、層疊、松、藍水滴、枯枝、秋色、淡黃），12–17 是最早的六色點描水滴
  hillPattern: 'loops',     // 山的圖案：wave 波紋、paver 斜格、loops 草圈、stripes 橫條
  weather: 'sun',          // 天氣：sun 晴、cloud 多雲、grey 陰、rain 雨
};
