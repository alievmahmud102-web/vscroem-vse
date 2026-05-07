/**
 * Shared anti-spam for POST /api/mock (Vercel + local server).
 * Лимит: до 3 успешных циклов счётчика за 24 ч по IP и по телефону; при превышении — бан на 24 ч.
 */

const MIN_ELAPSED_MS = 2500;
const WINDOW_SEC = 86400;
const BAN_SEC = 86400;
/** Разрешены попытки с номерами счётчика 1..MAX_OK; при следующем инкременте — бан */
const MAX_OK = 3;

function getClientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "");
  const first = xf.split(",")[0].trim();
  if (first) {
    return first;
  }
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  if (realIp) {
    return realIp;
  }
  const socketIp = req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : "";
  return socketIp.replace(/^::ffff:/, "") || "unknown";
}

function honeypotFilled(payload) {
  const trap = payload.website ?? payload.company ?? "";
  return String(trap).trim().length > 0;
}

function minTimeOk(payload) {
  const t = Number(payload._formStartedAt);
  if (!Number.isFinite(t)) {
    return false;
  }
  return Date.now() - t >= MIN_ELAPSED_MS;
}

function captchaValid(payload) {
  const c = payload && payload.captcha;
  if (!c || typeof c !== "object") {
    return false;
  }
  const a = Number(c.a);
  const b = Number(c.b);
  const answer = Number(c.answer);
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(answer)) {
    return false;
  }
  if (a < 1 || a > 9 || b < 1 || b > 9) {
    return false;
  }
  return a + b === answer;
}

const MSG429 =
  "Превышен лимит заявок. Попробуйте позже (до 24 часов) или позвоните по номеру на сайте.";

function sanitizeIp(ip) {
  return String(ip || "unknown")
    .replace(/[^\w.:]/g, "_")
    .slice(0, 120);
}

function sanitizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "").slice(0, 24);
}

/**
 * @param {object} store — объект как @vercel/kv: incr, expire, get, set
 */
async function enforceRateLimit(store, ip, normalizedPhone) {
  const safeIp = sanitizeIp(ip);
  const safePhone = sanitizePhone(normalizedPhone);

  const banIpKey = `lead:ban:ip:${safeIp}`;
  const banPhoneKey = `lead:ban:phone:${safePhone}`;
  const cntIpKey = `lead:cnt:ip:${safeIp}`;
  const cntPhoneKey = `lead:cnt:phone:${safePhone}`;

  if ((await store.get(banIpKey)) || (await store.get(banPhoneKey))) {
    return { ok: false, code: 429, message: MSG429 };
  }

  const ipCount = await store.incr(cntIpKey);
  if (ipCount === 1) {
    await store.expire(cntIpKey, WINDOW_SEC);
  }

  const phoneCount = await store.incr(cntPhoneKey);
  if (phoneCount === 1) {
    await store.expire(cntPhoneKey, WINDOW_SEC);
  }

  let blocked = false;
  if (ipCount > MAX_OK) {
    await store.set(banIpKey, "1", { ex: BAN_SEC });
    blocked = true;
  }
  if (phoneCount > MAX_OK) {
    await store.set(banPhoneKey, "1", { ex: BAN_SEC });
    blocked = true;
  }

  if (blocked) {
    return { ok: false, code: 429, message: MSG429 };
  }

  return { ok: true };
}

/** In-memory KV-подобное хранилище для локального server.js */
function createMemoryStore() {
  const entries = new Map();

  function now() {
    return Date.now();
  }

  function purgeKey(key) {
    const e = entries.get(key);
    if (!e) {
      return;
    }
    if (e.expiresAt && now() >= e.expiresAt) {
      entries.delete(key);
    }
  }

  return {
    async get(key) {
      purgeKey(key);
      const e = entries.get(key);
      if (!e) {
        return null;
      }
      if (e.val !== undefined) {
        return e.val;
      }
      return null;
    },
    async incr(key) {
      purgeKey(key);
      let e = entries.get(key);
      const t = now();
      if (!e || e.val !== undefined || !e.count || (e.expiresAt && t >= e.expiresAt)) {
        e = { count: 0, expiresAt: null };
      }
      e.count += 1;
      entries.set(key, e);
      return e.count;
    },
    async expire(key, sec) {
      const e = entries.get(key);
      if (e && e.count !== undefined) {
        e.expiresAt = now() + sec * 1000;
      }
    },
    async set(key, val, opts) {
      const ex = opts && opts.ex ? opts.ex : BAN_SEC;
      entries.set(key, { val: String(val), expiresAt: now() + ex * 1000 });
    }
  };
}

module.exports = {
  getClientIp,
  honeypotFilled,
  minTimeOk,
  captchaValid,
  enforceRateLimit,
  createMemoryStore,
  MIN_ELAPSED_MS,
  MSG429
};
