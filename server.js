const express = require("express");
const path = require("path");
const fs = require("fs");
const SerialPort = require("serialport");

const app = express();
const PORT = process.env.PORT || 3100;

app.use(express.json());

const publicDir = path.join(__dirname, "public");
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

let sport = null;
const PRESETS_PATH = path.join(__dirname, "presets.json");

function getDefaultPresets() {
  return new Array(10).fill(0);
}

function ensurePresetsFile() {
  try {
    fs.accessSync(PRESETS_PATH, fs.constants.F_OK);
  } catch {
    const initial = { presets: getDefaultPresets() };
    fs.writeFileSync(PRESETS_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

ensurePresetsFile();

app.get("/api/presets", (req, res) => {
  try {
    ensurePresetsFile();
    const raw = fs.readFileSync(PRESETS_PATH, "utf8");
    const data = JSON.parse(raw || "{}");
    if (!Array.isArray(data.presets)) {
      data.presets = getDefaultPresets();
    }
    res.json({ presets: data.presets });
  } catch (err) {
    console.error("Failed to read presets.json, recreating...", err);
    const fallback = { presets: getDefaultPresets() };
    try {
      fs.writeFileSync(PRESETS_PATH, JSON.stringify(fallback, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to recreate presets.json", e);
    }
    res.json(fallback);
  }
});

app.post("/api/presets", (req, res) => {
  try {
    const body = req.body || {};
    const incoming = Array.isArray(body.presets) ? body.presets : null;
    if (!incoming || incoming.length !== 10) {
      return res.status(400).json({ error: "presets must be an array of 10 numbers" });
    }
    const cleaned = incoming.map((v, idx) => {
      if (idx === 0) return 0;
      const n = Number.isFinite(v) ? v : parseInt(v, 10) || 0;
      return Math.max(0, n);
    });
    const payload = { presets: cleaned };
    fs.writeFileSync(PRESETS_PATH, JSON.stringify(payload, null, 2), "utf8");
    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to write presets.json", err);
    res.status(500).json({ error: "Failed to write presets.json" });
  }
});

app.get("/api/serial/ports", async (req, res) => {
  try {
    const ports = await SerialPort.SerialPort.list();
    res.json(ports.map((p) => p.path));
  } catch (err) {
    console.error("Failed to list serial ports", err);
    res.status(500).json({ error: "Failed to list serial ports" });
  }
});

app.post("/api/serial/connect", async (req, res) => {
  const { path: portPath, baudRate = 2400 } = req.body || {};

  if (!portPath) {
    return res.status(400).json({ error: "Missing port path" });
  }

  try {
    if (sport) {
      await new Promise((resolve) => {
        try {
          sport.close(() => resolve());
        } catch {
          resolve();
        }
      });
      sport = null;
    }

    sport = new SerialPort.SerialPort({ path: portPath, baudRate });

    sport.on("open", () => {
      console.log(`Serial port opened: ${portPath}`);
    });

    sport.on("error", (err) => {
      console.error("Serial port error:", err);
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Failed to open serial port", err);
    res.status(500).json({ error: "Failed to open serial port" });
  }
});

app.post("/api/serial/time", (req, res) => {
  const { m, s, d } = req.body || {};
  const mm = Number.isFinite(m) ? m : parseInt(m, 10) || 0;
  const ss = Number.isFinite(s) ? s : parseInt(s, 10) || 0;
  const dd = Number.isFinite(d) ? d : parseInt(d, 10) || 0;

  if (!sport) {
    console.warn(
      "[serial] no port connected, skip write:",
      JSON.stringify({ m: mm, s: ss, d: dd })
    );
    return res.json({ ok: false, message: "No serial port connected" });
  }

  const clampedM = Math.max(0, Math.min(99, mm));
  const clampedS = Math.max(0, Math.min(59, ss));
  const clampedD = Math.max(0, Math.min(255, dd));

  const payload = `{ "m": ${clampedM}, "s": ${clampedS}, "d": ${clampedD} }\n`;

  console.log("[serial] write:", payload.trim());

  sport.write(payload, (err) => {
    if (err) {
      console.error("[serial] write error:", err);
      return res.status(500).json({ error: "Failed to write to serial port" });
    }
    res.json({ ok: true, m: clampedM, s: clampedS, d: clampedD });
  });
});

app.post("/api/serial/disconnect", async (req, res) => {
  if (!sport) {
    return res.json({ ok: true, disconnected: false });
  }

  try {
    await new Promise((resolve) => {
      try {
        sport.close(() => resolve());
      } catch {
        resolve();
      }
    });
    sport = null;
    console.log("[serial] disconnected");
    res.json({ ok: true, disconnected: true });
  } catch (err) {
    console.error("[serial] disconnect error:", err);
    res.status(500).json({ error: "Failed to disconnect serial port" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

