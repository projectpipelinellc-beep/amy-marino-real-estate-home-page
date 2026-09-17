(function () {
  var toggle = document.getElementById("navToggle");
  var panel = document.getElementById("navMobilePanel");

  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var isOpen = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        panel.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  /* -- Inquiry dialog (Buy / Sell / Home Value quick-action buttons) -- */
  var EMAIL = "amy.marino@cbrealty.com";
  var PHONE_TEL = "tel:19149669494";
  var PHONE_DISPLAY = "(914) 966-9494";

  var INQUIRY_CONTENT = {
    buy: {
      title: "Let’s find your next home",
      body: "Tell Amy what you’re looking for and she’ll help you find it across Westchester and Rockland County.",
      subject: "I’d like help buying a home"
    },
    sell: {
      title: "Thinking about selling?",
      body: "Amy can walk you through pricing, preparing your home, and marketing it to serious buyers.",
      subject: "I’d like help selling my home"
    },
    value: {
      title: "Find your home’s value",
      body: "Amy can walk you through recent sales and current market activity for your home.",
      subject: "I’d like an estimate of my home’s value"
    }
  };

  var dialog = document.getElementById("inquiryDialog");
  var dialogTitle = document.getElementById("inquiryTitle");
  var dialogBody = document.getElementById("inquiryBody");
  var dialogCall = document.getElementById("inquiryCall");
  var dialogEmail = document.getElementById("inquiryEmail");
  var dialogClose = document.getElementById("inquiryClose");
  var supportsDialog = dialog && typeof dialog.showModal === "function";

  function openInquiry(kind) {
    var content = INQUIRY_CONTENT[kind] || INQUIRY_CONTENT.buy;
    var mailtoHref = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(content.subject);

    if (!supportsDialog) {
      window.location.href = mailtoHref;
      return;
    }

    dialogTitle.textContent = content.title;
    dialogBody.textContent = content.body;
    dialogCall.href = PHONE_TEL;
    dialogCall.textContent = "Call Amy — " + PHONE_DISPLAY;
    dialogEmail.href = mailtoHref;
    dialog.showModal();
  }

  document.querySelectorAll("[data-inquiry]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      openInquiry(btn.getAttribute("data-inquiry"));
    });
  });

  if (dialog && supportsDialog) {
    if (dialogClose) {
      dialogClose.addEventListener("click", function () {
        dialog.close();
      });
    }
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) {
        dialog.close();
      }
    });
  }
})();
