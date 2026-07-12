// Headless-Smoke-Test der App (jsdom). Aufruf: node smoke_test.js
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const plan = fs.readFileSync("plan.json", "utf8");

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://example.github.io/fitness-app/",
  beforeParse(win) {
    win.fetch = async (url) => {
      if (String(url).includes("plan.json"))
        return { ok: true, json: async () => JSON.parse(plan) };
      return { ok: false, status: 404, text: async () => "nf" };
    };
    win.AudioContext = class { resume(){} get currentTime(){return 0}
      createOscillator(){ return {type:"",frequency:{value:0},connect(){return this},start(){},stop(){}} }
      createGain(){ return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this}} }
      get destination(){ return {} } };
    win.HTMLDialogElement.prototype.showModal = function(){ this.open = true; };
    win.HTMLDialogElement.prototype.close = function(){ this.open = false; };
  },
});

const w = dom.window, d = w.document;
const fails = [];
const check = (name, cond) => { console.log((cond ? "PASS" : "FAIL") + "  " + name); if (!cond) fails.push(name); };

setTimeout(() => {
  // Heute ist im Test der reale Tag; setze gezielt Datum Di W12
  const pick = d.querySelector("#datePick");
  pick.value = "2026-07-14";
  pick.dispatchEvent(new w.Event("change"));

  check("Session-Label Di W12", d.querySelector("#sessionLabel").textContent.includes("Di") && d.querySelector("#sessionLabel").textContent.includes("12"));
  check("Equipment: Kurzhanteln 2x 10 kg", d.querySelector("#equipList").textContent.includes("2x 10 kg"));
  check("Equipment: KB 22 kg", d.querySelector("#equipList").textContent.includes("22 kg"));
  check("Warm-up: 6 Übungen gelistet", d.querySelectorAll("#warmupList li").length === 6);
  const codes = [...d.querySelectorAll(".excode")].map(x => x.textContent);
  check("Übungspaare A1..C2", ["A1","A2","B1","B2","C1","C2"].every(c => codes.includes(c)));
  check("A1 = KB-Rudern 4 Set-Felder", d.querySelectorAll('.setrow[data-code="A1"] input[data-set]').length === 4);
  check("C1 = Pallof 2 Set-Felder", d.querySelectorAll('.setrow[data-code="C1"] input[data-set]').length === 2);
  check("YouTube-Link vorhanden", [...d.querySelectorAll("#blocksHost a")].some(a => a.href.includes("youtube.com")));
  check("Beschreibung ausklappbar", d.querySelectorAll("#blocksHost details").length >= 5);

  // Kein Trainingstag: So 12.07.
  pick.value = "2026-07-12";
  pick.dispatchEvent(new w.Event("change"));
  check("So = kein Trainingstag", !d.querySelector("#noSession").classList.contains("hidden"));
  check("Nächste Einheit = Di 14.07.", d.querySelector("#noSessionMsg").textContent.includes("14.07.2026"));

  // Woche 15 Sa = letzte Einheit 08.08.
  pick.value = "2026-08-08";
  pick.dispatchEvent(new w.Event("change"));
  check("Sa W15 gefunden", d.querySelector("#sessionLabel").textContent.includes("15"));
  check("W15: Floor Press 2x 15-16 kg", d.querySelector("#equipList").textContent.includes("15-16 kg"));

  // Nach W15: kein Plan
  pick.value = "2026-08-11";
  pick.dispatchEvent(new w.Event("change"));
  check("Nach Planende: Hinweis", !d.querySelector("#noSession").classList.contains("hidden"));

  // Do-Session: Langhantel-Hinweis
  pick.value = "2026-07-16";
  pick.dispatchEvent(new w.Event("change"));
  check("Do: Langhantel-Tag-Hinweis", d.querySelector("#equipList").textContent.includes("Langhantel-Tag"));
  check("Do Warm-up: je-Seite verdoppelt (5 Übungen, 6 Timer-Segmente)",
    d.querySelectorAll("#warmupList li").length === 6);

  // Timer-Queue-Logik direkt prüfen
  const q = w.eval("buildTimerQueue(currentSession)");
  const works = q.filter(x => x.type === "work");
  const pauses = q.filter(x => x.type === "pause");
  check("Timer: work-Segmente = 6 (Split Squat Stretch li+re)", works.length === 6);
  check("Timer: 5s-Pausen zwischen Übungen", pauses.every(p => p.seconds === 5) && pauses.length === works.length - 1);
  check("Timer: alle Übungen 30s", works.every(x => x.seconds === 30));

  // Reps-Eintrag + collectEntry
  pick.value = "2026-07-14";
  pick.dispatchEvent(new w.Event("change"));
  const inp = d.querySelector('.setrow[data-code="A1"] input[data-set="0"]');
  inp.value = "8/8";
  inp.dispatchEvent(new w.Event("input"));
  const entry = w.eval("collectEntry()");
  check("collectEntry: A1 reps[0]=8/8", entry.entries.A1 && entry.entries.A1.reps[0] === "8/8");
  check("collectEntry: Datum/Woche/Tag", entry.date === "2026-07-14" && entry.week === 12 && entry.day === "Di");
  check("Draft in localStorage", !!w.localStorage.getItem("ffp_draft_2026-07-14"));

  // dateForSession-Verschiebung: week12Monday +7 Tage
  w.localStorage.setItem("ffp_cfg", JSON.stringify({week12Monday: "2026-07-20"}));
  pick.value = "2026-07-21";
  pick.dispatchEvent(new w.Event("change"));
  check("Planstart verschoben: 21.07. = Di W12", d.querySelector("#sessionLabel").textContent.includes("12"));

  console.log(fails.length ? `\n${fails.length} FEHLER` : "\nALLE TESTS BESTANDEN");
  process.exit(fails.length ? 1 : 0);
}, 300);
