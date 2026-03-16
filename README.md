# Event Timer / Clock Web UI (Node.js + Express)

這是一個以 Node.js + Express 建立的單頁計時器 / 時鐘網頁介面，**主要用於搭配串列埠（Serial）連線的實體計時器設備**，並額外提供一個「Display View」視窗方便在副螢幕或 OBS 中顯示。整體功能包含：

- 4 位數 `MM:SS` 倒數/正數計時器（Timer 模式）
- 24 小時制 `HH:MM:SS` 即時時鐘（Clock 模式）
- 可調光 DIMMER（0–100%）對應到 Serial `d` 值 (0–255)
- 10 組可儲存/讀取的時間 Presets（含 PRESET 0 固定 00:00）
- Serial Port 連線與斷線控制（輸出 JSON 到串列埠，驅動實體計時器）
- 額外的 Display View 全螢幕顯示（適合拉到副螢幕或 OBS Browser Source）

---

## 環境需求

- Node.js 18+（建議）
- npm
- （選用）能支援 2400 baud 的 Serial 裝置

---

## 安裝與啟動

在專案根目錄（`/Users/rong/Documents/event_timer`）中：

```bash
npm install
node server.js
```

伺服器預設啟動在：

```text
http://localhost:3100
```

### Windows 一鍵啟動

在專案根目錄雙擊 `run.bat`，或在 cmd 執行：

```bat
cd \path\to\event_timer
run.bat
```

這會開啟一個新的 cmd 視窗執行 `node server.js`，再自動用 Chrome（或預設）瀏覽器開啟 `http://localhost:3100`。

---

## 介面說明

整體「主畫面」區塊由上而下大致分為：

1. **Mode / Connection 切換列**
2. **DIMMER 調光列**
3. **主 Timer / Clock 卡片**
4. **Presets 區塊**
5. **Display View 設定列**
6. **版權資訊 Footer**

### 1. 模式切換：TIMER / CLOCK

左上角有一個藍色滑動開關：

- **TIMER 模式（預設）**
  - 主顯示為 `MM:SS`。
  - 計時行為：
    - Start：從當前設定時間倒數到 `00:00` 停住。
    - 在 `00:00` 再按 Start：改為正數計時 `00:01, 00:02, ...`。
  - Serial 輸出中的 `m` / `s` 是「目前計時的分鐘 / 秒」。
- **CLOCK 模式**
  - 主顯示為 24 小時制 `HH:MM`，右側以較小字顯示 `:SS` 秒數。
  - 畫面每秒自動更新，但 **背景計時器仍持續運作**（切回 TIMER 時會接續原本的計數）。
  - Serial 輸出中的 `m` / `s` 改為「系統時間的小時 / 分鐘」。

### 2. 連線狀態：LINK 按鈕

右上角為 `LINK` 按鈕，內含：

- 左邊文字：`OFFLINE` / `ONLINE`
- 右邊紅/綠燈號：
  - 紅色：未連線（OFFLINE）
  - 綠色：已連線（ONLINE）

點擊 `LINK` 會打開 Serial 連線選單：

- 顯示目前系統偵測到的 Serial port 列表（各為一個按鈕）
  - 點選某一個 port 會：
    - 呼叫 `POST /api/serial/connect` 連線
    - 成功後狀態變為 `ONLINE`（綠色）
- 若當前已連線，選單底部會多出一個紅色 `DISCONNECT`，可中斷連線並回到 `OFFLINE`。

### 3. DIMMER 調光列

緊接在頂部列下方：

- 標籤：`DIMMER`
- 滑桿：0–100%（畫面上顯示百分比）
- 數值轉換：
  - UI：0–100%
  - Serial `d` 值：`round(percent / 100 * 255)`，範圍 0–255
- 推送時機：
  - 每次拖動 slider 都會即時推送新 DIMMER 值到 Serial
  - 為避免塞車，實作了 **最小 100ms 間隔** 的節流（throttling）

### 4. 主 Timer / Clock 卡片

包含：

- **主時間顯示**
  - TIMER 模式：`MM:SS`，正常顏色；正數計時時字體為淡紅色。
  - CLOCK 模式：`HH:MM:SS`，藍色字體（與模式滑動開關一致）。
- **控制按鈕**
  - `START`：啟動倒數或正數計時。
  - `PAUSE`：暫停當前計時。
  - `RESET`：重設回目前設定的起始時間（倒數模式）。
- **時間設定區**
  - 左側 MM / 右側 SS，各有獨立的 `+ / -` 按鈕：
    - 分鐘：0–99
    - 秒鐘：0–59，支援借位/進位（例如 05:00 的 `SS -` 變 04:59）。
  - `SET`：
    - 將目前文字框時間套用為新的倒數起始時間。
  - `SAVE TO` + Preset 儲存模式：
    - 按下 `SAVE TO` 後，Presets 區的 PRESET 1–9 會反紅（可被儲存），點選其中一個就會把目前文字框的時間存進對應的 PRESET。

### 5. Presets 區塊

- **PRESET 0**：固定為 `00:00`，不可覆寫。
- **PRESET 1–9**：
  - 點擊：將該預設時間載入到上方的 `MM/SS` 輸入框。
  - 若 `AUTO SET` 開啟，載入後會自動執行 `SET`，直接套用到計時器。

### AUTO SET 開關

位於 `PRESETS` 標題右側：

- 開啟（綠色高亮）：點任一 PRESET1–9 會「載入 + 自動 Set」。
- 關閉：點 PRESET 只會載入文字框，不會自動 Set。

### 6. Display View 設定列

主畫面底部有一條 `DISPLAY COLOR` / `BORDER / SHADOW` 設定列，**用來控制 `/display` 額外顯示視窗的樣式**：

- **DISPLAY COLOR**
  - `WHITE`：白色文字。
  - `LIGHT BLUE`：淺藍色文字。
  - `LIGHT YELLOW`：淺黃色文字。
- **BORDER / SHADOW**
  - 下拉選單：
    - `NO BORDER`：無邊框與陰影。
    - `BLACK BORDER`：黑色描邊，直接畫在字上（使用 `-webkit-text-stroke`），不會出現方形框。
    - `BLACK SHADOW`：黑色光暈陰影，從文字外圍往外擴散。
  - 右側 Slider（0–20）：調整描邊粗細或陰影強度，會即時更新到所有開啟中的 `/display` 視窗。
- **DISPLAY WINDOW 按鈕**
  - 按下後會透過 `window.open("/display", ...)` 開啟（或聚焦）一個額外的 Display View 視窗。
  - 同時會把目前的顯示設定（文字顏色、Border/Shadow 模式與寬度）透過 WebSocket 送到後端，再廣播到所有 `/display` 視窗。

---

## Serial JSON 輸出格式

每次推送到 Serial 的資料格式為一行 JSON（結尾有換行）：

```json
{ "m": <minutes>, "s": <seconds>, "d": <dimmer> }
```

- **Timer 模式**
  - `m`：目前計時的分鐘數（以秒數換算）
  - `s`：目前計時的秒數
- **Clock 模式**
  - `m`：目前小時（0–23）
  - `s`：目前分鐘（0–59）
- **DIMMER**
  - `d`：0–255，由 DIMMER 百分比換算而來

後端程式會在 console 顯示：

```text
[serial] write: { "m": mm, "s": ss, "d": dd }
```

若尚未連線 Serial，則會顯示：

```text
[serial] no port connected, skip write: {"m":..,"s":..,"d":..}
```

> **重點說明**：本專案的核心用途是「網頁 UI + Serial JSON 輸出」來驅動實體計時器。所有時間邏輯與 DIMMER 調光的數值，最終都是為了寫入串列埠裝置。

---

## Display View（/display）說明

### 功能概覽

`/display` 是一個**純顯示用途**的頁面，用來在副螢幕或 OBS Browser Source 中顯示超大的 `XX:XX` 時間：

- 黑底白（或淺藍 / 淺黃）字。
- 只顯示主時間（Timer 模式時的 MM:SS 或 Clock 模式時的 HH:MM），樣式完全由主畫面的 Display 設定列控制。
- 不包含任何按鈕或設定 UI，**不會影響計時邏輯**。

### 開啟方式

- 從主畫面按下底部的 `DISPLAY WINDOW` 按鈕：
  - 會透過 `window.open("/display", "display-window", ...)` 開啟一個新視窗（或聚焦既有視窗）。
  - 主畫面同時會把最新的顯示設定（顏色 / Border / Shadow / 寬度）透過 WebSocket 推送到該視窗。
- 也可以手動在瀏覽器輸入：

```text
http://localhost:3100/display
```

### WebSocket 同步機制

- 後端 `server.js` 使用 `socket.io` 建立 WebSocket 伺服器：
  - `time:update`：主畫面的計時/時鐘每次 render 時會送出 `{ text: "MM:SS" 或 "HH:MM", mode: "timer" | "clock" }`，後端再廣播給所有 client。
  - `display:settings`：主畫面底部的 Display 設定列只要有變更，就會送出 `{ color, effect, width }`，後端同樣廣播給所有 `/display` 視窗。
- `/display` 頁面的 `display.js` 會：
  - 監聽 `time:update`，即時更新畫面上的時間文字。
  - 監聽 `display:settings`，即時更新文字顏色、描邊或陰影強度。
  - 同時也會把這些設定寫進 `localStorage("display-settings")`，方便重新整理後保持一致外觀。

### 背景顏色與 OBS Browser Source 的透明處理

在 `display.html` 中，背景是 **直接寫在 `body` 的 CSS** 上，而不是綁在 `html` 或其他容器：

```html
<style>
  html {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
  }

  body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background-color: #000;
    color: #fff;
    font-family: SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
</style>
```

- 這樣設計的原因是：
  - 在一般瀏覽器視窗中，預設為「黑底白字」，方便直接拉到副螢幕使用。
  - 在 OBS 等串流軟體的 **Browser Source** 中，常會有外部 CSS/JS 把 `body` 的 `background-color` 改成透明或其他顏色。
  - 因為顏色只有寫在 `body` 上，**OBS 的 Browser Source 可以直接覆寫 `body` 的背景為透明**，而不會被其他層級（例如 `html` 或額外 wrapper）擋住。
- 若你在 OBS 中設定 Browser Source 使用此 URL，並套用附加 CSS 將：

```css
body { background-color: transparent !important; }
```

即可讓 Display View 的背景變透明，只留下大字時間與其描邊 / 陰影效果，方便疊加在任何畫面上。

---

## 檔案結構簡述

- `server.js`：Express 伺服器、Serial API（/api/serial/ports, /connect, /time, /disconnect）與 WebSocket 事件（time:update, display:settings）
- `public/index.html`：主網頁結構（Timer/Clock UI + Presets + Display 設定列）
- `public/style.css`：整體版面與樣式（含深色主題、按鈕、Slider、Toggles、Display 設定列等）
- `public/app.js`：前端互動邏輯（Timer / Clock、Presets、AUTO SET、DIMMER、Serial 輸出、Display 設定狀態與 WebSocket 廣播）
- `public/display.html`：Display View 單純顯示頁面（超大 `XX:XX`，黑底白字，可由外部覆寫 `body` 背景）
- `public/display.js`：Display View 的 WebSocket 與樣式同步邏輯（接收 time:update / display:settings 並套用）
- `run.sh`：macOS 一鍵啟動腳本
- `run.bat`：Windows 一鍵啟動腳本

---

