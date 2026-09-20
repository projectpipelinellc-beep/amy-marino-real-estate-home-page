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

  function openInquiry(kind, address) {
    var content;
    if (kind === "showing" && address) {
      content = {
        title: "Schedule a showing",
        intro: "Let Amy know when you’d like to see " + address + " in person.",
        prefill: "I’d like to schedule a showing for " + address + "."
      };
    } else {
      content = INQUIRY_CONTENT[kind] || INQUIRY_CONTENT.buy;
    }
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
      openInquiry(btn.getAttribute("data-inquiry"), btn.getAttribute("data-address"));
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

  /* -- Homepage listing grids, rendered from data/listings.json -- */
  var listingGrid = document.getElementById("listingGrid");
  var pastSalesGrid = document.getElementById("pastSalesGrid");
  var listingEmptyState = document.getElementById("listingEmptyState");
  var SOLD_STATUSES = ["sold", "off market", "off-market"];

  function formatListingPrice(listing) {
    if (listing.priceDisplay) return listing.priceDisplay;
    if (typeof listing.price === "number") {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0
      }).format(listing.price);
    }
    return "Price upon request";
  }

  function renderListingTile(listing) {
    var image = listing.images && listing.images[0];
    var price = formatListingPrice(listing);
    var addressLine = [listing.address, listing.city, listing.state].filter(Boolean).join(", ");
    var metaParts = [];
    if (listing.beds != null) metaParts.push(listing.beds + " bd");
    if (listing.baths != null) metaParts.push(listing.baths + " ba");
    if (listing.sqft != null) metaParts.push(listing.sqft.toLocaleString() + " sq ft");

    return (
      '<a class="listing-tile" href="listings/' + listing.slug + '/index.html">' +
      '<div class="listing-tile-media">' +
      (image ? '<img src="' + image + '" alt="' + (addressLine || "Property photo") + '" loading="lazy" />' : "") +
      (listing.status ? '<span class="listing-tile-status">' + listing.status + "</span>" : "") +
      "</div>" +
      '<div class="listing-tile-body">' +
      '<p class="listing-tile-price">' + price + "</p>" +
      '<p class="listing-tile-address">' + addressLine + "</p>" +
      (metaParts.length ? '<p class="listing-tile-meta">' + metaParts.join(" · ") + "</p>" : "") +
      "</div>" +
      "</a>"
    );
  }

  if (listingGrid || pastSalesGrid) {
    fetch("data/listings.json")
      .then(function (res) {
        if (!res.ok) throw new Error("listings.json not found");
        return res.json();
      })
      .then(function (listings) {
        if (!Array.isArray(listings) || listings.length === 0) return;

        var active = [];
        var sold = [];
        listings.forEach(function (listing) {
          var isSold = SOLD_STATUSES.indexOf(String(listing.status || "").toLowerCase()) !== -1;
          (isSold ? sold : active).push(listing);
        });

        if (listingGrid && active.length) {
          listingGrid.innerHTML = active.map(renderListingTile).join("");
          listingGrid.hidden = false;
          if (listingEmptyState) listingEmptyState.hidden = true;
        }

        if (pastSalesGrid && sold.length) {
          pastSalesGrid.innerHTML = sold.map(renderListingTile).join("");
          pastSalesGrid.hidden = false;
        }
      })
      .catch(function () {
        // No listings.json reachable (e.g. viewing the file directly without a
        // server) — leave the existing empty-state CTA showing as-is.
      });
  }

  /* -- Property gallery lightbox (detail pages) -- */
  var galleryButtons = Array.prototype.slice.call(document.querySelectorAll(".listing-gallery-item"));
  var lightbox = document.getElementById("propertyLightbox");

  if (galleryButtons.length && lightbox && typeof lightbox.showModal === "function") {
    var lightboxImg = lightbox.querySelector(".lightbox-frame img");
    var lightboxCounter = lightbox.querySelector(".lightbox-counter");
    var lightboxClose = lightbox.querySelector(".lightbox-close");
    var lightboxPrev = lightbox.querySelector(".lightbox-prev");
    var lightboxNext = lightbox.querySelector(".lightbox-next");
    var images = galleryButtons.map(function (btn) {
      return { src: btn.getAttribute("data-full") || btn.querySelector("img").src, alt: btn.querySelector("img").alt };
    });
    var current = 0;

    function showImage(index) {
      current = (index + images.length) % images.length;
      lightboxImg.src = images[current].src;
      lightboxImg.alt = images[current].alt;
      lightboxCounter.textContent = current + 1 + " / " + images.length;
    }

    galleryButtons.forEach(function (btn, i) {
      btn.addEventListener("click", function () {
        showImage(i);
        lightbox.showModal();
      });
    });

    if (lightboxClose) lightboxClose.addEventListener("click", function () { lightbox.close(); });
    if (lightboxPrev) lightboxPrev.addEventListener("click", function () { showImage(current - 1); });
    if (lightboxNext) lightboxNext.addEventListener("click", function () { showImage(current + 1); });

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) lightbox.close();
    });
    lightbox.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") showImage(current - 1);
      if (event.key === "ArrowRight") showImage(current + 1);
    });
  }
})();
