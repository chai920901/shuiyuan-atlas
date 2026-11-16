// 網站的顏色、預設的時間與天氣。改這個檔案，存檔，再用 GitHub Desktop commit 並 push，網站就會更新。
// 顏色是六位數的色碼（例如 #d81b72）。只要改引號裡面的色碼，其他不要動。
window.ATLAS_STYLE = {
  palette: {
    // 底圖
    paper: '#efe7d2',      // 紙底（空地的顏色）
    slab: '#cdbd9c',       // 底座側邊
    ink: '#4a3b30',        // 墨線、路名
    // 水
    sea: '#f1ecdd',        // 水面的底色
    wave: '#6d8796',       // 青海波的線
    // 綠地
    wood: '#3f6c49',       // 樹林與隆起的山
    lawn: '#d3dfae',       // 草地的底色
    lawnLine: '#4f8e58',   // 草地的條紋
    // 道路
    major: '#c4776b',      // 大馬路
    minor: '#d79c8f',      // 街道
    lane: '#e6c4b5',       // 巷道
    foot: '#f9f3e6',       // 步道
    deck: '#b9655a',       // 高架橋的橋面
    pier: '#d8ccb2',       // 橋墩、橋的側邊
    // 建築
    wall: '#f3e8cb',       // 一般建築
    key2: '#e9b44c',       // 地標建築、一般天橋
    // 水源市場（周圍房子的粉色也是由「杜鵑」這一色調淡而來）
    heroBlue: '#1a44c8',   // 深藍：塔樓、柱子
    heroSky: '#2f8fe6',    // 淺藍：樓身、天橋欄杆
    heroPink: '#d81b72',   // 杜鵑：格子、色塊、人流與步行圈
  },
  time: 15.5,              // 一打開是幾點（0 到 24，15.5 是下午三點半）
  weather: 'sun',          // 一打開的天氣：sun 晴、cloud 多雲、grey 陰、rain 雨
};
