const timeDisplay = document.getElementById("time-display");
const startBtn = document.getElementById("start-btn");
const pauseBtn = document.getElementById("pause-btn");
const resetBtn = document.getElementById("reset-btn");
const minutesInput = document.getElementById("minutes-input");
const secondsInput = document.getElementById("seconds-input");
const setBtn = document.getElementById("set-btn");
const saveBtn = document.getElementById("save-btn");
const presetButtons = document.querySelectorAll(".preset-btn");
const minutesUpBtn = document.getElementById("minutes-up");
const minutesDownBtn = document.getElementById("minutes-down");
const secondsUpBtn = document.getElementById("seconds-up");
const secondsDownBtn = document.getElementById("seconds-down");
const connectionBtn = document.getElementById("connection-btn");
const connectionMenu = document.getElementById("connection-menu");
const autoSetToggle = document.getElementById("auto-set-toggle");
const connectionLabel = document.querySelector(".connection-label");
const dimmerSlider = document.getElementById("dimmer-slider");
const dimmerValueEl = document.getElementById("dimmer-value");
const modeToggle = document.getElementById("mode-toggle");
const clockSecondsEl = document.getElementById("clock-seconds");

let initialCountdownSeconds = 60;
let currentSeconds = initialCountdownSeconds;
let mode = "countdown"; // "countdown" | "countup"
let isRunning = false;
let timerId = null;
const presets = new Array(10).fill(0);
presets[0] = 0;
let isSavingPreset = false;
let serialConnected = false;
let autoSetEnabled = true;
let dimmerValue = 255;
let lastDimmerPushAt = 0;
let dimmerPushTimeout = null;
let displayMode = "timer"; // "timer" | "clock"
let clockIntervalId = null;

async function loadPresetsFromServer() {
  try {
    const res = await fetch("/api/presets");
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !Array.isArray(data.presets)) return;
    // 從伺服器拿到的是 9 個值（Preset1~9），映射到本地 presets[1..9]
    data.presets.forEach((v, idx) => {
      const targetIndex = idx + 1; // 1~9
      if (targetIndex < presets.length) {
        presets[targetIndex] = Number.isFinite(v) ? v : parseInt(v, 10) || 0;
      }
    });
    // Preset0 永遠保持 0，不存到檔案
    presets[0] = 0;
  } catch (err) {
    console.error("Failed to load presets from server", err);
  }
}

async function savePresetsToServer() {
  try {
    await fetch("/api/presets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // 只把 Preset1~9 存到檔案中
      body: JSON.stringify({ presets: presets.slice(1) }),
    });
  } catch (err) {
    console.error("Failed to save presets to server", err);
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return `${mm}:${ss}`;
}

function render() {
  const safeSeconds = Math.abs(currentSeconds);
  let outMinutes;
  let outSeconds;

  if (displayMode === "clock") {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    outMinutes = hours;
    outSeconds = minutes;
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    timeDisplay.innerHTML = `${hh}:${mm}<span class="clock-seconds-inline">:${ss}</span>`;
    timeDisplay.classList.remove("countup");
    timeDisplay.classList.add("clock-mode");
  } else {
    timeDisplay.textContent = formatTime(safeSeconds);
    if (mode === "countup") {
      timeDisplay.classList.add("countup");
    } else {
      timeDisplay.classList.remove("countup");
    }
    timeDisplay.classList.remove("clock-mode");
    outMinutes = Math.floor(safeSeconds / 60);
    outSeconds = safeSeconds % 60;
  }

  if (serialConnected) {
    fetch("/api/serial/time", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ m: outMinutes, s: outSeconds, d: dimmerValue }),
    }).catch((err) => {
      console.error("Failed to send serial time", err);
    });
  }
}

function syncConnectionUI() {
  if (connectionLabel) {
    connectionLabel.textContent = serialConnected ? "ONLINE" : "OFFLINE";
  }
}

function syncModeUI() {
  if (!modeToggle) return;
  const modeRoot = modeToggle.closest(".mode-toggle");
  const modeLeft = modeRoot?.querySelector(".mode-option-left");
  const modeRight = modeRoot?.querySelector(".mode-option-right");
  displayMode = modeToggle.checked ? "clock" : "timer";
  if (modeRoot) {
    if (displayMode === "clock") {
      modeRoot.classList.add("mode-clock-on");
    } else {
      modeRoot.classList.remove("mode-clock-on");
    }
  }

  if (modeLeft && modeRight) {
    if (displayMode === "clock") {
      modeLeft.classList.remove("mode-option-left-active");
      modeRight.classList.add("mode-option-right-active");
    } else {
      modeRight.classList.remove("mode-option-right-active");
      modeLeft.classList.add("mode-option-left-active");
    }
  }

  if (displayMode === "clock") {
    if (!clockIntervalId) {
      clockIntervalId = setInterval(() => {
        render();
      }, 1000);
    }
  } else if (clockIntervalId) {
    clearInterval(clockIntervalId);
    clockIntervalId = null;
  }

  render();
}

function readInitialFromInput() {
  let minutes = parseInt((minutesInput.value || "").trim(), 10);
  let seconds = parseInt((secondsInput.value || "").trim(), 10);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) {
    minutes = Number.isNaN(minutes) ? 0 : minutes;
    seconds = Number.isNaN(seconds) ? 0 : seconds;
  }
  minutes = Math.min(Math.max(minutes, 0), 99);
  seconds = Math.min(Math.max(seconds, 0), 59);
  return minutes * 60 + seconds;
}

function syncInputs(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  minutesInput.value = String(mins).padStart(2, "0");
  secondsInput.value = String(secs).padStart(2, "0");
}

function renderPresets() {
  presetButtons.forEach((btn) => {
    const index = Number(btn.dataset.preset);
    const label = index === 0 ? "PRESET 0" : `PRESET ${index}`;
    const time = formatTime(presets[index] || 0);
    btn.innerHTML = `<span>${label}</span><span>${time}</span>`;
  });
}

function applyInitial(seconds) {
  initialCountdownSeconds = seconds;
  currentSeconds = seconds;
  mode = "countdown";
  isRunning = false;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  syncInputs(seconds);
  render();
}

function applyFromInput() {
  const next = readInitialFromInput() || 0;
  initialCountdownSeconds = next;

  if (isRunning) {
    currentSeconds = next;
    syncInputs(next);
    render();
  } else {
    applyInitial(next);
  }
}

function stepField(inputEl, delta, min, max) {
  let value = parseInt((inputEl.value || "").trim(), 10);
  if (Number.isNaN(value)) {
    value = 0;
  }
  value += delta;
  value = Math.min(Math.max(value, min), max);
  inputEl.value = String(value).padStart(2, "0");
}

function stepSeconds(delta) {
  let secVal = parseInt((secondsInput.value || "").trim(), 10);
  let minVal = parseInt((minutesInput.value || "").trim(), 10);

  if (Number.isNaN(secVal)) secVal = 0;
  if (Number.isNaN(minVal)) minVal = 0;

  if (delta === -1) {
    if (secVal > 0) {
      secVal -= 1;
    } else if (minVal > 0) {
      minVal -= 1;
      secVal = 59;
    }
  } else if (delta === 1) {
    if (secVal < 59) {
      secVal += 1;
    } else if (minVal < 99) {
      minVal += 1;
      secVal = 0;
    }
  }

  minutesInput.value = String(Math.min(Math.max(minVal, 0), 99)).padStart(
    2,
    "0"
  );
  secondsInput.value = String(Math.min(Math.max(secVal, 0), 59)).padStart(
    2,
    "0"
  );
}

function toggleSavingMode() {
  isSavingPreset = !isSavingPreset;
  presetButtons.forEach((btn) => {
    const idx = Number(btn.dataset.preset);
    if (idx === 0) return;
    if (isSavingPreset) {
      btn.classList.add("save-target");
    } else {
      btn.classList.remove("save-target");
    }
  });
}

async function connectSerialPort(portPath) {
  const connectRes = await fetch("/api/serial/connect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: portPath }),
  });

  if (!connectRes.ok) {
    const errBody = await connectRes.json().catch(() => ({}));
    window.alert(
      `Failed to connect serial port.\n${errBody.error || "Unknown error"}`
    );
    serialConnected = false;
    connectionBtn.classList.remove("connected");
    syncConnectionUI();
    return;
  }

  serialConnected = true;
  connectionBtn.classList.add("connected");
  window.alert(`Connected to serial port:\n${portPath}`);
  syncConnectionUI();
}

async function handleConnectionClick() {
  try {
    if (connectionMenu.classList.contains("open")) {
      connectionMenu.classList.remove("open");
      connectionMenu.innerHTML = "";
      return;
    }

    connectionMenu.innerHTML = "";

    const res = await fetch("/api/serial/ports");
    const ports = await res.json();
    if (Array.isArray(ports) && ports.length > 0) {
      ports.forEach((path) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "connection-menu-item";
        btn.textContent = path;
        btn.addEventListener("click", async () => {
          connectionMenu.classList.remove("open");
          connectionMenu.innerHTML = "";
          await connectSerialPort(path);
        });
        connectionMenu.appendChild(btn);
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "connection-menu-item";
      empty.textContent = "No ports available";
      empty.style.opacity = "0.7";
      connectionMenu.appendChild(empty);
    }

    if (serialConnected) {
      const disconnectBtn = document.createElement("button");
      disconnectBtn.type = "button";
      disconnectBtn.className = "connection-menu-item disconnect";
      disconnectBtn.textContent = "DISCONNECT";
      disconnectBtn.addEventListener("click", async () => {
        connectionMenu.classList.remove("open");
        connectionMenu.innerHTML = "";
        try {
          await fetch("/api/serial/disconnect", { method: "POST" });
        } catch (err) {
          console.error("disconnect error", err);
        }
        serialConnected = false;
        connectionBtn.classList.remove("connected");
        syncConnectionUI();
      });
      connectionMenu.appendChild(disconnectBtn);
    }

    connectionMenu.classList.add("open");
  } catch (err) {
    console.error("Connection error", err);
    window.alert("Failed to load serial port list.");
  }
}

function startTimer() {
  if (isRunning) return;

  // 只要目前顯示在 00:00（currentSeconds === 0），按下 Start 一律啟動正數模式
  if (currentSeconds === 0) {
    mode = "countup";
  }

  if (mode === "countdown") {
    if (currentSeconds <= 0) {
      return;
    }
    isRunning = true;
    startBtn.disabled = true;

    timerId = setInterval(() => {
      currentSeconds -= 1;
      render();

      if (currentSeconds <= 0) {
        currentSeconds = 0;
        render();
        clearInterval(timerId);
        timerId = null;
        isRunning = false;
        mode = "countup";
        startBtn.disabled = false;
        startBtn.textContent = "Start";
      }
    }, 1000);
  } else if (mode === "countup") {
    isRunning = true;
    startBtn.disabled = true;

    timerId = setInterval(() => {
      currentSeconds += 1;
      render();
    }, 1000);
  }
}

function pauseTimer() {
  if (!isRunning) return;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  isRunning = false;
  startBtn.disabled = false;
}

function resetTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  isRunning = false;
  startBtn.disabled = false;
  startBtn.textContent = "Start";
  applyInitial(initialCountdownSeconds);
}

startBtn.addEventListener("click", startTimer);
pauseBtn.addEventListener("click", pauseTimer);
resetBtn.addEventListener("click", resetTimer);
setBtn.addEventListener("click", () => applyFromInput());
saveBtn.addEventListener("click", toggleSavingMode);
minutesUpBtn.addEventListener("click", () =>
  stepField(minutesInput, 1, 0, 99)
);
minutesDownBtn.addEventListener("click", () =>
  stepField(minutesInput, -1, 0, 99)
);
secondsUpBtn.addEventListener("click", () => stepSeconds(1));
secondsDownBtn.addEventListener("click", () => stepSeconds(-1));
connectionBtn.addEventListener("click", handleConnectionClick);

if (modeToggle) {
  modeToggle.addEventListener("change", syncModeUI);
  syncModeUI();
}

if (autoSetToggle) {
  const autoSetRoot = autoSetToggle.closest(".auto-set-toggle");

  const syncAutoSetUI = () => {
    autoSetEnabled = autoSetToggle.checked;
    if (!autoSetRoot) return;
    if (autoSetEnabled) {
      autoSetRoot.classList.add("auto-set-on");
    } else {
      autoSetRoot.classList.remove("auto-set-on");
    }
  };

  autoSetToggle.addEventListener("change", syncAutoSetUI);
  syncAutoSetUI();
}

if (dimmerSlider && dimmerValueEl) {
  const pushDimmerToSerial = () => {
    if (!serialConnected) return;
    const now = Date.now();
    const elapsed = now - lastDimmerPushAt;
    const MIN_INTERVAL = 100;

    const send = () => {
      let minutes;
      let seconds;
      if (displayMode === "clock") {
        const now = new Date();
        minutes = now.getHours();
        seconds = now.getMinutes();
      } else {
        const safeSeconds = Math.abs(currentSeconds);
        minutes = Math.floor(safeSeconds / 60);
        seconds = safeSeconds % 60;
      }
      lastDimmerPushAt = Date.now();
      fetch("/api/serial/time", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ m: minutes, s: seconds, d: dimmerValue }),
      }).catch((err) => {
        console.error("Failed to send serial time from dimmer", err);
      });
    };

    if (elapsed >= MIN_INTERVAL) {
      if (dimmerPushTimeout) {
        clearTimeout(dimmerPushTimeout);
        dimmerPushTimeout = null;
      }
      send();
    } else {
      if (dimmerPushTimeout) {
        clearTimeout(dimmerPushTimeout);
      }
      dimmerPushTimeout = setTimeout(send, MIN_INTERVAL - elapsed);
    }
  };

  const syncDimmerUI = () => {
    const sliderPercent = Math.max(
      0,
      Math.min(100, parseInt(dimmerSlider.value, 10) || 0)
    );
    dimmerSlider.value = String(sliderPercent);
    dimmerValue = Math.round((sliderPercent / 100) * 255);
    dimmerValueEl.textContent = `${sliderPercent}%`;

    const percent = sliderPercent;
    dimmerSlider.style.background = `linear-gradient(to right, #6b7280 0%, #6b7280 ${percent}%, rgba(31,41,55,0.8) ${percent}%, rgba(31,41,55,0.8) 100%)`;

    pushDimmerToSerial();
  };

  dimmerSlider.addEventListener("input", syncDimmerUI);
  syncDimmerUI();
}

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const idx = Number(btn.dataset.preset);
    if (isSavingPreset && idx !== 0) {
      presets[idx] = readInitialFromInput() || 0;
      renderPresets();
      isSavingPreset = false;
      presetButtons.forEach((b) => b.classList.remove("save-target"));
      savePresetsToServer();
    } else {
      const seconds = presets[idx] || 0;
      syncInputs(seconds);
      if (autoSetEnabled) {
        applyFromInput();
      }
    }
  });
});

(async () => {
  await loadPresetsFromServer();
  applyFromInput(false);
  renderPresets();
  render();
})();
