const http = require("http");
const fs = require("fs");
const path = require("path");

const HOST = "localhost";
const PORT = Number(process.env.PORT || 8000);
const ROOT = __dirname;

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
    const phone = normalizePhone(payload.phone);
    const consent = Boolean(payload.consent);
    const name = String(payload.name || "").trim();
    const comment = String(payload.comment || "").trim();

    if (phone.length < 10) {
      sendJson(res, 422, { ok: false, message: "Введите корректный номер телефона." });
      return;
    }

    if (!consent) {
      sendJson(res, 422, { ok: false, message: "Требуется согласие на обработку данных." });
      return;
    }

    console.log("[mock lead]", {
      phone,
      name,
      comment,
      consent,
      timestamp: new Date().toISOString()
    });

    sendJson(res, 200, { ok: true, message: "Заявка принята (dev mock)." });
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
  let requested = req.url === "/" ? "/public/index.html" : req.url;
  if (requested.startsWith("/assets/")) {
    requested = `/public${requested}`;
  }
  if (requested === "/robots.txt" || requested === "/sitemap.xml") {
    requested = `/public${requested}`;
  }
  const cleanUrl = requested.split("?")[0];
  const filePath = safeJoin(ROOT, decodeURIComponent(cleanUrl));

  if (!filePath.startsWith(ROOT)) {
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
