# Вскроем все — локальный лендинг

Локальная кодовая реализация одностраничного лендинга под мобильный трафик, без деплоя и внешних прод-интеграций.

## Структура

- `public/index.html` — разметка и секции лендинга
- `src/css/*` — токены, базовые стили, layout и компоненты
- `src/js/config.js` — все ключевые контакты и переменные контента
- `src/js/modal.js` — модалка первого входа (localStorage + a11y)
- `src/js/form.js` — валидация формы и отправка на dev endpoint
- `server.js` — локальный Node-сервер для статики и mock API
- `.env.example` — плейсхолдеры конфигурации на будущее

## Локальный запуск

Нужен Node.js 18+:

```bash
npm start
```

Откройте:

- [http://localhost:8000/public/index.html](http://localhost:8000/public/index.html)

## Контракт формы (dev)

`POST /api/mock`  
`Content-Type: application/json`

Пример body:

```json
{
  "phone": "+74958856620",
  "name": "Иван",
  "comment": "Не открывается дверь",
  "consent": true
}
```

Успешный ответ:

```json
{
  "ok": true,
  "message": "Заявка принята (dev mock)."
}
```

Ошибка:

```json
{
  "ok": false,
  "message": "Введите корректный номер телефона."
}
```

## Что уже реализовано

- Mobile-first секции: hero, услуги, процесс, цены, география, FAQ, контакты, футер
- Sticky header с крупным `tel:` и CTA
- Модалка первого входа с сохранением флага в `localStorage`
- Форма с клиентской валидацией и UX-состояниями (`idle/submitting/success/error`)
- Вся настройка телефона/гео/ссылок централизована в `src/js/config.js`
- Галерея из 8 локальных изображений, скачанных из VK:
  - исходники: `public/assets/images/gallery/raw`
  - web-версии: `public/assets/images/gallery/optimized`

## Быстрая замена данных позже

- Телефон: `src/js/config.js` (`PHONE_DISPLAY`, `PHONE_TEL`)
- Ссылка VK: `src/js/config.js` (`VK_URL`)
- Бренд/география: `src/js/config.js` (`BRAND_NAME`, `GEO_CITY`)
- Юридический текст политики: блок `#policy` в `public/index.html`

## TODO вне текущего scope

- Домен/хостинг/DNS/SSL
- Реальный `metrika id` и прод-события
- Боевой endpoint и прод-отправка заявок
- Интеграция с Telegram bot/webhook
- Финальный юридический текст политики ПДн и реквизиты
