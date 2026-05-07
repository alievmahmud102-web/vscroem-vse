const TELEGRAM_ENABLED =
  String(process.env.TELEGRAM_ENABLED || "").toLowerCase() === "true";
const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "");
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "");
const SITE_URL = String(process.env.SITE_URL || "").trim();

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
  const host = String(req.headers.host || "");
  const protoHeader = String(req.headers["x-forwarded-proto"] || "https");
  const protocol = protoHeader.split(",")[0].trim() || "https";
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
    console.warn(
      "[telegram] TELEGRAM_ENABLED=true, но TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заполнены."
    );
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

module.exports = async function handler(req, res) {
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
    const timestampIso = new Date().toISOString();

    if (phone.length < 10) {
      sendJson(res, 422, {
        ok: false,
        message: "Введите корректный номер телефона."
      });
      return;
    }

    if (!consent) {
      sendJson(res, 422, {
        ok: false,
        message: "Требуется согласие на обработку данных."
      });
      return;
    }

    console.log("[lead]", {
      phone,
      name,
      comment,
      consent,
      timestamp: timestampIso
    });

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
};
