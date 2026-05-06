function getFocusable(container) {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ];
  return [...container.querySelectorAll(selectors.join(","))];
}

export function initFirstVisitModal() {
  const modal = document.getElementById("first-visit-modal");
  const closeButton = document.getElementById("modal-close-button");
  const callButton = document.getElementById("modal-call-button");
  if (!modal || !closeButton) {
    return;
  }

  const previousFocused = document.activeElement;
  const bodyOverflow = document.body.style.overflow;

  const openModal = () => {
    modal.classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
    if (callButton) {
      callButton.focus();
      return;
    }
    closeButton.focus();
  };

  const closeModal = () => {
    modal.classList.add("is-hidden");
    document.body.style.overflow = bodyOverflow;
    if (previousFocused && typeof previousFocused.focus === "function") {
      previousFocused.focus();
    }
    modal.removeEventListener("keydown", handleKeydown);
    closeButton.removeEventListener("click", closeModal);
  };

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      closeModal();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusable(modal);
    if (!focusable.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  closeButton.addEventListener("click", closeModal);
  modal.addEventListener("keydown", handleKeydown);
  openModal();
}
