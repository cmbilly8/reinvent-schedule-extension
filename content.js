const STORAGE_KEY = "sessions";

const state = {
  sessions: new Map(),
  open: false,
  day: RIV.DAYS[0],
};

const latest = new WeakMap();

const DAY_CLASS = {
  "day-monday-nov-30": "Monday, Nov 30",
  "day-tuesday-dec-1": "Tuesday, Dec 1",
  "day-wednesday-dec-2": "Wednesday, Dec 2",
  "day-thursday-dec-3": "Thursday, Dec 3",
  "day-friday-dec-4": "Friday, Dec 4",
};

const VENUE_CLASS = {
  "venue-caesars-forum": "Caesars Forum",
  "venue-caesars-palace": "Caesars Palace",
  "venue-mgm-grand": "MGM Grand",
  "venue-wynn-encore": "Wynn/Encore",
  "venue-venetian": "Venetian",
};

function text(root, selector) {
  const node = root.querySelector(selector);
  return node ? node.textContent : "";
}

function classValue(card, map) {
  for (const name of card.classList) {
    if (map[name]) return map[name];
  }
  return "";
}

function fiberOf(node) {
  const key = Object.keys(node).find((name) => name.startsWith("__reactFiber") || name.startsWith("__reactInternalInstance"));
  return key ? node[key] : null;
}

function findSession(value, depth) {
  if (!value || depth > 5) return null;
  if (typeof value.sessionID === "string" && value.sessionID) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSession(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  for (const key of ["session", "item", "items"]) {
    if (!value[key]) continue;
    const found = findSession(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function sessionFromFiber(card) {
  let fiber = fiberOf(card);
  for (let step = 0; fiber && step < 30; step += 1, fiber = fiber.return) {
    const props = fiber.memoizedProps || fiber.pendingProps;
    const session = findSession(props, 0);
    if (session) return session;
  }
  return null;
}

function venueFromAttributes(session) {
  const values = session && session.attributevalues;
  if (!Array.isArray(values)) return "";
  const venue = values.find((value) => /venue/i.test(value.attribute || ""));
  return venue ? String(venue.value || "").replace(/\s+/g, " ").trim() : "";
}

function readCard(card) {
  const fields = RIV.readFields({
    id: card.getAttribute("data-session-id") || "",
    title: text(card, ".title-text"),
    date: text(card, ".session-date"),
    time: text(card, ".session-time"),
    venue: text(card, ".attribute-Venue .attribute-values") || text(card, ".badge.rf-venue"),
    level: text(card, ".badge.rf-level"),
    format: text(card, ".badge.rf-type"),
  });
  const session = fields.start == null && card.dataset.rivChecked !== "1" ? sessionFromFiber(card) : null;
  if (session) card.dataset.rivChecked = "1";
  const recorded = RIV.fromTimeRecord(RIV.pickTime(session));
  return {
    ...fields,
    date: fields.date || recorded.date || classValue(card, DAY_CLASS),
    time: fields.time || recorded.time,
    start: fields.start ?? recorded.start,
    end: fields.end ?? recorded.end,
    venue: fields.venue || venueFromAttributes(session) || recorded.venue || classValue(card, VENUE_CLASS),
  };
}

function loadSessions() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (stored) => {
      const list = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
      state.sessions = new Map(list.map((session) => [session.id, session]));
      resolve();
    });
  });
}

function saveSessions() {
  chrome.storage.local.set({ [STORAGE_KEY]: [...state.sessions.values()] });
}

function decorate(card) {
  if (card.dataset.rivTime === "1") {
    paintCard(card);
    return;
  }
  const session = readCard(card);
  if (!session.title) return;
  latest.set(card, session);
  card.dataset.riv = "1";
  card.dataset.rivId = session.id;
  if (session.start != null) card.dataset.rivTime = "1";

  let meta = card.querySelector(":scope > .riv-meta");
  if (!meta) {
    meta = document.createElement("div");
    meta.className = "riv-meta";
    meta.innerHTML = `
      <div class="riv-meta-text">
        <span class="riv-when"></span>
        <span class="riv-venue"></span>
      </div>
      <button type="button" class="riv-add"></button>
    `;
    const title = card.querySelector(".catalog-result-title");
    (title || card).insertAdjacentElement("afterend", meta);
    meta.querySelector(".riv-add").addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = latest.get(card);
      if (current) toggleSession(current);
    });
  }
  const when = [session.date, session.time].filter(Boolean).join(" · ");
  meta.querySelector(".riv-when").textContent = when || "Time not listed";
  meta.querySelector(".riv-venue").textContent = session.venue || "Venue not listed";
  paintCard(card);
}

function paintCard(card) {
  const button = card.querySelector(".riv-add");
  if (!button) return;
  const saved = state.sessions.has(card.dataset.rivId);
  card.classList.toggle("riv-scheduled", saved);
  button.textContent = saved ? "Remove" : "Add";
}

function paintAllCards() {
  document.querySelectorAll("li.catalog-result[data-riv='1']").forEach(paintCard);
}

function toggleSession(session) {
  if (state.sessions.has(session.id)) state.sessions.delete(session.id);
  else state.sessions.set(session.id, session);
  if (session.date && RIV.DAYS.includes(session.date)) state.day = session.date;
  saveSessions();
  paintAllCards();
  renderPanel();
}

function scan() {
  document.querySelectorAll("li.catalog-result").forEach(decorate);
}

function ensurePanel() {
  let panel = document.getElementById("riv-panel");
  if (panel) return panel;
  panel = document.createElement("aside");
  panel.id = "riv-panel";
  panel.innerHTML = `
    <button type="button" id="riv-toggle">Schedule</button>
    <div id="riv-body">
      <header id="riv-header">
        <h2>Your week</h2>
        <button type="button" id="riv-clear">Clear</button>
      </header>
      <div id="riv-days"></div>
      <div id="riv-timeline"></div>
    </div>
  `;
  document.body.appendChild(panel);
  panel.querySelector("#riv-toggle").addEventListener("click", () => {
    state.open = !state.open;
    panel.classList.toggle("riv-open", state.open);
  });
  panel.querySelector("#riv-clear").addEventListener("click", () => {
    state.sessions.clear();
    saveSessions();
    paintAllCards();
    renderPanel();
  });
  return panel;
}

function renderPanel() {
  const panel = ensurePanel();
  panel.classList.toggle("riv-open", state.open);
  const count = state.sessions.size;
  panel.querySelector("#riv-toggle").textContent = count ? `Schedule (${count})` : "Schedule";

  const days = panel.querySelector("#riv-days");
  days.replaceChildren();
  for (const day of RIV.DAYS) {
    const countForDay = [...state.sessions.values()].filter((session) => session.date === day).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = day === state.day ? "riv-day riv-day-active" : "riv-day";
    const short = { Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed", Thursday: "Thu", Friday: "Fri" };
    const label = short[day.split(",")[0]] || day;
    button.textContent = countForDay ? `${label} ${countForDay}` : label;
    button.addEventListener("click", () => {
      state.day = day;
      renderPanel();
    });
    days.appendChild(button);
  }

  const timeline = panel.querySelector("#riv-timeline");
  timeline.replaceChildren();
  const daySessions = [...state.sessions.values()].filter((session) => session.date === state.day);
  const { placed, untimed } = RIV.layoutDay(daySessions);
  const issues = RIV.issuesFor(daySessions);

  const span = RIV.DAY_END - RIV.DAY_START;
  const hours = document.createElement("div");
  hours.className = "riv-hours";
  hours.style.height = `${span}px`;
  for (let minute = RIV.DAY_START; minute <= RIV.DAY_END; minute += 60) {
    const label = document.createElement("div");
    label.className = "riv-hour";
    label.style.top = `${minute - RIV.DAY_START}px`;
    label.textContent = RIV.formatMinutes(minute);
    hours.appendChild(label);
  }
  timeline.appendChild(hours);

  const track = document.createElement("div");
  track.className = "riv-track";
  track.style.height = `${span}px`;
  for (const item of placed) {
    const { session, column, columnCount } = item;
    const block = document.createElement("button");
    block.type = "button";
    block.className = "riv-block";
    const top = Math.max(0, session.start - RIV.DAY_START);
    const height = Math.max(28, session.end - session.start);
    block.style.top = `${top}px`;
    block.style.height = `${height}px`;
    block.style.left = `calc(${(column / columnCount) * 100}% + 2px)`;
    block.style.width = `calc(${100 / columnCount}% - 4px)`;
    const issue = issues.get(session.id);
    if (issue) block.classList.add(issue.startsWith("Overlaps") ? "riv-overlap" : "riv-tight");
    block.innerHTML = `
      <strong>${session.code || "Session"}</strong>
      <span>${session.time}</span>
      <span>${session.venue || "Venue not listed"}</span>
      <em>${session.title}</em>
      ${issue ? `<small>${issue}</small>` : ""}
    `;
    block.addEventListener("click", () => toggleSession(session));
    track.appendChild(block);
  }
  timeline.appendChild(track);

  if (untimed.length) {
    const note = document.createElement("div");
    note.className = "riv-untimed";
    note.textContent = untimed.map((session) => session.code || session.title).join(", ");
    note.title = "These sessions have no start time in the catalog, so they are not on the timeline.";
    timeline.appendChild(note);
  }

  if (!daySessions.length) {
    const empty = document.createElement("p");
    empty.className = "riv-empty";
    empty.textContent = "Add a session from the catalog. Time and venue are read from the card.";
    timeline.appendChild(empty);
  }
}

function watch() {
  let pending = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(scan);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

loadSessions().then(() => {
  scan();
  renderPanel();
  watch();
});
