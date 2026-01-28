(() => {
  const $ = (q) => document.querySelector(q);
  const form = $("#leadForm");
  const submitBtn = $("#submitBtn");
  const successState = $("#successState");
  const newLeadBtn = $("#newLeadBtn");

  const year = new Date().getFullYear();
  $("#year").textContent = year;

  // ---- CONFIG: Hier trägst du dein Ziel ein ----
  // Option A: Webhook (z.B. Make/Zapier/n8n/Formspark/Getform)
  const WEBHOOK_URL = ""; // <- z.B. "https://hook.eu1.make.com/xxxx"

  // Option B (Fallback): E-Mail via mailto (nicht ideal fürs Tracking, aber schnell)
  const FALLBACK_MAILTO = "mailto:deinmail@domain.de?subject=Neuer%20Lead%20Versicherungs-Check";

  // ---- Helpers ----
  const setError = (name, msg) => {
    const el = document.querySelector(`[data-error-for="${name}"]`);
    if (el) el.textContent = msg || "";
  };

  const getFormDataObject = () => {
    const fd = new FormData(form);
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    return obj;
  };

  const isValidPhone = (val) => {
    const v = (val || "").trim();
    // einfache, praxisnahe Prüfung: mind. 7 Ziffern, erlaubt +, Leerzeichen, -, ()
    const digits = v.replace(/[^\d]/g, "");
    if (digits.length < 7) return false;
    return /^[+\d][\d\s\-()]+$/.test(v);
  };

  const isValidEmail = (val) => {
    const v = (val || "").trim();
    if (!v) return true; // optional
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };

  const getUTMs = () => {
    const p = new URLSearchParams(location.search);
    const utmKeys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
    const utms = {};
    utmKeys.forEach(k => utms[k] = p.get(k) || "");
    return utms;
  };

  // Fill hidden fields
  const utms = getUTMs();
  Object.entries(utms).forEach(([k,v]) => {
    const input = form.querySelector(`input[name="${k}"]`);
    if (input) input.value = v;
  });
  const ref = form.querySelector(`input[name="referrer"]`);
  if (ref) ref.value = document.referrer || "";

  // Autosave (reduziert Drop-Off)
  const autosaveKey = "leadFormAutosave_v1";
  const autosaveLoad = () => {
    try {
      const raw = localStorage.getItem(autosaveKey);
      if (!raw) return;
      const data = JSON.parse(raw);
      for (const [k,v] of Object.entries(data)) {
        const el = form.elements[k];
        if (!el) continue;
        if (el.type === "radio") {
          const r = form.querySelector(`input[name="${k}"][value="${v}"]`);
          if (r) r.checked = true;
        } else if (el.type === "checkbox") {
          el.checked = !!v;
        } else {
          el.value = v;
        }
      }
    } catch {}
  };
  const autosave = () => {
    try {
      const obj = getFormDataObject();
      // checkbox (consent) fehlt im FormData wenn unchecked -> ergänzen:
      obj.consent = $("#consent").checked;
      localStorage.setItem(autosaveKey, JSON.stringify(obj));
    } catch {}
  };

  autosaveLoad();
  form.addEventListener("input", autosave);

  // ---- Validation ----
  const validate = () => {
    let ok = true;

    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const email = form.email.value.trim();
    const topic = form.topic.value;
    const consent = $("#consent").checked;
    const contactPref = form.querySelector('input[name="contact_pref"]:checked')?.value || "";

    // reset
    ["name","phone","email","topic","consent","contact_pref"].forEach(k => setError(k,""));

    if (name.length < 2) { setError("name", "Bitte gib deinen Namen an."); ok = false; }
    if (!isValidPhone(phone)) { setError("phone", "Bitte gib eine gültige Telefonnummer an."); ok = false; }
    if (!isValidEmail(email)) { setError("email", "Bitte gib eine gültige E-Mail an (oder leer lassen)."); ok = false; }
    if (!topic) { setError("topic", "Bitte wähle ein Thema aus."); ok = false; }
    if (!contactPref) { setError("contact_pref", "Bitte wähle einen Kontaktweg."); ok = false; }
    if (!consent) { setError("consent", "Bitte bestätige die Einwilligung."); ok = false; }

    return ok;
  };

  const showSuccess = () => {
    submitBtn.disabled = true;
    // hide form inputs but keep success
    [...form.querySelectorAll(".form__row, fieldset, .btn, .fineprint")].forEach(el => el.hidden = true);
    successState.hidden = false;
  };

  const resetFormUI = () => {
    submitBtn.disabled = false;
    successState.hidden = true;
    [...form.querySelectorAll(".form__row, fieldset, .btn, .fineprint")].forEach(el => el.hidden = false);
    form.reset();
    Object.entries(getUTMs()).forEach(([k,v]) => {
      const input = form.querySelector(`input[name="${k}"]`);
      if (input) input.value = v;
    });
    const ref = form.querySelector(`input[name="referrer"]`);
    if (ref) ref.value = document.referrer || "";
    localStorage.removeItem(autosaveKey);
  };

  newLeadBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    resetFormUI();
    location.hash = "#formular";
  });

  // ---- Submit ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Sende …";

    const payload = getFormDataObject();
    payload.consent = $("#consent").checked;
    payload.timestamp = new Date().toISOString();
    payload.page = location.href;

    try {
      if (WEBHOOK_URL) {
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("Webhook error");
        showSuccess();
        localStorage.removeItem(autosaveKey);
        return;
      }

      // Fallback: mailto
      const body = encodeURIComponent(
        `Neuer Lead:\n\n` +
        `Name: ${payload.name}\n` +
        `Telefon: ${payload.phone}\n` +
        `E-Mail: ${payload.email || "-"}\n` +
        `Thema: ${payload.topic}\n` +
        `Kontaktweg: ${payload.contact_pref}\n` +
        `Nachricht: ${payload.msg || "-"}\n\n` +
        `UTM: ${payload.utm_source}/${payload.utm_medium}/${payload.utm_campaign}\n` +
        `Referrer: ${payload.referrer || "-"}\n` +
        `Seite: ${payload.page}\n` +
        `Zeit: ${payload.timestamp}\n`
      );

      window.location.href = `${FALLBACK_MAILTO}&body=${body}`;
      showSuccess();
      localStorage.removeItem(autosaveKey);
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = "✅ Jetzt kostenlosen Check sichern";
      alert("Senden hat nicht geklappt. Bitte versuch es nochmal oder schreib uns direkt per WhatsApp/Telefon.");
    }
  });
})();
