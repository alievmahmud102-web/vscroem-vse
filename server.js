const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "localhost";
const PORT = Number(process.env.PORT || 8000);
const PUBLIC_ROOT = path.join(__dirname, "public");
const TELEGRAM_ENABLED = String(process.env.TELEGRAM_ENABLED || "").toLowerCase() === "true";
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "");
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "");
const SITE_URL = String(process.env.SITE_URL || "").trim();

const leadAntispam = require("./lib/leadAntispam");

function getRateStoreForServer() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return require("@vercel/kv").kv;
  }
  if (!global.__leadRateMem) {
    global.__leadRateMem = leadAntispam.createMemoryStore();
  }
  return global.__leadRateMem;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100000) {
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function resolveLeadSource(req) {
  if (SITE_URL) {
    return SITE_URL;
  }
  const host = String(req.headers.host || `${HOST}:${PORT}`);
  const protoHeader = String(req.headers["x-forwarded-proto"] || "");
  const protocol = protoHeader.split(",")[0].trim() || "http";
  return `${protocol}://${host}`;
}

function formatLeadMessage({ phone, name, comment, timestampIso, source }) {
  const formattedDate = new Date(timestampIso).toLocaleString("ru-RU");
  const nameText = name || "Не указано";
  const commentText = comment || "Не указан";

  return [
    "Новая заявка с сайта",
    "",
    `Телефон: ${phone}`,
    `Имя: ${nameText}`,
    `Комментарий: ${commentText}`,
    `Время: ${formattedDate}`,
    `Источник: ${source}`
  ].join("\n");
}

async function sendTelegramLeadNotification(leadData) {
  if (!TELEGRAM_ENABLED) {
    return;
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("[telegram] TELEGRAM_ENABLED=true, но TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заполнены.");
    return;
  }

  const endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: formatLeadMessage(leadData)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`[telegram] sendMessage failed with status ${response.status}`);
      return;
    }

    const telegramPayload = await response.json();
    if (!telegramPayload.ok) {
      console.warn("[telegram] API returned ok=false.");
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      console.warn("[telegram] sendMessage timeout.");
      return;
    }
    console.warn("[telegram] sendMessage request failed.");
  } finally {
    clearTimeout(timeout);
  }
}

async function handleMockApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      ok: false,
      message: "Метод не поддерживается. Используйте POST."
    });
    return;
  }

  try {
    const payload = await parseRequestBody(req);

    if (leadAntispam.honeypotFilled(payload)) {
      console.warn("[antispam] honeypot triggered");
      sendJson(res, 200, { ok: true, message: "Заявка принята." });
      return;
    }

    if (!leadAntispam.minTimeOk(payload)) {
      sendJson(res, 422, {
        ok: false,
        message: "Подождите несколько секунд и отправьте форму снова."
      });
      return;
    }

    if (!leadAntispam.captchaValid(payload)) {
      sendJson(res, 422, {
        ok: false,
        message: "Неверный ответ на проверочный пример. Решите его заново."
      });
      return;
    }

    const phone = normalizePhone(payload.phone);
    const consent = Boolean(payload.consent);
    const name = String(payload.name || "").trim();
    const comment = String(payload.comment || "").trim();
    const timestampIso = new Date().toISOString();

    if (phone.length < 10) {
      sendJson(res, 422, { ok: false, message: "Введите корректный номер телефона." });
      return;
    }

    if (!consent) {
      sendJson(res, 422, { ok: false, message: "Требуется согласие на обработку данных." });
      return;
    }

    const store = getRateStoreForServer();
    const ip = leadAntispam.getClientIp(req);
    const rl = await leadAntispam.enforceRateLimit(store, ip, phone);
    if (!rl.ok) {
      sendJson(res, rl.code, { ok: false, message: rl.message });
      return;
    }

    console.log("[lead]", { phone, name, comment, consent, timestamp: timestampIso });

    await sendTelegramLeadNotification({
      phone,
      name,
      comment,
      timestampIso,
      source: resolveLeadSource(req)
    });

    sendJson(res, 200, { ok: true, message: "Заявка принята." });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      message: "Некорректный JSON."
    });
  }
}

function safeJoin(base, target) {
  const targetPath = "." + path.normalize(target).replace(/^(\.\.[/\\])+/, "");
  return path.join(base, targetPath);
}

function serveStatic(req, res) {
  const cleanUrl = req.url.split("?")[0];
  const requested = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const filePath = safeJoin(PUBLIC_ROOT, decodeURIComponent(requested));

  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url && req.url.startsWith("/api/mock")) {
    handleMockApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
