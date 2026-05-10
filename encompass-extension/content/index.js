(() => {
  const STORAGE_KEY = "roadrunnerEncompassCapture";
  const DEFAULT_SETTINGS = {
    appBaseUrl: "http://localhost:3000",
    ingestKey: ""
  };

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function findModelNumber() {
    const urlMatch = location.href.match(/\b[A-Z]{2,6}[A-Z0-9]{5,20}\b/i);
    if (urlMatch) return urlMatch[0].toUpperCase();

    const text = normalizeText(document.title + " " + document.body.innerText);
    const modelMatch = text.match(/\b[A-Z]{2,6}[A-Z0-9]{5,20}\b/);
    return modelMatch ? modelMatch[0].toUpperCase() : null;
  }

  function findDiagramName() {
    const candidates = Array.from(document.querySelectorAll("h1, h2, h3, [aria-current='page']"))
      .map((node) => normalizeText(node.textContent))
      .filter(Boolean);
    return candidates[0] || null;
  }

  function extractPartNumber(text) {
    const partMatch = text.match(/\b(?:WE|WH|WD|WB|WR|WZ|GE|HOT)[A-Z0-9]{3,16}\b/i);
    return partMatch ? partMatch[0].toUpperCase() : null;
  }

  function extractRows() {
    const modelNumber = findModelNumber();
    const diagramName = findDiagramName();
    const rowNodes = Array.from(document.querySelectorAll("tr, [role='row']"));
    const rows = [];
    const seen = new Set();

    for (const node of rowNodes) {
      const cells = Array.from(node.querySelectorAll("td, th, [role='cell'], [role='gridcell']"))
        .map((cell) => normalizeText(cell.textContent))
        .filter(Boolean);
      const rawText = normalizeText(cells.length ? cells.join(" | ") : node.textContent);
      if (!rawText || rawText.length < 8) continue;

      const partNumber = extractPartNumber(rawText);
      if (!partNumber) continue;

      const callout = cells.find((cell) => /^\d{1,5}[A-Z]?$/.test(cell)) || null;
      const price = (rawText.match(/\$\s?\d+(?:\.\d{2})?/) || [null])[0];
      const description =
        cells.find((cell) => cell !== callout && cell !== partNumber && !cell.includes("$") && cell.length > 2) ||
        rawText.replace(partNumber, "").replace(price || "", "").trim() ||
        null;

      const key = `${diagramName || ""}|${callout || ""}|${partNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);

      rows.push({
        source: "encompass",
        sourceUrl: location.href,
        modelNumber,
        diagramName,
        callout,
        partNumber,
        description,
        price,
        availability: /in stock|backorder|no longer available|ships/i.test(rawText)
          ? rawText.match(/in stock|backorder|no longer available|ships[^|]*/i)?.[0] || null
          : null,
        rawText,
        confidence: {
          partNumber: 0.9,
          description: description ? 0.7 : null,
          price: price ? 0.8 : null,
          callout: callout ? 0.8 : null
        }
      });
    }

    return rows;
  }

  async function getSettings() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] || {}) };
  }

  async function saveSettings(settings) {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  }

  async function configure() {
    const current = await getSettings();
    const appBaseUrl = prompt("Roadrunner app base URL", current.appBaseUrl);
    if (!appBaseUrl) return current;

    const ingestKey = prompt("BOM capture ingest key", current.ingestKey);
    const next = {
      appBaseUrl: appBaseUrl.replace(/\/+$/, ""),
      ingestKey: ingestKey || ""
    };
    await saveSettings(next);
    setStatus("Settings saved.");
    return next;
  }

  async function pushRows() {
    const settings = await getSettings();
    if (!settings.ingestKey) {
      await configure();
    }

    const nextSettings = await getSettings();
    const rows = extractRows().filter((row) => row.partNumber && row.description);
    if (!rows.length) {
      setStatus("No reviewed part rows found on this page.");
      return;
    }

    setStatus(`Pushing ${rows.length} rows...`);

    const response = await fetch(`${nextSettings.appBaseUrl}/api/bom/captured-parts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bom-ingest-key": nextSettings.ingestKey
      },
      body: JSON.stringify({
        sourceUrl: location.href,
        modelNumber: findModelNumber(),
        diagramName: findDiagramName(),
        rows
      })
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) {
      throw new Error(json.error || `Push failed with ${response.status}`);
    }

    setStatus(`Pushed ${json.count || rows.length} rows. Session ${json.sessionId || "created"}.`);
  }

  function setStatus(message) {
    const status = document.getElementById("rr-encompass-status");
    if (status) status.textContent = message;
  }

  function mountPanel() {
    if (document.getElementById("rr-encompass-capture")) return;

    const panel = document.createElement("div");
    panel.id = "rr-encompass-capture";
    panel.innerHTML = `
      <style>
        #rr-encompass-capture {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 2147483647;
          width: 260px;
          padding: 12px;
          border: 1px solid #1f2937;
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 12px 32px rgba(15, 23, 42, 0.22);
          color: #111827;
          font: 13px/1.4 Arial, sans-serif;
        }
        #rr-encompass-capture strong {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
        }
        #rr-encompass-capture button {
          margin: 0 6px 8px 0;
          padding: 6px 8px;
          border: 1px solid #334155;
          border-radius: 6px;
          background: #0f172a;
          color: #ffffff;
          cursor: pointer;
          font: inherit;
        }
        #rr-encompass-capture button.secondary {
          background: #ffffff;
          color: #0f172a;
        }
        #rr-encompass-status {
          min-height: 18px;
          color: #374151;
        }
      </style>
      <strong>Roadrunner Encompass Capture</strong>
      <button type="button" id="rr-encompass-push">Push Rows</button>
      <button type="button" class="secondary" id="rr-encompass-configure">Configure</button>
      <div id="rr-encompass-status">Ready.</div>
    `;

    document.documentElement.appendChild(panel);
    document.getElementById("rr-encompass-configure").addEventListener("click", () => {
      configure().catch((error) => setStatus(error.message));
    });
    document.getElementById("rr-encompass-push").addEventListener("click", () => {
      pushRows().catch((error) => setStatus(error.message));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountPanel, { once: true });
  } else {
    mountPanel();
  }
})();
