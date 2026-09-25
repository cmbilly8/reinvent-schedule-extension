globalThis.RIV = (() => {
  const DAY_START = 8 * 60;
  const DAY_END = 19 * 60;
  const CODE = /\(([A-Z]{2,5}\d{3,4}(?:-[A-Z0-9]+)?)\)\s*$/;

  const DAYS = [
    "Monday, Nov 30",
    "Tuesday, Dec 1",
    "Wednesday, Dec 2",
    "Thursday, Dec 3",
    "Friday, Dec 4",
  ];

  function toMinutes(clock) {
    const match = String(clock).trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
    if (!match) return null;
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + Number(match[2]);
  }

  function formatMinutes(minutes) {
    const hour24 = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour = hour24 % 12 || 12;
    return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function campus(venue) {
    const value = (venue || "").toLowerCase();
    if (value.includes("forum") || value.includes("palace")) return "caesars";
    if (value.includes("mgm")) return "mgm";
    if (value.includes("wynn") || value.includes("encore")) return "wynn";
    if (value.includes("venetian")) return "venetian";
    return "";
  }

  function parseTimeRange(time) {
    const match = String(time || "").match(
      /(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i,
    );
    if (!match) return { start: null, end: null, time: "" };
    return {
      start: toMinutes(match[1]),
      end: toMinutes(match[2]),
      time: `${match[1].toUpperCase().replace(/\s+/g, " ")} - ${match[2].toUpperCase().replace(/\s+/g, " ")}`,
    };
  }

  function readFields(fields) {
    const titleRaw = (fields.title || "").replace(/\s+/g, " ").trim();
    const codeMatch = titleRaw.match(CODE);
    const code = codeMatch ? codeMatch[1] : "";
    const title = codeMatch ? titleRaw.slice(0, codeMatch.index).trim() : titleRaw;
    const range = parseTimeRange(fields.time);
    return {
      id: fields.id || code || title,
      code,
      title,
      date: (fields.date || "").replace(/\s+/g, " ").trim(),
      time: range.time,
      start: range.start,
      end: range.end,
      venue: (fields.venue || "").replace(/\s+/g, " ").trim(),
      level: (fields.level || "").replace(/\s+/g, " ").trim(),
      format: (fields.format || "").replace(/\s+/g, " ").trim(),
    };
  }

  function layoutDay(sessions) {
    const timed = sessions
      .filter((session) => session.start != null && session.end != null)
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const columnEnds = [];
    const placed = timed.map((session) => {
      let column = columnEnds.findIndex((end) => end <= session.start);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(session.end);
      } else {
        columnEnds[column] = session.end;
      }
      return { session, column };
    });
    const columnCount = Math.max(1, columnEnds.length);
    return {
      placed: placed.map((item) => ({ ...item, columnCount })),
      untimed: sessions.filter((session) => session.start == null || session.end == null),
    };
  }

  function issuesFor(sessions) {
    const timed = sessions
      .filter((session) => session.start != null && session.end != null)
      .slice()
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const issues = new Map();
    for (let i = 0; i < timed.length; i += 1) {
      for (let j = i + 1; j < timed.length; j += 1) {
        const earlier = timed[i];
        const later = timed[j];
        if (later.start >= earlier.end) break;
        issues.set(earlier.id, "Overlaps another session");
        issues.set(later.id, "Overlaps another session");
      }
    }
    for (let i = 0; i < timed.length - 1; i += 1) {
      const current = timed[i];
      const next = timed.find((session, index) => index > i && session.start >= current.end);
      if (!next || !current.venue || !next.venue) continue;
      const gap = next.start - current.end;
      const sameBuilding = current.venue.toLowerCase() === next.venue.toLowerCase();
      if (sameBuilding) continue;
      const sameComplex = campus(current.venue) === "caesars" && campus(next.venue) === "caesars";
      const tight = sameComplex ? gap < 15 : gap < 40;
      if (!tight) continue;
      const note = sameComplex
        ? `${gap} min walk from ${current.code || "the previous session"}`
        : `${gap} min shuttle from ${current.code || "the previous session"}`;
      if (!issues.has(next.id)) issues.set(next.id, note);
    }
    return issues;
  }

  return {
    DAYS,
    DAY_START,
    DAY_END,
    toMinutes,
    formatMinutes,
    readFields,
    layoutDay,
    issuesFor,
  };
})();
