import { CONFIG } from "./config.js";
import { initFirstVisitModal } from "./modal.js";
import { initLeadForm } from "./form.js";

function normalizeSiteUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function resolveAbsoluteUrl(baseUrl, maybeRelativePath) {
  if (!maybeRelativePath) {
    return `${baseUrl}/`;
  }
  if (/^https?:\/\//i.test(maybeRelativePath)) {
    return maybeRelativePath;
  }
  const normalizedPath = String(maybeRelativePath).startsWith("/")
    ? String(maybeRelativePath)
    : `/${String(maybeRelativePath)}`;
  return `${baseUrl}${normalizedPath}`;
}

function applyConfig() {
  const brandNodes = document.querySelectorAll("[data-brand-name]");
  brandNodes.forEach((node) => {
    node.textContent = CONFIG.BRAND_NAME;
  });

  const phoneLinkIds = ["header-phone-link", "contact-phone-link", "modal-phone-link", "contact-nap-phone-link"];
  phoneLinkIds.forEach((id) => {
    const node = document.getElementById(id);
    if (!node) {
      return;
    }
    node.textContent = CONFIG.PHONE_DISPLAY;
    node.setAttribute("href", `tel:${CONFIG.PHONE_TEL}`);
  });

  const geoNode = document.getElementById("hero-geo");
  if (geoNode) {
    geoNode.textContent = CONFIG.GEO_CITY;
  }

  const geoInlineNode = document.getElementById("geo-city-inline");
  if (geoInlineNode) {
    geoInlineNode.textContent = CONFIG.GEO_CITY_NOMINATIVE || CONFIG.GEO_CITY;
  }

  const serviceAreasCityNode = document.getElementById("service-areas-city-inline");
  if (serviceAreasCityNode) {
    serviceAreasCityNode.textContent = CONFIG.GEO_CITY_NOMINATIVE || CONFIG.GEO_CITY;
  }

  const contactCityNode = document.getElementById("contact-city");
  if (contactCityNode) {
    contactCityNode.textContent = CONFIG.GEO_CITY_NOMINATIVE || CONFIG.GEO_CITY;
  }

  const contactRegionNode = document.getElementById("contact-region");
  if (contactRegionNode) {
    contactRegionNode.textContent = CONFIG.GEO_REGION;
  }

  const serviceAreasList = document.getElementById("service-areas-list");
  if (serviceAreasList && Array.isArray(CONFIG.SERVICE_AREAS) && CONFIG.SERVICE_AREAS.length > 0) {
    serviceAreasList.innerHTML = "";
    CONFIG.SERVICE_AREAS.forEach((area) => {
      const item = document.createElement("li");
      item.textContent = area;
      serviceAreasList.appendChild(item);
    });
  }

  const vkLinkIds = ["header-vk-link", "contact-vk-link", "footer-vk-link"];
  vkLinkIds.forEach((id) => {
    const node = document.getElementById(id);
    if (!node || !CONFIG.VK_URL) {
      return;
    }
    node.setAttribute("href", CONFIG.VK_URL);
  });
}

function applySeoConfig() {
  const siteUrl = normalizeSiteUrl(CONFIG.SITE_URL || "https://example.com");
  const canonicalUrl = `${siteUrl}/`;
  const imageUrl = resolveAbsoluteUrl(siteUrl, CONFIG.SITE_IMAGE);
  const cityForText = CONFIG.GEO_CITY_NOMINATIVE || CONFIG.GEO_CITY;
  const title = `${CONFIG.BRAND_NAME} - вскрытие и ремонт замков в ${cityForText} 24/7`;
  const description = `Срочный выезд мастера по вскрытию и ремонту замков в ${cityForText} и рядом. Консультация по телефону, аккуратная работа, сервис 24/7.`;
  const robotsContent = CONFIG.INDEXING_ENABLED ? "index, follow, max-image-preview:large" : "noindex, nofollow";

  document.title = title;

  const descriptionMeta = document.querySelector('meta[name="description"]');
  if (descriptionMeta) {
    descriptionMeta.setAttribute("content", description);
  }

  const canonical = document.getElementById("canonical-link");
  if (canonical) {
    canonical.setAttribute("href", canonicalUrl);
  }

  const alternateRu = document.getElementById("alternate-ru-link");
  if (alternateRu) {
    alternateRu.setAttribute("href", canonicalUrl);
  }

  const alternateDefault = document.getElementById("alternate-default-link");
  if (alternateDefault) {
    alternateDefault.setAttribute("href", canonicalUrl);
  }

  const robotsMeta = document.getElementById("meta-robots");
  if (robotsMeta) {
    robotsMeta.setAttribute("content", robotsContent);
  }

  const metaUpdates = [
    ["og-title", title],
    ["og-description", description],
    ["og-url", canonicalUrl],
    ["og-image", imageUrl],
    ["twitter-title", title],
    ["twitter-description", description],
    ["twitter-image", imageUrl]
  ];

  metaUpdates.forEach(([id, value]) => {
    const node = document.getElementById(id);
    if (node) {
      node.setAttribute("content", value);
    }
  });

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "Locksmith",
    name: CONFIG.BRAND_NAME,
    url: canonicalUrl,
    image: imageUrl,
    telephone: CONFIG.PHONE_TEL,
    priceRange: "$$",
    areaServed: (CONFIG.SERVICE_AREAS || []).map((area) => ({
      "@type": "City",
      name: area
    })),
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday"
        ],
        opens: "00:00",
        closes: "23:59"
      }
    ],
    address: {
      "@type": "PostalAddress",
      addressLocality: cityForText,
      addressRegion: CONFIG.GEO_REGION,
      addressCountry: "RU"
    }
  };

  const localBusinessNode = document.getElementById("local-business-jsonld");
  if (localBusinessNode) {
    localBusinessNode.textContent = JSON.stringify(localBusinessSchema);
  }

  const faqItems = Array.from(document.querySelectorAll("#faq details")).map((item) => {
    const questionNode = item.querySelector("summary");
    const answerNode = item.querySelector("p");
    return {
      "@type": "Question",
      name: questionNode ? questionNode.textContent.trim() : "",
      acceptedAnswer: {
        "@type": "Answer",
        text: answerNode ? answerNode.textContent.trim() : ""
      }
    };
  }).filter((item) => item.name && item.acceptedAnswer.text);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems
  };

  const faqNode = document.getElementById("faq-jsonld");
  if (faqNode) {
    faqNode.textContent = JSON.stringify(faqSchema);
  }
}

function initAnchorsWithOffset() {
  const header = document.querySelector(".site-header");
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") {
        return;
      }
      const target = document.querySelector(href);
      if (!target) {
        return;
      }
      event.preventDefault();
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const top = window.scrollY + target.getBoundingClientRect().top - headerHeight - 8;
      window.scrollTo({ top, behavior: "smooth" });
    });
  });
}

function initYear() {
  const yearNode = document.getElementById("current-year");
  if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
  }
}

function initGalleryLightbox() {
  const lightbox = document.getElementById("gallery-lightbox");
  const lightboxImage = document.getElementById("gallery-lightbox-image");
  const closeButton = document.getElementById("gallery-lightbox-close");
  const galleryLinks = Array.from(document.querySelectorAll("[data-gallery-image]"));
  if (!lightbox || !lightboxImage || !closeButton || galleryLinks.length === 0) {
    return;
  }

  let lastActiveElement = null;

  const closeLightbox = () => {
    lightbox.classList.add("is-hidden");
    lightboxImage.setAttribute("src", "");
    lightboxImage.setAttribute("alt", "");
    document.body.classList.remove("lightbox-open");
    document.removeEventListener("keydown", handleKeydown);
    if (lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
    lastActiveElement = null;
  };

  const openLightbox = (link) => {
    const fullSrc = link.getAttribute("href");
    const imageNode = link.querySelector("img");
    const imageAlt = imageNode ? imageNode.getAttribute("alt") || "" : "";
    if (!fullSrc) {
      return;
    }
    lastActiveElement = link;
    lightboxImage.setAttribute("src", fullSrc);
    lightboxImage.setAttribute("alt", imageAlt);
    lightbox.classList.remove("is-hidden");
    document.body.classList.add("lightbox-open");
    document.addEventListener("keydown", handleKeydown);
    closeButton.focus();
  };

  function handleKeydown(event) {
    if (event.key === "Escape") {
      closeLightbox();
    }
  }

  galleryLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openLightbox(link);
    });
  });

  closeButton.addEventListener("click", closeLightbox);
  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });
}

applyConfig();
applySeoConfig();
initYear();
initAnchorsWithOffset();
initGalleryLightbox();
initFirstVisitModal();
initLeadForm();
