# 山海部落

以臺灣全島為地圖、以原住民族為主題的多人連線部落經營遊戲（橫式手機網頁）。名稱為暫定。

目前完成**階段 1：單人可玩的部落經營**。方向、製作計畫與進度請看 [`docs/DESIGN.md`](docs/DESIGN.md)。

## 在電腦上玩

需要先安裝 [Node.js](https://nodejs.org/)（18 以上）。在專案資料夾執行：

```bash
npm start
```

然後用瀏覽器開 http://localhost:3000 。手機橫放、或把瀏覽器視窗拉寬，畫面最完整。

## 其他指令

```bash
npm test
```

```bash
npm run build:solo
```

第一個是跑規則的自動測試，第二個是把遊戲打包成單一檔案（預覽頁用）。
