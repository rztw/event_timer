const express = require("express");
const path = require("path");
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

