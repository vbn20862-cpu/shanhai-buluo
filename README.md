# 山海部落

以臺灣全島為地圖、以原住民族為主題的多人連線部落經營遊戲（橫式手機網頁）。名稱為暫定。

目前完成**階段 1（部落經營）與階段 2（連線與掛機）**。方向、製作計畫與進度請看 [`docs/DESIGN.md`](docs/DESIGN.md)。

## 在電腦上啟動

需要先安裝 [Node.js](https://nodejs.org/)（18 以上）。第一次要先安裝套件：

```bash
npm install
```

啟動遊戲（把「自己取的密碼」換成你要的後台密碼）：

```bash
ADMIN_PASSWORD=自己取的密碼 npm start
```

- 遊戲：用瀏覽器開 http://localhost:3000
- 後台：http://localhost:3000/admin ，輸入上面的密碼
- 不需要後台時，直接 `npm start` 也可以

## 用兩支手機一起玩

1. 電腦和手機連到同一個 Wi-Fi。
2. 在 Mac 的「系統設定 → Wi-Fi → 詳細資訊」找到電腦的 IP 位址（例如 192.168.1.23）。
3. 手機瀏覽器開 `http://那個IP位址:3000`，把手機橫放。

每支手機會各自建立一個部落，在「地圖」分頁可以看到並拜訪對方。進度存在電腦的 `data/world.json`，想從頭來過就先停掉伺服器再刪掉這個檔案。

## 放到網路上給朋友測試（Railway）

遊戲需要一臺一直開著、存檔不會消失的主機。目前的做法是放在 [Railway](https://railway.com)，每月約 5 美元。

1. 用 GitHub 帳號登入 Railway，New Project → Deploy from GitHub repo → 選 `shanhai-buluo`。
2. 服務的 Settings → Scale → Regions 選 Southeast Asia（Singapore）。要在掛硬碟之前選。
3. 服務的 Variables 分頁新增三個變數：

   | 名稱 | 內容 |
   |---|---|
   | `ADMIN_PASSWORD` | 自己取的後台密碼 |
   | `JOIN_CODE` | 自己取的邀請碼，給朋友用 |
   | `DATA_FILE` | `/data/world.json` |

4. 新增一個 Volume 掛到這個服務，Mount path 填 `/data`。
5. 按 Deploy，等它變成成功。
6. 服務的 Settings → Networking → Generate Domain，得到 `https://xxxx.up.railway.app`，這就是給朋友的網址；後台是網址後面加 `/admin`。

之後每次把程式推上 GitHub 的 `main`，Railway 會自動更新，更新時會短暫斷線，存檔會保留。

## 其他指令

```bash
npm test
```

```bash
npm run build:solo
```

第一個是跑規則的自動測試，第二個是把遊戲打包成單一檔案（單機預覽頁用）。
