const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { Script } = require("node:vm");

globalThis.RIV = undefined;
new Script(readFileSync(`${__dirname}/model.js`, "utf8")).runInThisContext();
const { readFields, layoutDay, issuesFor, toMinutes } = globalThis.RIV;

const session = readFields({
  id: "abc",
  title: "The judgment gap (COM302)",
  date: "Monday, Nov 30",
  time: "1:30 PM - 2:30 PM PST",
  venue: "Caesars Forum",
  level: "300 – Advanced",
  format: "Chalk talk",
});

assert.equal(session.code, "COM302");
assert.equal(session.title, "The judgment gap");
assert.equal(session.start, toMinutes("1:30 PM"));
assert.equal(session.end, toMinutes("2:30 PM"));
assert.equal(session.time.includes("PST"), false);

const overlapping = layoutDay([
  readFields({ id: "a", title: "A (AAA100)", date: "Monday, Nov 30", time: "1:00 PM - 2:00 PM", venue: "MGM Grand" }),
  readFields({ id: "b", title: "B (BBB100)", date: "Monday, Nov 30", time: "1:30 PM - 2:30 PM", venue: "MGM Grand" }),
]);
assert.equal(overlapping.placed.length, 2);
assert.equal(overlapping.placed[0].columnCount, 2);
assert.notEqual(overlapping.placed[0].column, overlapping.placed[1].column);

const travel = issuesFor([
  readFields({ id: "c", title: "C (COP406)", date: "Monday, Nov 30", time: "8:30 AM - 9:30 AM", venue: "Wynn/Encore" }),
  readFields({ id: "n", title: "N (NET217)", date: "Monday, Nov 30", time: "10:00 AM - 11:00 AM", venue: "MGM Grand" }),
]);
assert.match(travel.get("n"), /30 min shuttle/);

const walk = issuesFor([
  readFields({ id: "s", title: "S (STG342)", date: "Monday, Nov 30", time: "3:00 PM - 4:00 PM", venue: "Caesars Forum" }),
  readFields({ id: "v", title: "V (SVS322)", date: "Monday, Nov 30", time: "4:30 PM - 5:30 PM", venue: "Caesars Forum" }),
]);
assert.equal(walk.has("v"), false);

console.log("model tests passed");
