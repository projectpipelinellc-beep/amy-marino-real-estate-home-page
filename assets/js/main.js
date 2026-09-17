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

  /* -- Shared contact details -- */
  var EMAIL = "amy.marino@cbrealty.com";
  var PHONE_TEL = "tel:19149669494";
  var PHONE_DISPLAY = "(914) 966-9494";

  /* -- Inquiry dialog (Buy / Sell / Home Value quick-action buttons) -- */
  var INQUIRY_CONTENT = {
    buy: {
      title: "Let’s find your next home",
      intro: "Tell Amy what you’re looking for and she’ll help you find it across Westchester and Rockland County.",
      prefill: "I’m interested in buying a home in Westchester/Rockland County."
    },
    sell: {
      title: "Thinking about selling?",
      intro: "Amy can walk you through pricing, preparing your home, and marketing it to serious buyers.",
      prefill: "I’m interested in selling my home and would like guidance on pricing and next steps."
    },
    value: {
      title: "Find your home’s value",
      intro: "Amy can walk you through recent sales and current market activity for your home.",
      prefill: "I’d like an estimate of my home’s value."
    }
  };

  var dialog = document.getElementById("inquiryDialog");
  var dialogTitle = document.getElementById("inquiryTitle");
  var dialogBody = document.getElementById("inquiryBody");
  var dialogMessage = document.getElementById("inquiryMessage");
  var dialogCall = document.getElementById("inquiryCall");
  var dialogEmail = document.getElementById("inquiryEmail");
  var dialogClose = document.getElementById("inquiryClose");
  var supportsDialog = dialog && typeof dialog.showModal === "function";

  function openInquiry(kind) {
    var content = INQUIRY_CONTENT[kind] || INQUIRY_CONTENT.buy;
    var mailtoHref = "mailto:" + EMAIL + "?subject=" + encodeURIComponent(content.prefill);

    if (!supportsDialog) {
      window.location.href = mailtoHref;
      return;
    }

    dialogTitle.textContent = content.title;
    dialogBody.textContent = content.intro;
    if (dialogMessage) {
      dialogMessage.value = content.prefill;
    }
    dialogCall.href = PHONE_TEL;
    dialogCall.textContent = "Call — " + PHONE_DISPLAY;
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

  /* -- Inquiry forms (dialog + Contact section) -- */
  function buildFallbackMailto(formData) {
    var name = formData.get("name") || "";
    var phone = formData.get("phone") || "";
    var address = formData.get("address") || "";
    var message = formData.get("message") || "";

    var lines = ["Name: " + name, "Phone: " + phone];
    if (address) {
      lines.push("Property address: " + address);
    }
    lines.push("", message);

    var subject = "Inquiry from " + (name || "website visitor");
    return (
      "mailto:" + EMAIL +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(lines.join("\n"))
    );
  }

  document.querySelectorAll("[data-inquiry-form]").forEach(function (form) {
    var statusEl = form.querySelector(".inquiry-status");
    var submitBtn = form.querySelector(".inquiry-submit");

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var formData = new FormData(form);

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.className = "inquiry-status";
      }

      fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("Request failed with status " + response.status);
          }
          return response.json();
        })
        .then(function () {
          form.reset();
          if (statusEl) {
            statusEl.textContent = "Thanks — Amy will be in touch shortly.";
            statusEl.className = "inquiry-status is-success";
          }
        })
        .catch(function () {
          if (statusEl) {
            var mailtoHref = buildFallbackMailto(formData);
            statusEl.innerHTML =
              "Something went wrong sending this automatically. " +
              '<a href="' + mailtoHref + '">Click here to email Amy directly</a> — your information is already filled in.';
            statusEl.className = "inquiry-status is-error";
          }
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Send Inquiry";
          }
        });
    });
  });
})();
