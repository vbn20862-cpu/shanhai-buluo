# 山海部落 美術素材（第一包：四族建築、圖示、紋樣；第二包：人物、樹木、戰場、新建築、圖示、標誌）

## 建築 {atayal,bunun,amis,paiwan}-*.svg
- 畫布統一 viewBox="-80 -140 160 180"，原點 (0,0) 是佔地中心，建築往上長。
- 佔地 2.4×2.1 格（菱形寬 126、高 63）；等角比例：右下一格 (+28,+14)、左下一格 (−28,+14)。
- 圖層：#ground 地面、#shadow 影子、#body 本體、#deco 裝飾（可開關、之後可替換）。
- 可替換變數（寫在 svg 根元素上）：--roof 屋頂、--wall 牆、--deco 裝飾、--ground 地面。明暗（暖光冷影，共四階）用 CSS color-mix 從基色算出，需以內嵌 SVG 使用才能從外部改變數；用 <img> 載入時會用預設色。
- 關掉裝飾：在 svg 或外層加 class="deco-off"，或直接隱藏 #deco。
- amis-wall.svg 是沿 x 軸的一段竹圍；另一方向用 transform="scale(-1,1)"。
- data-height 為建築高度（像素）。

## 場景 {族群}-scene.svg
- 1688×780（主尺寸 844×390 的兩倍），示意用的完整構圖，色碼已寫死。

## 公用幾何紋 patterns/pattern-*.svg
- 10 種紋樣帶（96×24，4 個單位，可橫向拼接），紋樣色用 --deco，底色米白 #EDE3C8。
- 公用：stripes 平行條紋、thickthin 粗細條紋、check 格紋、dots 圓點、weave 壓一挑一、twill 斜紋編、rope 繩紋、blocks 長短方塊。
- 待確認（先不使用）：diamond 菱形、zigzag 連續三角。
- 四族配法（主紋／副紋）：泰雅 weave／stripes、布農 check／thickthin、阿美 blocks／thickthin、排灣 rope／dots。這是遊戲上的區分，不代表該族的傳統紋樣。
- 建築上的紋樣都在 #deco 圖層，可整層關閉或替換。

## 圖示 icons/icon-*.svg
- 24 格、currentColor，顏色由介面決定。

## 阿美族說明
- 顏色與材質：代表色 #2F78C2 只用在裝飾條紋、旗子、人物頭帶和腰帶。厚茅草屋頂 #D6A44A（鋸齒簷口），雙色竹牆 #C2B46C，柱與架子木色 #7A5534（接點綁繩），地面淺沙色 #DCC894。明暗為暖光冷影。地景是海岸山脈、沙灘、礁岩、溪，植被用檳榔、林投、竹林，生活點景有撒網、竹筏、晾網、晾小米、野菜園。
- 待查證：聚會所屋頂形式、柱數與高度；家屋牆體比例與門的位置；穀倉柱腳是否加防鼠板、梯子形式；漁寮曬魚架、魚筌、晾網形式；巴拉告竹筒與枝條擺放方式；場景中的竹筏、撒網、背簍。訓練場、瞭望台為四族共用的通用造型。

## 泰雅族說明
- 顏色與材質：代表色 #B5483A。茅草屋頂 #C8A35A，竹牆 #A9A35C，領袖家屋原木牆 #8E6644，地面 #BFA97F。家屋與領袖家屋是半穴居，屋身半埋在土堤裡。地景是北部山林溪谷，竹林多、溪邊大石頭，望樓約 130 高。
- 紋樣：主紋壓一挑一、副紋平行條紋；織布屋晾的布只用一般條紋。
- 待查證：領袖家屋的屋身形式與半穴居深度；家屋半穴居的深度、門的位置；織布屋形式與晾布方式；穀倉防鼠板形狀；望樓的柱數、走道與頂上小屋形式。

## 布農族說明
- 顏色與材質：代表色 #3E8A62。石板牆 #868B8E，石板頂 #646A70，地面 #A89E86。屋身寬而低，屋前鋪石板地。地景是中央山脈高處：針葉林、山腰的雲、石砌擋土牆。
- 紋樣：主紋格紋、副紋粗細條紋。
- 待查證：主屋、家屋、小米倉的屋頂材質與坡度（目前畫石板頂）；獵寮與肉乾架形式；石板豬圈的高度與頂的位置。

## 排灣族說明
- 顏色與材質：代表色 #C9962B。板岩頂 #53575A，板岩牆 #7A7C78，地面 #A3998A。屋頂畫成後高前低的單坡石板頂，屋前有石砌平臺；頭目家屋前的立石為素面。地景是南部山林：闊葉樹、芭蕉、檳榔，石板路與石牆。
- 紋樣：主紋繩紋、副紋圓點。
- 待查證：石板屋屋頂坡向、門窗位置；頭目家屋前庭平臺與立石的位置比例；穀倉形式（目前為簡化造型）；芋頭窯大小、木架與竹架的搭法。

訓練場、瞭望台為四族共用的通用造型；小米田四族共用造型、換旗子紋樣。

---

## 第二包（山林亂戰、人物、新建築、升級要素）

畫法、配色、四階明暗與第一包相同。基色寫成 CSS 變數（寫在 svg 根元素的 style 裡），明暗用 f-（填色）／s-（線條）開頭的 class 搭配 color-mix 算出：
-l 混暖白 #FFF1CF 22%、-ll 混暖白 45%、-d 混冷藍灰 #26304A 30%、-dd 混深藍灰 #1C2234 52%。每個檔案只帶自己用到的 class。
要從外部換顏色，請把 SVG 內嵌進頁面後改變數；用 <img> 載入時會顯示預設色。

族群代號：atayal 泰雅、bunun 布農、amis 阿美、paiwan 排灣。

### people/ 人物與兵種（四族 × 13 個）
- 畫布：viewBox="-30 -70 60 80"；英雄 viewBox="-50 -70 100 80"。原點 (0,0)＝腳底中央，面向右。頭頂約 y=-34，武器最高約 y=-60。
- 圖層：#shadow 腳下影子、#body 身體、#band 頭帶與腰帶（fill="currentColor"，由外層 color 決定陣營色）、#weapon 矛、弓、箭、盾、扛的東西。
- 姿勢：族群-warrior-stand/run/attack、族群-archer-stand/run/attack、族群-unique-stand/run/attack、族群-villager-a-stand、族群-villager-a-walk、族群-villager-b-stand、族群-hero-stand。
- 可替換變數：--main 上衣（族群代表色：泰雅 #B5483A、布農 #3E8A62、阿美 #2F78C2、排灣 #C9962B）、--cloth 下身與帽子（深麻色 #8C7356）、--wrap 披布（阿美麻色 #CDB98E、泰雅深褐 #6E5440）、--skin #B9845A、--hair #2B211B、--wood #7A5534、--tip 矛頭與弓弦 #C9C4B4。
- 獨特兵種：泰雅「山林獵手」深褐披布、短矛低持；布農「獵人」大弓、背素面箭袋（attack 為拉滿弓）；阿美「部落青年」麻色披布、雙手持矛；排灣「石牆守衛」矛＋素面圓盾（盾在 #weapon 層）。
- 族人 b：泰雅扛竹竿、布農扛柴、阿美扛掘棒、排灣提芋頭籃（都是一般造型）。
- 英雄：泰雅「射日的勇士們」三人拿弓；布農「射日的父子」一大一小拿弓；阿美「齊心的青年們」三人手牽手、不拿武器；排灣「紅眼睛的巴里」一人，寬簷帽壓低遮住眼睛，不畫眼睛、不拿武器。
- 大小：一般 2.2–3.1 KB；英雄 2.7–4.7 KB（多人同一個檔）。

### nature/ 樹木與地景（四族 × 7 個）
- 畫布：viewBox="-40 -100 80 110"；tree-big 為 viewBox="-70 -170 140 180"。原點＝底部中央；圖層 #shadow、#body。每個 5 到 9 個圖形（含影子），2 KB 以內。
- 泰雅：tree-a 竹叢、tree-b 闊葉樹、tree-c 闊葉樹（高瘦）、tree-big 大樹、bush、rock 溪石、log 倒木。
- 布農：tree-a 針葉樹、tree-b 針葉樹（高瘦）、tree-c 高山松、tree-big 大針葉樹、bush 高山灌叢、rock 岩塊、log。
- 阿美：tree-a 檳榔、tree-b 林投、tree-c 竹叢、tree-big 大樹、bush、rock 礁石、log。
- 排灣：tree-a 闊葉樹、tree-b 芭蕉、tree-c 檳榔、tree-big 大樹、bush、rock 板岩、log。
- 可替換變數：--leaf --trunk（竹叢另有 --stem、林投 --fruit、倒木 --moss、石頭 --stone）。

### battlefield/ 戰場背景（四族各一張）
- 畫布 viewBox="0 0 1000 420"，28–34 KB，沒有 <use>／<symbol>。
- 圖層順序：#far 遠景、#ground 林間空地、#treeline 後排樹牆（畫在 ground 之上，下緣才不會被切平）、#props 地上的小東西（12 像素以內）、#light 斜光（半透明多邊形）、#front 前景（請疊在人物上面；中段 x 300–700 高度不超過 30）。
- 遠景：阿美是太平洋、沙灘、海岸山脈；泰雅、排灣是三層遠山；布農是三層高山加山腰的雲。右側 x 860–1000 為平整空地（布農、排灣鋪石板）。
- 可替換變數：--sky --sea --sand --mount --tree --trunk --ground --dirt --fall --stone --light --front（布農另有 --cloud --slab，泰雅 --bamboo，排灣 --slab --banana）。

### fx/ 小特效（四族共用）
- 畫布 viewBox="-16 -16 32 32"，原點在中心。fx-dust 塵土、fx-leaf-a 綠葉、fx-leaf-b 枯葉、fx-clash 交鋒閃光、fx-arrow 飛行中的箭（朝右）。

### buildings/ 新增建築、升級外觀、圍籬轉角與大門（四族）
- 畫布 viewBox="-80 -140 160 180"，原點是佔地中心，佔地菱形寬 126、高 63；根元素有 data-height。
- 圖層：#ground #shadow #body #deco（#deco 有 class="layer-deco"，可整層關閉）。可替換變數：--roof --wall --deco --ground。
- 新增 9 種：族群-archery 靶場、heal 療養屋、craft 技藝屋、hut 工寮、market 交易亭、plaza 聚會廣場、guest 迎賓亭、taro 芋頭田、water 引水道。
- 升級：族群-center-2、center-3（11 級、21 級換圖）、house-2、wall-2、wall-3、tower-2。佔地不變；只表現規模、材料和設施。
- 圍籬：族群-wall-corner 轉角柱、族群-gate 大門（沿 x 軸，長 2.4 格，和第一包 族群-wall.svg 一樣）。

### site/ 建地（四族共用）
- 畫布同建築。site-empty 開墾好的空地、site-building 施工中、site-upgrade 升級中（只有鷹架和梯子，沒有地面，疊在原本建築上）、site-clearing 拓荒中。
- 可替換變數：--ground --wood --roof --wall。

### icons/ 圖示（30 個）
- 24 格、currentColor。內部的鏤空用 <mask> 做，換任何底色都不會露出別的顏色。
- 特產：icon-cloth、icon-meat、icon-djulis；一般：icon-specialty、icon-alliance、icon-map、icon-march、icon-retreat、icon-loot；
  升級：icon-power、icon-level、icon-build、icon-speed、icon-help、icon-heal、icon-craft、icon-tier-1/2/3；
  技藝：craft-farming、craft-gather、craft-weave、craft-build、craft-store、craft-trade、craft-hunt、craft-archery、craft-spear、craft-guard、craft-march、craft-care。

### logo/
- logo-wordmark.svg：高 64、寬 288，深色底上用。字形為霞鶩文楷 TC Bold 轉成的路徑，不需載入字型。
- app-icon.svg：512×512，山、海、一株垂穗的小米。

### mockup/
- 族群-mockup.svg：四張亂戰示意圖，只用來看感覺，不需要接進遊戲。

### 第一包圍籬的長度
族群-wall.svg 沿 x 軸從 -1.2 到 1.2，在地面上是 2.4 格長（螢幕上橫向 67.2 像素、斜向 33.6 像素），厚約 0.36 格。第二包的 gate、wall-2、wall-3 長度相同。

### 待查證
共同：療養屋的藥草束與容器、技藝屋的織布架、交易亭的背架、工寮的鋤頭與斧頭、引水道的竹管與木叉，都是一般造型。升級外觀的附屬小屋、前廊、前庭、素色旗竿是遊戲設計，不代表身分。樹木都是一般植物。
- 阿美：部落青年的披布（遊戲上和勇士區分的設計，不代表年齡階層服裝）；背簍與掘棒；齊心的青年們的站法與高矮比例。
- 泰雅：山林獵手的披布顏色與短矛持法；扛竹竿的方式；射日的勇士們的人數與站法；大門上方的小段茅草頂。
- 布農：獵人的箭袋形式與大弓長度；扛柴的方式；射日的父子的高矮比例；石板屋頂材質與坡度延續第一包的待查證。
- 排灣：石牆守衛圓盾的大小與持法；紅眼睛的巴里帽子的形式（目前為壓低的寬簷帽）；提芋頭籃的方式；單坡石板屋頂延續第一包的待查證。
