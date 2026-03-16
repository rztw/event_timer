const displayEl = document.getElementById("display-time");
const displayTextEl = document.getElementById("display-text") || displayEl;
const socket = window.io ? window.io() : null;

const COLOR_MAP = {
  white: "#ffffff",
  lightblue: "#bfdbfe",
  lightyellow: "#fef9c3",
};

function readDisplayState() {
  try {
    const raw = window.localStorage.getItem("display-time");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.text !== "string") return null;
    return data;
  } catch {
    return null;
  }
}

function updateFromStorage() {
  const data = readDisplayState();
  if (!data) return;
  displayTextEl.textContent = data.text || "00:00";
}

function readDisplaySettings() {
  try {
    const raw = window.localStorage.getItem("display-settings");
    if (!raw) {
      return {
        color: "white",
        effect: "none",
        width: 4,
      };
    }
    const data = JSON.parse(raw);
    return {
      color: data.color || "white",
      effect: data.effect || "none",
      width: Number.isFinite(data.width)
        ? data.width
        : parseInt(data.width, 10) || 4,
    };
  } catch {
    return {
      color: "white",
      effect: "none",
      width: 4,
    };
  }
}

function writeDisplaySettings(settings) {
  try {
    window.localStorage.setItem("display-settings", JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function applyDisplaySettings(settings) {
  const colorKey = settings.color || "white";
  const colorValue = COLOR_MAP[colorKey] || COLOR_MAP.white;
  displayTextEl.style.color = colorValue;

  const width = Math.max(0, Math.min(20, settings.width || 0));
  if (settings.effect === "border") {
    // 優先使用 -webkit-text-stroke 畫描邊，避免文字轉角斷裂
    if (width <= 0) {
      displayTextEl.style.webkitTextStroke = "0px transparent";
      displayTextEl.style.textShadow = "none";
    } else {
      displayTextEl.style.webkitTextStroke = `${width}px #000`;
      displayTextEl.style.textShadow = "none";
    }
    displayTextEl.style.border = "none";
    displayTextEl.style.boxShadow = "none";
  } else if (settings.effect === "shadow") {
    displayTextEl.style.border = "none";
    displayTextEl.style.webkitTextStroke = "0px transparent";
    // 用 text-shadow 做柔和外光暈，不用 box-shadow 方框
    // 強度加倍
    const blur = width * 4;
    if (width <= 0) {
      displayTextEl.style.textShadow = "none";
      displayTextEl.style.boxShadow = "none";
    } else {
      displayTextEl.style.textShadow = `0 0 ${blur}px rgba(0,0,0,0.9)`;
      displayTextEl.style.boxShadow = "none";
    }
  } else {
    displayTextEl.style.border = "none";
    displayTextEl.style.webkitTextStroke = "0px transparent";
    displayTextEl.style.textShadow = "none";
    displayTextEl.style.boxShadow = "none";
  }
}

// 初始化設定狀態並套用
let currentSettings = readDisplaySettings();
applyDisplaySettings(currentSettings);

// 第一次載入先同步時間（在 WebSocket 還沒連上時，有基本畫面）
updateFromStorage();

// 監聽其它視窗（主控制頁）對 localStorage 的變動（備援）
window.addEventListener("storage", (event) => {
  if (event.key === "display-time") {
    updateFromStorage();
  } else if (event.key === "display-settings") {
    currentSettings = readDisplaySettings();
    applyDisplaySettings(currentSettings);
  }
});

// WebSocket 為主要同步來源
if (socket) {
  socket.on("time:update", (payload) => {
    if (!payload || typeof payload.text !== "string") return;
    displayTextEl.textContent = payload.text || "00:00";
  });

  socket.on("display:settings", (payload) => {
    if (!payload) return;
    currentSettings = {
      color: payload.color || currentSettings.color,
      effect: payload.effect || currentSettings.effect,
      width:
        Number.isFinite(payload.width) || typeof payload.width === "number"
          ? payload.width
          : currentSettings.width,
    };
    writeDisplaySettings(currentSettings);
    applyDisplaySettings(currentSettings);
  });
}

// 以防 storage 事件沒被觸發，定期輪詢一次時間作為備援
setInterval(updateFromStorage, 1000);
