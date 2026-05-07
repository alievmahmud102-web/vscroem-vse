import { CONFIG } from "./config.js";

function normalizePhone(value) {
  return value.replace(/[^\d+]/g, "");
}

function clearErrors(errorNodes) {
  Object.values(errorNodes).forEach((node) => {
    if (node) {
      node.textContent = "";
    }
  });
}

function showError(errorNodes, key, message) {
  if (errorNodes[key]) {
    errorNodes[key].textContent = message;
  }
}

function validateForm({ phone, name, comment, consent }) {
  const errors = {};
  const normalized = normalizePhone(phone);

  if (normalized.length < 10) {
    errors.phone = "Введите корректный номер телефона.";
  }

  if (name && name.trim().length > 80) {
    errors.name = "Имя не должно быть длиннее 80 символов.";
  }

  if (comment && comment.trim().length > 500) {
    errors.comment = "Комментарий не должен быть длиннее 500 символов.";
  }

  if (!consent) {
    errors.consent = "Нужно согласие на обработку данных.";
  }

  return { errors, normalizedPhone: normalized };
}

function makeCaptcha() {
  const a = 1 + Math.floor(Math.random() * 8);
  const b = 1 + Math.floor(Math.random() * 8);
  return { a, b };
}

async function submitLead(payload) {
  const response = await fetch(CONFIG.API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      "Сервер вернул неожиданный ответ. Попробуйте позже или напишите в Telegram / позвоните."
    );
  }
  if (!response.ok || !data.ok) {
    throw new Error(data.message || "Не удалось отправить заявку.");
  }
  return data;
}

export function initLeadForm() {
  const form = document.getElementById("lead-form");
  if (!form) {
    return;
  }

  const formStartedAt = Date.now();
  const honeypotInput = document.getElementById("lead-honeypot");

  const phoneInput = document.getElementById("phone");
  const nameInput = document.getElementById("name");
  const commentInput = document.getElementById("comment");
  const consentInput = document.getElementById("consent");
  const submitButton = document.getElementById("submit-button");
  const statusNode = document.getElementById("form-status");
  const captchaRow = document.getElementById("captcha-row");
  const captchaQuestion = document.getElementById("captcha-question");
  const captchaAnswer = document.getElementById("captcha-answer");

  const errorNodes = {
    phone: document.getElementById("phone-error"),
    name: document.getElementById("name-error"),
    comment: document.getElementById("comment-error"),
    consent: document.getElementById("consent-error"),
    captcha: document.getElementById("captcha-error")
  };

  let captcha = makeCaptcha();

  const renderCaptcha = () => {
    if (!captchaRow || !captchaQuestion) {
      return;
    }
    captchaRow.hidden = false;
    captchaQuestion.textContent = `${captcha.a} + ${captcha.b} = ?`;
    if (captchaAnswer) {
      captchaAnswer.value = "";
    }
  };

  renderCaptcha();

  const setStatus = (text, type = "") => {
    statusNode.textContent = text;
    statusNode.classList.remove("form-status--success", "form-status--error");
    if (type) {
      statusNode.classList.add(type === "success" ? "form-status--success" : "form-status--error");
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors(errorNodes);
    setStatus("");

    const values = {
      phone: phoneInput.value,
      name: nameInput.value,
      comment: commentInput.value,
      consent: consentInput.checked
    };

    const { errors, normalizedPhone } = validateForm(values);

    const expectedSum = captcha.a + captcha.b;
    const userAnswer = captchaAnswer ? Number(captchaAnswer.value) : NaN;
    if (!Number.isFinite(userAnswer) || userAnswer !== expectedSum) {
      errors.captcha = "Неверный ответ. Решите пример заново.";
    }

    if (Object.keys(errors).length) {
      Object.entries(errors).forEach(([key, message]) => showError(errorNodes, key, message));
      setStatus("Проверьте поля формы и попробуйте снова.", "error");
      if (errors.captcha) {
        captcha = makeCaptcha();
        renderCaptcha();
      }
      return;
    }

    const lastTs = Number(localStorage.getItem(CONFIG.LEAD_LAST_SUBMIT_KEY) || "0");
    if (lastTs && Date.now() - lastTs < CONFIG.LEAD_COOLDOWN_MS) {
      setStatus("Подождите немного перед повторной отправкой.", "error");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Отправляем...";

    try {
      const payload = {
        phone: normalizedPhone,
        name: values.name.trim() || undefined,
        comment: values.comment.trim() || undefined,
        consent: true,
        website: honeypotInput ? honeypotInput.value : "",
        _formStartedAt: formStartedAt,
        captcha: { a: captcha.a, b: captcha.b, answer: userAnswer }
      };
      const result = await submitLead(payload);
      setStatus(result.message || "Заявка отправлена.", "success");
      localStorage.setItem(CONFIG.LEAD_LAST_SUBMIT_KEY, String(Date.now()));
      form.reset();
      captcha = makeCaptcha();
      renderCaptcha();
    } catch (error) {
      setStatus(error.message || "Произошла ошибка при отправке.", "error");
      captcha = makeCaptcha();
      renderCaptcha();
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Отправить заявку";
    }
  });
}
