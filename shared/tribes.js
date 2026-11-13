/* 山海部落 — 17 族資料與各族預設內容
 * 新增一族：把該族的 playable 設為 true，並補上 preset（建築名稱、物產、族語、文化卡）。
 * 族語與文化內容請務必先查證，並標明語別／地區。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tribes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOURCE_NOTE = '文化內容整理自原住民族委員會、原住民族語言研究發展基金會等公開資料，正式推出前仍需請族人與專家審閱。';

  var LIST = [
    {
      id: 'atayal', zh: '泰雅族', en: 'Atayal', color: '#B5483A', terrain: '北部山區', playable: true,
      area: '北部山區：宜蘭大同、南澳，新北烏來，桃園復興，新竹尖石、五峰，苗栗泰安，臺中和平，南投仁愛',
      intro: '分布在北部與中部山區，以苧麻織布聞名，生活依循祖先留下的規範 gaga。',
      lang: '賽考利克泰雅語', hello: "Lokah su'", thanks: "Mhway su'",
      bonus: { key: 'special', mult: 1.25, text: '織布屋產量 +25%' },
      sp: { zh: '苧麻布', desc: '用苧麻線織成的布' },
      res: { food: '小米', mat: '竹木' },
      look: { roof: '#6B4A32', wall: '#B88A55', trim: '#B5483A', ground: '#55703F', fence: 'bamboo', backdrop: 'mountain' },
      b: {
        center: { zh: '領袖家屋', native: 'mrhuw', note: '部落的領袖叫 mrhuw，「頭目」是日治時期才有的稱呼。遊戲中以領袖的家屋代表部落的中心。' },
        house: { zh: '家屋', native: 'ngasal', note: '家屋（ngasal）主要有兩種：往下挖的半穴居木屋，以及蓋在平地、用竹子和茅草搭成的竹屋，各地做法不同。' },
        farm: { zh: '小米田', native: 'trakis', note: '以山田輪耕的方式種小米（trakis）、地瓜與芋頭，再用狩獵和捕魚補充食物。' },
        mat: { zh: '竹木採集場', note: '竹子與木材是蓋家屋、穀倉和望樓的材料。' },
        special: { zh: '織布屋', native: 'tminun', note: '婦女以苧麻（nuka）為原料織布（tminun），從種麻、刮麻、捻線到織成布都由女性完成。' },
        storage: { zh: '穀倉', native: "khu'", note: "穀倉（khu'）架高在柱子上，柱子裝有防鼠板，用來存放小米等收成。" },
        barracks: { zh: '訓練場', note: '遊戲設定的建築，勇士在這裡練習弓（bhuniq）與矛（soriq）。' },
        tower: { zh: '望樓', note: '用原木搭高的望樓設在部落入口或中央，青年在上面守夜，後來也成為聚會的地方，以宜蘭南澳一帶最常見。' },
        wall: { zh: '竹圍', note: '遊戲設定的防禦設施，用竹子圍繞部落。' }
      },
      cards: [
        { t: 'Gaga：祖先的訓示', x: '泰雅族人遵守祖先的訓示 gaga，並以祖靈祭為最重要的祭儀。' },
        { t: '苧麻織布', x: '泰雅婦女以苧麻（nuka）為原料織布（tminun），從種麻、刮麻、捻線到織成布匹都由女性完成。' },
        { t: "高架穀倉 Khu'", x: '傳統穀倉為高架式，支柱上裝有防鼠板，用來儲存小米等收成。' },
        { t: '兩大群的起源', x: '賽考列克群相傳祖先起源於南投仁愛鄉的瑞岩，澤敖列群則以大霸尖山為起源地。' },
        { t: '換工 Sbayux', x: '農忙時親族之間互相幫忙，稱為 sbayux，主人會準備飯菜招待來幫忙的人。' }
      ]
    },
    {
      id: 'bunun', zh: '布農族', en: 'Bunun', color: '#3E8A62', terrain: '中央山脈', playable: true,
      area: '中央山脈兩側：南投信義、仁愛，花蓮卓溪、萬榮，臺東海端、延平，高雄桃源、那瑪夏',
      intro: '住在中央山脈高處的民族，一年的祭儀圍繞小米進行，並依月亮的圓缺安排日子。',
      lang: '郡群布農語', hello: 'Mihumisang', thanks: 'Uninang',
      bonus: { key: 'food', mult: 1.15, text: '小米田產量 +15%' },
      sp: { zh: '山肉', desc: '獵人帶回、與親族分享的獵物' },
      res: { food: '小米', mat: '木石' },
      look: { roof: '#5B6168', wall: '#8D8F8A', trim: '#3E8A62', ground: '#4E6B45', fence: 'stone', backdrop: 'mountain' },
      b: {
        center: { zh: '主屋', native: 'lumah', note: '布農社會以家（lumah）和氏族為核心，沒有世襲的頭目。遊戲中以主屋代表部落的中心。' },
        house: { zh: '家屋', native: 'lumah', note: '各地建材不同：南投多用石板砌牆，花蓮以木板為主，臺東與高雄是石砌基座加上木牆或竹牆。' },
        farm: { zh: '小米田', native: 'maduh', note: '小米（maduh）是最重要的作物，以山田輪耕的方式種植，也種玉米、地瓜、芋頭與樹豆。' },
        mat: { zh: '木石採集場', note: '木材與石板是蓋家屋的主要材料。' },
        special: { zh: '獵寮', native: 'taluhan', note: 'Taluhan 是山上的工寮。獵人不能獨占獵物，必須與親族分享；出獵前會以夢（taisah）判斷吉凶。' },
        storage: { zh: '小米倉', native: 'patcilasan', note: '傳統的小米倉設在家屋裡面，是家的象徵，外人不能進入。遊戲中為了方便呈現才獨立畫出。' },
        barracks: { zh: '訓練場', note: '遊戲設定的建築，勇士在這裡練習弓箭與長矛。' },
        tower: { zh: '瞭望台', note: '遊戲設定的防禦建築，可以看見遠處的動靜。' },
        wall: { zh: '石牆', note: '遊戲設定的防禦設施，用石塊堆砌、圍繞部落。' }
      },
      cards: [
        { t: '與月亮的約定', x: '傳說祖先射下了其中一個太陽，受傷的太陽變成月亮，並與族人約定依月亮的圓缺舉行祭儀。布農族的歲時祭儀因此隨月相進行。' },
        { t: '以小米為中心的一年', x: '播種祭 Minpinang、除草祭 Minhulau、射耳祭 Malahtangia、進倉祭 Andaza，一年的祭儀都圍繞小米的生長。' },
        { t: '木刻畫曆 Islulusan', x: '1925 年公開的木刻畫曆出自南投信義鄉地利一帶，用圖畫符號記下一年中舉行祭儀的日子。' },
        { t: '五大社群', x: '卓社群 Takitudu、卡社群 Takibakha、丹社群 Takivatan、巒社群 Takbanuaz、郡社群 Isbukun。各社群與各氏族的做法不盡相同。' }
      ]
    },
    {
      id: 'amis', zh: '阿美族', en: 'Amis / Pangcah', color: '#2F78C2', terrain: '東部縱谷與海岸', playable: true,
      area: '花蓮、臺東的縱谷與海岸',
      intro: '人口最多的原住民族，住在東部的縱谷與海岸，擅長捕魚與採集野菜，以年齡階級組織部落。',
      lang: '秀姑巒阿美語', hello: "Nga'ay ho", thanks: 'Aray',
      bonus: { key: 'special', mult: 1.25, text: '漁寮產量 +25%' },
      sp: { zh: '漁獲', desc: '從溪流與海邊捕來、大家分享的魚' },
      res: { food: '小米', mat: '竹木' },
      look: { roof: '#C9A24A', wall: '#B98F5E', trim: '#C8452F', ground: '#6E8F4E', fence: 'bamboo', backdrop: 'coast' },
      b: {
        center: { zh: '聚會所', native: "'adawang", note: "男子年齡階級集合、訓練與議事的地方。各地稱呼不同：北部叫 talo'an，太巴塱叫 soraratan，南部叫 sefi。" },
        house: { zh: '家屋', native: "loma'", note: '茅草屋頂、木柱、竹牆，屋裡有藤編的床。' },
        farm: { zh: '小米田', native: 'hafay', note: '傳統主食是小米（hafay），後來改種水稻（panay）。' },
        mat: { zh: '竹木採集場', note: '竹子、木材、藤與茅草，是蓋房子和編器具的材料。' },
        special: { zh: '漁寮', native: 'foting', note: '用八卦網（tafokod）、魚筌（rakar）在溪流與海邊捕魚（foting），漁獲由大家分享。' },
        storage: { zh: '穀倉', native: "'alili", note: "存放穀物的倉庫，阿美語叫 'alili。" },
        barracks: { zh: '青年訓練場', native: 'kapah', note: '青年（kapah）依年齡編入階級（selal），一起接受訓練、分工合作。' },
        tower: { zh: '瞭望台', note: '遊戲設定的防禦建築，可以看見遠處的動靜。' },
        wall: { zh: '竹圍', note: '遊戲設定的防禦設施，用竹子圍繞部落。' }
      },
      cards: [
        { t: "Pangcah 與 'Amis", x: "花蓮一帶多自稱 Pangcah，臺東一帶多自稱 'Amis。阿美族是人口最多的原住民族。" },
        { t: '年齡階級 Selal', x: '男子依年齡編入階級，在聚會所接受訓練並分擔部落的工作，是部落運作的骨幹。' },
        { t: 'Ilisin', x: '一年中最重要的祭儀，在收成之後感謝祖靈，也進行年齡階級的晉升。日期與規範由各部落自己決定，它是祭儀而不是表演。' },
        { t: '野菜知識', x: '阿美族熟悉各種可以吃的野菜（dateng），採野菜叫 midateng。' },
        { t: '母系傳統', x: '傳統上是母系社會，男子結婚後住進妻子的家。' }
      ]
    },
    {
      id: 'paiwan', zh: '排灣族', en: 'Paiwan', color: '#C9962B', terrain: '南部山區', playable: true,
      area: '屏東山區與臺東南部，中央山脈南段的兩側',
      intro: '住在中央山脈南段兩側，有世襲的頭目制度，北、中排灣以石板屋聞名，小米與芋頭是重要的作物。',
      lang: '排灣語', hello: 'Djavadjavay', thanks: 'Masalu',
      bonus: { key: 'mat', mult: 1.15, text: '石板採集場產量 +15%' },
      sp: { zh: '紅藜', desc: '色彩鮮豔的臺灣原生穀物' },
      res: { food: '小米', mat: '石板' },
      look: { roof: '#4A4E55', wall: '#77736B', trim: '#C9962B', ground: '#5D7443', fence: 'stone', backdrop: 'mountain' },
      b: {
        center: { zh: '頭目家屋', note: '排灣族有世襲的頭目（mamazangiljan）。頭目家屋前有寬廣的前庭與石砌的平臺，是部落議事與聚會的地方。' },
        house: { zh: '石板屋', native: 'umaq', note: '北、中排灣用板岩砌成石板屋；南、東排灣多用木板與茅草，東排灣還會用卵石做牆基。遊戲裡畫的是石板屋。' },
        farm: { zh: '小米田', native: 'vaqu', note: '以山田輪耕的方式種小米（vaqu）、芋頭（vasa）與地瓜。芋頭會烘成芋頭乾保存。' },
        mat: { zh: '石板採集場', note: '板岩是北、中排灣蓋家屋最主要的材料。' },
        special: { zh: '紅藜田', native: 'djulis', note: '紅藜（djulis）是臺灣原生的作物，耐旱、大約四個月就能收成，也是釀小米酒的酒麴原料。' },
        storage: { zh: '穀倉', note: '存放小米與芋頭乾的倉庫。' },
        barracks: { zh: '訓練場', note: '遊戲設定的建築，勇士在這裡練習弓（vetjeljatan）與矛（vuluq）。' },
        tower: { zh: '瞭望台', note: '遊戲設定的防禦建築，可以看見遠處的動靜。' },
        wall: { zh: '石牆', note: '遊戲設定的防禦設施，用石塊堆砌、圍繞部落。' }
      },
      cards: [
        { t: '中央山脈的南段', x: '排灣族分布在中央山脈南段的兩側，北起大武山、南到恆春半島，橫跨屏東與臺東兩縣。' },
        { t: '長嗣繼承 Vusam', x: '排灣族布曹爾群由長嗣（vusam）繼承家屋與家名，不分男女，長女也能成為領袖。' },
        { t: '石板屋與木板屋', x: '北、中排灣以板岩砌成石板屋；南、東排灣多用木板與茅草，東排灣還以卵石作牆基。' },
        { t: '五年祭 Maljeveq', x: '每五年舉行一次，族人以長竹竿刺球，祈求祖靈賜福。' },
        { t: '紅藜 Djulis', x: '紅藜是臺灣原生作物臺灣藜，耐旱、約四個月可收成，也是釀小米酒的酒麴原料。' }
      ]
    },
    { id: 'saisiyat', zh: '賽夏族', en: 'SaySiyat', color: '#D98E3F', terrain: '西北山區', area: '新竹五峰，苗栗南庄、獅潭', intro: '住在新竹與苗栗的山區，每兩年舉行一次 paSta\'ay。' },
    { id: 'kavalan', zh: '噶瑪蘭族', en: 'Kavalan', color: '#4FA7B0', terrain: '蘭陽平原', area: '原居宜蘭平原，今日多在花蓮、臺東海岸', intro: '原居蘭陽平原，後來遷往花東海岸，以香蕉絲織布聞名。2002 年核定。' },
    { id: 'truku', zh: '太魯閣族', en: 'Truku', color: '#8163B5', terrain: '東部峽谷', area: '花蓮秀林、萬榮、卓溪', intro: '住在花蓮的山區與峽谷，重視織布與狩獵。2004 年核定。' },
    { id: 'sakizaya', zh: '撒奇萊雅族', en: 'Sakizaya', color: '#E6C04A', terrain: '奇萊平原', area: '花蓮奇萊平原', intro: '世居花蓮奇萊平原，每年舉行火神祭 Palamal。2007 年核定。' },
    { id: 'seediq', zh: '賽德克族', en: 'Seediq', color: '#C9628F', terrain: '中部山區', area: '南投仁愛', intro: '以南投仁愛鄉為主要居住地，織布技藝精湛。2008 年核定。' },
    { id: 'thao', zh: '邵族', en: 'Thao', color: '#59A6DC', terrain: '湖畔', area: '南投日月潭', intro: '住在日月潭畔，以杵音聞名。2001 年核定。' },
    { id: 'tsou', zh: '鄒族', en: 'Tsou', color: '#9A7645', terrain: '阿里山', area: '嘉義阿里山', intro: '住在阿里山一帶，男子會所 kuba 是部落的中心。' },
    { id: 'kanakanavu', zh: '卡那卡那富族', en: 'Kanakanavu', color: '#A9BC4E', terrain: '楠梓仙溪', area: '高雄那瑪夏', intro: '住在高雄那瑪夏，有米貢祭與河祭。2014 年核定。' },
    { id: 'hlaalua', zh: '拉阿魯哇族', en: "Hla'alua", color: '#D6805F', terrain: '荖濃溪', area: '高雄桃源、那瑪夏', intro: '住在高雄桃源與那瑪夏，舉行聖貝祭 Miatungusu。2014 年核定。' },
    { id: 'siraya', zh: '西拉雅族', en: 'Siraya', color: '#8FA3B8', terrain: '嘉南平原', area: '臺南一帶', intro: '世居臺南一帶的平原與淺山。2026 年核定為第 17 個原住民族。' },
    { id: 'rukai', zh: '魯凱族', en: 'Rukai', color: '#A4559A', terrain: '南部山區', area: '屏東霧台、高雄茂林、臺東東興', intro: '住在南部山區，以石板屋聞名，百合花是榮耀的象徵。' },
    { id: 'pinuyumayan', zh: '卑南族', en: 'Pinuyumayan', color: '#5FAE70', terrain: '臺東平原', area: '臺東平原', intro: '住在臺東平原，以嚴格的會所訓練聞名。' },
    { id: 'tao', zh: '雅美族（達悟族）', en: 'Yami / Tao', color: '#2BB3AC', terrain: '海島', area: '蘭嶼', intro: '住在蘭嶼的海洋民族，以拼板舟與飛魚文化聞名。' }
  ];

  var BY = {};
  LIST.forEach(function (t) { BY[t.id] = t; });

  return {
    LIST: LIST, BY: BY, SOURCE_NOTE: SOURCE_NOTE,
    get: function (id) { return BY[id]; },
    playable: function () { return LIST.filter(function (t) { return t.playable; }); }
  };
});
