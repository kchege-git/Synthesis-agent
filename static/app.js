/* Panel Synthesis Agent — front-end logic */

"use strict";

// ── Drag-and-drop enhancement ──────────────────────────────────────────────

function setupDropzone(zone, input, labelEl) {
  // File-picker change
  input.addEventListener("change", () => {
    if (input.files.length) _markFileChosen(zone, input.files[0].name, labelEl);
  });

  ["dragenter", "dragover"].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add("dragover"); })
  );
  ["dragleave", "drop"].forEach(ev =>
    zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove("dragover"); })
  );
  zone.addEventListener("drop", e => {
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    _markFileChosen(zone, file.name, labelEl);
  });
}

function _markFileChosen(zone, name, labelEl) {
  zone.classList.add("has-file");
  if (labelEl) labelEl.textContent = name;
}

// ── Image preview ──────────────────────────────────────────────────────────

function setupImagePreview(input, previewEl, zone) {
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    previewEl.src = url;
    zone.classList.add("has-file");
  });
}

// ── Form submission ────────────────────────────────────────────────────────

const form          = document.getElementById("uploadForm");
const loadingOverlay= document.getElementById("loadingOverlay");
const loadingTitle  = document.getElementById("loadingTitle");
const loadingStep   = document.getElementById("loadingStep");
const resultsPanel  = document.getElementById("resultsPanel");
const errorPanel    = document.getElementById("errorPanel");
const errorMsg      = document.getElementById("errorMsg");

const LOADING_STEPS = [
  ["Transcribing / parsing input…",  "Reading your transcript or audio file"],
  ["Analysing with Claude…",          "Extracting key takeaways and top quotes"],
  ["Generating slides…",              "Creating your PPTX with image overlays"],
  ["Building quote cards…",           "Rendering high-res PNG cards for campus screens"],
  ["Packaging your assets…",          "Zipping everything up for download"],
];

let stepTimer = null;

function startLoadingAnimation() {
  loadingOverlay.classList.remove("hidden");
  let i = 0;
  const tick = () => {
    [loadingTitle.textContent, loadingStep.textContent] = LOADING_STEPS[i];
    i = (i + 1) % LOADING_STEPS.length;
    stepTimer = setTimeout(tick, 4500);
  };
  tick();
}

function stopLoadingAnimation() {
  clearTimeout(stepTimer);
  loadingOverlay.classList.add("hidden");
}

form.addEventListener("submit", async e => {
  e.preventDefault();

  errorPanel.classList.add("hidden");
  resultsPanel.classList.add("hidden");
  startLoadingAnimation();

  const fd = new FormData(form);

  try {
    const res = await fetch("/process", { method: "POST", body: fd });
    const data = await res.json();
    stopLoadingAnimation();

    if (!res.ok) {
      showError(data.detail || "An unexpected error occurred.");
      return;
    }

    renderResults(data);
  } catch (err) {
    stopLoadingAnimation();
    showError("Network error — please check your connection and try again.");
  }
});

// ── Render results ─────────────────────────────────────────────────────────

function renderResults(data) {
  const { analysis, download_url } = data;

  // Download link
  document.getElementById("downloadBtn").href = download_url;

  // Caption
  document.getElementById("captionText").textContent =
    analysis.social_media_intro || "";

  // Takeaways
  let tkText = "";
  (analysis.takeaways || []).forEach(t => {
    tkText += `${t.number})  ${t.headline}\n\n`;
    (t.sub_bullets || []).forEach(b => {
      tkText += `   • ${b.bold_phrase}.  ${b.body}\n`;
    });
    tkText += "\n";
  });
  document.getElementById("takeawaysText").textContent = tkText.trim();

  // Quotes
  const qc = document.getElementById("quotesContainer");
  qc.innerHTML = "";
  (analysis.quotes || []).forEach(q => {
    const div = document.createElement("div");
    div.className = "quote-preview-item";
    div.innerHTML = `
      <p class="quote-text">${escHtml(q.text)}</p>
      ${q.speaker && q.speaker.toLowerCase() !== "unknown"
        ? `<p class="quote-speaker">${escHtml(q.speaker)}</p>` : ""}
      ${q.rationale
        ? `<p class="quote-rationale">${escHtml(q.rationale)}</p>` : ""}
    `;
    qc.appendChild(div);
  });

  resultsPanel.classList.remove("hidden");
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Copy buttons ───────────────────────────────────────────────────────────

document.addEventListener("click", e => {
  const btn = e.target.closest(".btn-copy");
  if (!btn) return;
  const target = document.getElementById(btn.dataset.target);
  if (!target) return;
  navigator.clipboard.writeText(target.textContent).then(() => {
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 2000);
  });
});

// ── New analysis ───────────────────────────────────────────────────────────

document.getElementById("newAnalysisBtn").addEventListener("click", () => {
  resultsPanel.classList.add("hidden");
  errorPanel.classList.add("hidden");
  form.reset();

  // Reset dropzone visuals
  document.querySelectorAll(".dropzone").forEach(z => z.classList.remove("has-file"));
  document.querySelectorAll(".img-preview").forEach(img => { img.src = ""; });
  document.querySelectorAll(".dropzone-label").forEach((el, i) => {
    if (i === 0) el.textContent = "Click or drag file here";
    else el.textContent = `Image ${i}${i === 3 ? " (optional)" : ""}`;
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
});

// ── Error display ──────────────────────────────────────────────────────────

function showError(msg) {
  errorMsg.textContent = msg;
  errorPanel.classList.remove("hidden");
  errorPanel.scrollIntoView({ behavior: "smooth" });
}

// ── Utility ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Init ───────────────────────────────────────────────────────────────────

const transcriptZone  = document.getElementById("transcriptZone");
const transcriptInput = document.getElementById("transcriptInput");
const transcriptLabel = document.getElementById("transcriptLabel");
setupDropzone(transcriptZone, transcriptInput, transcriptLabel);

for (let i = 1; i <= 3; i++) {
  const zone    = document.getElementById(`imageZone${i}`);
  const input   = document.getElementById(`imageInput${i}`);
  const preview = document.getElementById(`preview${i}`);
  setupDropzone(zone, input, null);
  setupImagePreview(input, preview, zone);
}
