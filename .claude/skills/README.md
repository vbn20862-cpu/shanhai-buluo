# 這個專案裝的 skill

使用者要求裝來做介面用的兩份遊戲介面指南（清單裡「做網頁遊戲」建議的組合）。安裝前已經讀過全文：只有設計原則和範例，沒有要執行的程式。

| skill | 用途 | 來源 |
|---|---|---|
| `game-ui-ux` | 介面的版面、縮放、安全區域、返回／關閉的順序（畫面堆疊）、用事件更新資訊、無障礙的最低標準 | gamedev-skills/awesome-gamedev-agent-skills（Apache 2.0） |
| `game-ui-frontend` | 網頁遊戲的介面：保護遊戲畫面、資訊的層級、手機與電腦都要能用、動畫要節制 | openai/plugins 的 game-studio（MIT） |

用的時候要注意：
- 這兩份是一般原則，**和 `CLAUDE.md`、`docs/DESIGN.md` 衝突時以本專案為準**（例如文化內容、已確認的畫面方向）。
- 本專案是**手機橫式、觸控為主**的網頁遊戲。裡面 Godot、Unity、手把操作、3D 鏡頭的部分不適用；可以用的是：常駐資訊不要蓋住太多畫面、返回鍵一次關一層、安全區域、按鈕夠大、不只靠顏色表示狀態、減少動畫的設定。
- 沒有裝的：game-ui-design（要求手把優先、觸控最後，和本專案相反）；Godot、Unity、Roblox、three.js、Phaser 專用的（用不到）；把圖片切成介面素材的（要另外裝 Python 工具，我們的美術是 SVG，由 `npm run build:art` 處理）。
