// Headless-Smoke-Test der App (jsdom). Aufruf: node smoke_test.js  (aus fitness-app/ heraus)
//
// STAND 03.10.2026 auf den Oktober-Zyklus (W26-29, Brustzerrung-Wiedereinstieg) umgestellt.
// Teil 1 prueft jetzt den Stufenplan fuer die Brust; Zeitmodell um Isometrie, Weste-Squat und
// wochenabhaengige Zuschlaege (Kasten nur mit Klimmzug, Scheibenwechsel nur mit Floor Press) erweitert.
// Die September-Fassung liegt als smoke_test.september.bak.js daneben.
//
// STAND 28.08.2026 auf den September-Zyklus (W21-24) umgestellt; Teil 1 um Klimmzug,
// Face Pull, Treppen-Weste und die Physio-Warm-up-Uebungen erweitert.
// STAND 16.08.2026 neu geschrieben. Der alte Test stammte aus dem Juli-Zyklus und pruefte
// Uebungen, die es nicht mehr gibt (einarmiges KB-Rudern, Pallof als C1, Wochen 12-15).
// Er schlug schon vor jeder Aenderung 15x fehl und war damit wertlos.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const planRaw = fs.readFileSync("plan.json", "utf8");
const plan = JSON.parse(planRaw);

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "https://example.github.io/fitness-app/",
  beforeParse(win) {
    win.fetch = async (url) => {
      if (String(url).includes("plan.json"))
        return { ok: true, json: async () => JSON.parse(planRaw) };
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
const check = (name, cond, detail) => {
  console.log((cond ? "PASS" : "FAIL") + "  " + name + (!cond && detail !== undefined ? "  -> " + detail : ""));
  if (!cond) fails.push(name);
};
const goto = (iso) => { const p = d.querySelector("#datePick"); p.value = iso; p.dispatchEvent(new w.Event("change")); };

/* =================================================================
   TEIL 1 - Planinhalt (unabhaengig von der App)
   ================================================================= */
const W = [26,27,28,29];
const all = plan.sessions.flatMap(s => s.blocks.flatMap(b => b.exercises.map(e => ({s, b, e}))));
const inWeek = (w, re) => all.filter(x => x.s.week === w && re.test(x.e.name));
check("12 Sessions", plan.sessions.length === 12, plan.sessions.length);
check("Wochen 26-29", JSON.stringify(plan.meta.weeks) === "[26,27,28,29]", JSON.stringify(plan.meta.weeks));
check("Anker week12Monday = 2026-06-29", plan.meta.week12Monday === "2026-06-29", plan.meta.week12Monday);
check("Jede Woche Di/Do/Sa", W.every(w => plan.sessions.filter(s => s.week === w).map(s => s.day).join(",") === "Di,Do,Sa"));

const perSideWU = plan.sessions.flatMap(s => s.warmup.filter(x => x.perSide).map(x => `W${s.week}${s.day}:${x.name}`));
check("Warm-up: keine 'je Seite'-Uebung", perSideWU.length === 0, perSideWU.join(", "));

const westeKonflikt = [];
plan.sessions.forEach(s => s.blocks.forEach(b => {
  if (b.exercises.length < 2) return;
  const mit = b.exercises.filter(e => /Gewichtsweste/i.test(e.resistance || "")).length;
  if (mit > 0 && mit < b.exercises.length) westeKonflikt.push(`W${s.week} ${s.day} ${b.block}`);
}));
check("Gewichtsweste in keinem Superset", westeKonflikt.length === 0, westeKonflikt.join(", "));

const codeKollision = [];
plan.sessions.forEach(s => {
  const codes = s.blocks.flatMap(b => b.exercises.map(e => e.code));
  if (new Set(codes).size !== codes.length) codeKollision.push(`W${s.week} ${s.day}: ${codes.join(",")}`);
});
check("Uebungscodes je Session eindeutig", codeKollision.length === 0, codeKollision.join(" | "));

/* ---- BRUST-STUFENPLAN nach der Zerrung vom 29.09.2026 ---- */
const BRUST_DYN = /Floor Press|Chest-Press|Liegestütz|Klimmzug|Face Pull/;
check("W26: keine dynamische Brust-/Dehnungsuebung (Floor Press, Chest-Press, Liegestuetz, Klimmzug, Face Pull)",
  inWeek(26, BRUST_DYN).length === 0, inWeek(26, BRUST_DYN).map(x => x.s.day + ":" + x.e.name).join(", "));
const iso = all.filter(x => /Isometrisches Brustdrücken/.test(x.e.name));
check("Isometrie nur in W26, an allen drei Tagen", iso.every(x => x.s.week === 26) &&
  iso.map(x => x.s.day).join(",") === "Di,Do,Sa", iso.map(x => `W${x.s.week}${x.s.day}`).join(","));
check("Isometrie steigt 30-50 / 50-70 / 70-100 %",
  /30-50 %/.test(iso[0].e.resistance) && /50-70 %/.test(iso[1].e.resistance) && /70-100 %/.test(iso[2].e.resistance));
check("Gate-Test steht am Sa W26", iso[2].s.day === "Sa" && /GATE/.test(iso[2].e.resistance) &&
  plan.sessions.find(s => s.week === 26 && s.day === "Sa").blocks.some(b => /GATE VOR W27/.test(b.note)));
const fp = all.filter(x => /Floor Press/.test(x.e.name));
check("Floor Press 2x12 -> 2x16 -> 2x20 kg (W27-29, nur Di)",
  fp.map(x => `${x.s.week}${x.s.day}:${(x.e.resistance.match(/^2x(\d+) kg/)||[])[1]}`).join(",") === "27Di:12,28Di:16,29Di:20",
  fp.map(x => `${x.s.week}${x.s.day}:${x.e.resistance.slice(0,8)}`).join(","));
const liege = all.filter(x => /Liegestütz exzentrisch/.test(x.e.name));
check("Liegestuetz: W27 Knie (Di+Sa), W28/29 voll (Di+Sa)",
  liege.map(x => `${x.s.week}${x.s.day}:${/Knien/.test(x.e.name) ? "K" : "V"}`).join(",") === "27Di:K,27Sa:K,28Di:V,28Sa:V,29Di:V,29Sa:V",
  liege.map(x => `${x.s.week}${x.s.day}:${/Knien/.test(x.e.name) ? "K" : "V"}`).join(","));
check("Liegestuetze immer 3x10", liege.every(x => x.e.sets === 3 && x.e.targetReps === "10"));
check("Vorgabe enthaelt 'KEIN Hochdruecken' und 45-Grad-Ellbogen",
  liege.every(x => /KEIN Hochdrücken/.test(x.e.resistance) && /45 Grad/.test(x.e.resistance)));
check("Liegestuetz-Tempo Sa: 5 s (W27, W28), 6 s (W29); Di immer 4 s",
  liege.map(x => `${x.s.week}${x.s.day}:${(x.e.resistance.match(/(\d) s ablassen/)||[])[1]}`).join(",") === "27Di:4,27Sa:5,28Di:4,28Sa:5,29Di:4,29Sa:6",
  liege.map(x => `${x.s.week}${x.s.day}:${(x.e.resistance.match(/(\d) s ablassen/)||[])[1]}`).join(","));
const cp = all.filter(x => /Chest-Press/.test(x.e.name));
check("Chest-Press ROT (W27) -> DUNKELGRUEN (W28/29), nur Do",
  cp.map(x => `${x.s.week}${x.s.day}:${/ROT/.test(x.e.resistance) ? "ROT" : /DUNKELGRUEN/.test(x.e.resistance) ? "DG" : "?"}`).join(",") === "27Do:ROT,28Do:DG,29Do:DG",
  cp.map(x => `${x.s.week}${x.s.day}`).join(","));
const fpull = all.filter(x => /Face Pull/.test(x.e.name));
check("Face Pull W27-29 je Do + Sa (6x), Ellbogen auf Schulterhoehe",
  fpull.length === 6 && fpull.every(x => x.s.week >= 27 && /Schulterhoehe/.test(x.e.resistance)), fpull.length);
check("Band-Rudern ersetzt Face Pull in W26 (Do + Sa)",
  inWeek(26, /Band-Rudern/).map(x => x.s.day).join(",") === "Do,Sa");
check("BRUST-Schmerzregel in jedem Block mit Brust- oder Dehnungsarbeit",
  all.filter(x => /Isometrisches|Floor Press|Chest-Press|Liegestütz|Klimmzug|Face Pull/.test(x.e.name))
     .every(x => /BRUST RECHTS|GATE/.test(x.b.note)));
check("W26: Goblet ersetzt durch Weste-Squat",
  plan.sessions.filter(s => s.day === "Do").map(s => /Weste-Squat/.test(s.finish.text) ? "W" : /Goblet/.test(s.finish.text) ? "G" : "?").join("") === "WGGG");
check("W26: Pull-aparts im Warm-up ersetzt",
  plan.sessions.filter(s => s.week === 26 && s.day !== "Sa").every(s => !s.warmup.some(x => /Pull-aparts/.test(x.name) && !/OHNE Band/.test(x.name + x.note))));

/* ---- ZEITBUDGET (Franks Regel 28.08.2026) -------------------------------
   Eine Wdh. mit vorgegebener Exzentrik dauert MINDESTENS 4 s laenger als eine normale.
   normale Wdh. = 3 s | Exzentrik t s = 4 + t | exzentrisch-only = t + Rueckweg
   Treppen = 54,7 s je Auf-/Abstieg (gemessen 9:07 fuer 10 am 27.08.2026)
   Wechsel im Paar +8 s | Blockwechsel +40 s
   Dieser Test existiert, weil die Zeitangaben dreimal zu optimistisch waren. */
const NORM = 3, SWITCH = 8, BLOCK = 40, TREPPE = 54.7, BUDGET = 45 * 60;
const tempoOf = (r) => { const m = (r || "").match(/(\d+)\s*s\s*(exzentrisch|kontrolliert ablassen|ablassen)/); return m ? +m[1] : 0; };
const oberReps = (t) => { const m = String(t || "").match(/(\d+)\s*$/); return m ? +m[1] : 1; };
function repSeconds(e) {
  const t = tempoOf(e.resistance);
  if (/Kraniozervikale/.test(e.name)) return 10;
  if (/Isometrisch/.test(e.name)) return 10;          // Haltezeit x Wiederholungen (Franks Modell)
  if (/Klimmzug/.test(e.name)) return t + 8;          // ueber den Kasten hoch und wieder runter
  if (/Liegestütz/.test(e.name)) return t + 4;        // auf den Knien zurueck in die Ausgangsposition
  return t ? 4 + t : NORM;
}
function sessionSeconds(s) {
  let tot = s.warmup.reduce((a, x) => a + x.seconds * (x.perSide ? 2 : 1), 0) + 20;
  s.blocks.forEach((b, i) => {
    if (i > 0) tot += BLOCK;
    const pause = (String(b.pause).match(/(\d+)\s*s/) || [0, 45])[1] * 1;
    if (b.exercises.some(e => /Treppen-Aufstieg/.test(e.name))) {
      tot += b.exercises[0].sets * TREPPE + 180;      // + Gehpause bis Puls unter 110
      return;
    }
    const sets = b.exercises[0].sets;
    const work = b.exercises.map(e => oberReps(e.targetReps) * repSeconds(e));
    if (b.exercises.length > 1) {
      /* Alternierendes Paar. Zwei Korrekturen vom 08.09.2026:
         (1) jede Uebung zaehlt mit IHRER eigenen Satzzahl - seit der Zusammenlegung von
             C1 und D1 koennen die Satzzahlen im Paar verschieden sein (C1 3x, D1 2x);
         (2) zwischen n Saetzen liegen n-1 Luecken, nicht n. Die alte Formel rechnete
             eine Pause nach dem LETZTEN Satz mit, die es nicht gibt (-53 s je Paarblock). */
      const totalWork = b.exercises.reduce((a, e, i) => a + e.sets * work[i], 0);
      const nSets = b.exercises.reduce((a, e) => a + e.sets, 0);
      tot += totalWork + (nSets - 1) * (pause + SWITCH);
    } else {
      tot += sets * work[0] + (sets - 1) * pause;
    }
  });
  const ex = s.blocks.flatMap(b => b.exercises.map(e => e.name)).join("|");
  if (s.day === "Di" && /Klimmzug/.test(ex)) tot += 30;      // Kasten stellen
  if (s.day === "Di" && /Floor Press/.test(ex)) tot += 30;   // Scheibenwechsel Squat 2x21 -> Floor Press
  if (s.day === "Do") {
    tot += 60;                                              // Scheibenwechsel Rudern -> RDL
    const ft = (s.finish && s.finish.text) || "";
    if (/Goblet/.test(ft)) tot += 30 + 2 * 10 * 7 + 60;     // Weste + Goblet 2x10 a 7 s + Pause
    else if (/Weste-Squat/.test(ft)) tot += 30 + 2 * 12 * 7 + 60;  // Weste + 2x12 a 7 s + Pause
  }
  return tot;
}
const zeiten = plan.sessions.map(s => ({ id: `W${s.week} ${s.day}`, sec: Math.round(sessionSeconds(s)) }));
const zuLang = zeiten.filter(x => x.sec > BUDGET);
check("Keine Einheit ueber 45 min (Obergrenze der Wdh.-Bereiche)", zuLang.length === 0,
  zuLang.map(x => `${x.id} ${Math.floor(x.sec/60)}:${String(x.sec%60).padStart(2,"0")}`).join(", "));
console.log("      Dauer je Einheit: " +
  zeiten.map(x => `${x.id} ${Math.floor(x.sec/60)}:${String(x.sec%60).padStart(2,"0")}`).join(" | "));

// Lasten muessen aus dem Scheibeninventar baubar sein (2x10, 6x5, 8x2, 4x0,5 kg)
const proSeite = new Set();
for (let a=0;a<=1;a++) for (let b=0;b<=3;b++) for (let c=0;c<=4;c++) for (let e=0;e<=2;e++)
  proSeite.add(10*a + 5*b + 2*c + 0.5*e);
const lhBaubar = new Set([...proSeite].map(x => +(7.8 + 2*x).toFixed(1)));
const khProSeite = new Set();                               // je Sorte werden 4 Scheiben gleichzeitig verbraucht
for (let b=0;b<=1;b++) for (let c=0;c<=2;c++) for (let e=0;e<=1;e++) khProSeite.add(5*b + 2*c + 0.5*e);
const khBaubar = new Set([...khProSeite].map(x => +(2 + 2*x).toFixed(1)));
const lastFehler = [];
plan.sessions.forEach(s => s.blocks.forEach(b => b.exercises.forEach(e => {
  const r = e.resistance || "";
  let m = r.match(/Langhantel ([\d,]+) kg gesamt/);
  if (m) { const v = +m[1].replace(",", "."); if (!lhBaubar.has(v)) lastFehler.push(`W${s.week} ${s.day} LH ${v}`); }
  m = r.match(/^2x([\d,]+) kg gesamt je Hantel/);
  if (m) { const v = +m[1].replace(",", "."); if (!khBaubar.has(v)) lastFehler.push(`W${s.week} ${s.day} KH ${v}`); }
})));
check("Alle Lasten baubar", lastFehler.length === 0, lastFehler.join(", "));

// Video-Links wohlgeformt
const badUrl = plan.exercises.filter(e => e.video && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(e.video))
  .map(e => `${e.name} -> ${e.video}`);
check("Alle Video-URLs wohlgeformt", badUrl.length === 0, badUrl.join(" | "));
check("RDL-Video zeigt die Langhantel-Variante",
  plan.exercises.some(e => /Romanian Deadlift \(Langhantel\)/.test(e.name) && e.video === "https://www.youtube.com/watch?v=xgusDooVfKU"));
check("Liegestuetz hat ein Video", plan.exercises.some(e => /Liegestütz exzentrisch/.test(e.name) && !!e.video));

// 90-Grad-Schulterregel
const ueber90 = plan.sessions.flatMap(s => s.blocks.flatMap(b => b.exercises))
  .filter(e => /Overhead|Schulterdrücken|Frontheben|Schrägbank/i.test(e.name)).map(e => e.name);
check("Kein Ueberkopfdruecken / Frontheben", ueber90.length === 0, ueber90.join(", "));
check("meta.rules nennt die Physio-Ausnahme",
  /Physio verordneten/.test(plan.meta.rules) && /Schmerz-Ampel/.test(plan.meta.rules), plan.meta.rules);

// Klimmzug: pausiert W26/27, zurueck W28 3x3 und W29 3x4, je Di als A1, 5 s
const klimm = all.filter(x => /Klimmzug/.test(x.e.name));
check("Klimmzug: nur W28 + W29, Di, A1",
  klimm.map(x => `${x.s.week}${x.s.day}${x.e.code}`).join(",") === "28DiA1,29DiA1", klimm.map(x => `${x.s.week}${x.s.day}${x.e.code}`).join(","));
check("Klimmzug: 3x3 dann 3x4, 5 s, Kasten, kein Hochziehen",
  klimm.map(x => `${x.e.sets}x${x.e.targetReps}`).join(",") === "3x3,3x4" &&
  klimm.every(x => /5 s kontrolliert ablassen/.test(x.e.resistance) && /NICHT hochspringen/.test(x.e.resistance) && /KEIN Hochziehen/.test(x.e.resistance)));

// Treppen: Weste 15 kg, Aufbau 12/13/14/14, Zielband unveraendert 155-163
const tr = all.filter(x => /Treppen-Aufstieg/.test(x.e.name));
check("Treppen: immer Gewichtsweste 15 kg", tr.every(x => /Gewichtsweste 15 kg/.test(x.e.resistance)));
check("Treppen-Aufbau 12/13/14/14", tr.map(x => x.e.sets).join(",") === "12,13,14,14", tr.map(x => x.e.sets).join(","));
check("Treppen: Zielband 155-163 bei HFmax 177, nirgends 172",
  tr.every(x => /155-163 bpm/.test(x.e.resistance) && /HFmax 177/.test(x.e.resistance) && !/172/.test(x.e.resistance)));

// Lasten gegen die Logs: Rudern 49,8 -> 50,8, RDL 51,8 -> 53,8, Squat 2x21
const lh = (re) => all.filter(x => re.test(x.e.name)).map(x => (x.e.resistance.match(/Langhantel ([\d,]+) kg/)||[])[1]).join("/");
check("LH-Rudern 49,8/49,8/50,8/50,8", lh(/Langhantel-Rudern/) === "49,8/49,8/50,8/50,8", lh(/Langhantel-Rudern/));
check("RDL 51,8/52,8/52,8/53,8", lh(/Romanian/) === "51,8/52,8/52,8/53,8", lh(/Romanian/));
check("KH-Squat immer 2x21 kg, 4 s", all.filter(x => /Kurzhantel-Squat/.test(x.e.name)).every(x => /^2x21 kg/.test(x.e.resistance) && /4 s exzentrisch/.test(x.e.resistance)));
const seit = all.filter(x => /Lateral Raise/.test(x.e.name));
check("Seitheben TUERKIS in W26, GELB ab W27, nie DUNKELGRUEN",
  seit.every(x => (x.s.week === 26 ? /TUERKIS/ : /GELB/).test(x.e.resistance) && !/DUNKELGRUEN/.test(x.e.resistance)));
check("Bandfarbe immer mit Farbnamen (nie nur 'gruen')",
  all.every(x => !/Band gruen|Band GRUEN/i.test(x.e.resistance)));

// Samstag-Warm-up und Physio-Uebungen
const sa = plan.sessions.filter(s => s.day === "Sa");
check("Sa Warm-up hoechstens 4:30 gesamt", sa.every(s => s.warmup.reduce((a, x) => a + x.seconds, 0) <= 270));
check("Sa Warm-up besteht ueberwiegend aus Aufstiegen",
  sa.every(s => s.warmup.filter(x => /Aufstieg/i.test(x.name)).reduce((a, x) => a + x.seconds, 0) >= 180));
const kraft = plan.sessions.filter(s => s.day !== "Sa");
check("Physio 1 + Physio 2 in jedem Kraft-Warm-up",
  kraft.every(s => s.warmup.some(x => /Physio 1/.test(x.name)) && s.warmup.some(x => /Physio 2/.test(x.name))));
check("Kraft-Warm-up immer 30,30,30,30,45,60 s",
  kraft.every(s => s.warmup.map(x => x.seconds).join(",") === "30,30,30,30,45,60"));

// Beschreibungen in der Uebungstabelle duerfen den Wochenangaben nicht widersprechen
const desc = (re) => (plan.exercises.find(e => re.test(e.name)) || {}).description || "";
check("Uebungstabelle: Seitheben/Chest-Press/Face Pull nennen keine feste Bandfarbe mehr",
  [/Lateral Raise/, /Chest-Press/, /Face Pull/].every(re => /siehe Widerstandsangabe/.test(desc(re))));
check("Uebungstabelle: neue Uebungen vorhanden",
  ["Isometrisches Brustdrücken", "Liegestütz exzentrisch auf den Knien", "Weste-Squat"].every(n => plan.exercises.some(e => e.name.startsWith(n))));

/* =================================================================
   TEIL 2 - App-Verhalten
   ================================================================= */
setTimeout(() => {
  // W26 Di = 06.10.2026 (week12Monday 29.06. + 14 Wochen)
  goto("2026-10-06");
  const label = d.querySelector("#sessionLabel").textContent;
  check("06.10.2026 = Di W26", label.includes("Di") && label.includes("26"), label);
  const codes = [...d.querySelectorAll(".excode")].map(x => x.textContent);
  check("Di W26: Codes A1,A2,B1,B2,C1,D1", ["A1","A2","B1","B2","C1","D1"].every(c => codes.includes(c)), codes.join(","));
  const setCodes = [...d.querySelectorAll(".setrow")].map(r => r.dataset.code);
  check("Gerenderte Set-Zeilen eindeutig", new Set(setCodes).size === setCodes.length, setCodes.join(","));
  const host = () => d.querySelector("#blocksHost").textContent;
  check("Di W26: Isometrie statt Floor Press", host().includes("Isometrisches Brustdrücken") && !host().includes("Floor Press"));
  check("Di W26: kein Klimmzug, kein Liegestuetz", !host().includes("Klimmzug exzentrisch") && !host().includes("Liegestütz exzentrisch"));
  check("Di W26: Isometrie hat 3 Set-Felder", d.querySelectorAll('.setrow[data-code="B1"] input[data-set]').length === 3);
  check("Di W26: Schmerzregel sichtbar", host().includes("BRUST RECHTS"));
  check("Di W26: nur EINE Kurzhantel-Einstellung (kein Scheibenwechsel)",
    new Set((d.querySelector("#equipList").textContent.match(/2x\d+ kg gesamt je Hantel/g) || [])).size === 1);
  check("Warm-up: 6 Eintraege", d.querySelectorAll("#warmupList li").length === 6);
  const q = w.eval("buildTimerQueue(currentSession)");
  const works = q.filter(x => x.type === "work");
  check("Timer: Sekunden 30,30,30,30,45,60", works.map(x => x.seconds).join(",") === "30,30,30,30,45,60", works.map(x => x.seconds).join(","));

  goto("2026-10-13");
  check("13.10.2026 = Di W27", d.querySelector("#sessionLabel").textContent.includes("27"));
  check("Di W27: Floor Press 2x12 kg", host().includes("2x12 kg gesamt je Hantel"));
  check("Di W27: Liegestuetz auf den Knien", host().includes("auf den Knien"));

  goto("2026-10-20");
  check("Di W28: Klimmzug zurueck als A1",
    d.querySelector('.setrow[data-code="A1"]').parentElement.textContent.includes("Klimmzug"));

  goto("2026-10-08");
  check("08.10.2026 = Do W26", d.querySelector("#sessionLabel").textContent.includes("26"));
  check("Do W26: Weste-Squat im Finish", d.querySelector("#finishCard").textContent.includes("Weste-Squat"));
  check("Do W26: Band-Rudern statt Face Pull", host().includes("Band-Rudern") && !host().includes("Face Pull"));

  goto("2026-10-31");
  check("31.10.2026 = Sa W29 (letzte Einheit)", d.querySelector("#sessionLabel").textContent.includes("29"));

  goto("2026-10-10");
  check("10.10.2026 = Sa W26", d.querySelector("#sessionLabel").textContent.includes("26"));
  check("Sa W26: Treppen mit 12 Set-Feldern", d.querySelectorAll('.setrow[data-code="A1"] input[data-set]').length === 12);
  check("Sa W26: Gate-Hinweis sichtbar", host().includes("GATE VOR W27"));

  // Reps eintragen und einsammeln
  const inp = d.querySelector('.setrow[data-code="B1"] input[data-set="0"]');
  inp.value = "5"; inp.dispatchEvent(new w.Event("input"));
  const entry = w.eval("collectEntry()");
  check("collectEntry: B1 = Isometrie, reps[0]=5",
    entry.entries.B1 && entry.entries.B1.reps[0] === "5" && /Isometrisches/.test(entry.entries.B1.name),
    JSON.stringify(entry.entries.B1));
  check("collectEntry: Datum/Woche/Tag",
    entry.date === "2026-10-10" && entry.week === 26 && entry.day === "Sa");

  // "Letztes Mal" darf nach einem Uebungstausch nicht die Vorgaengeruebung zeigen
  w.eval(`LOGS["2026-08-11"] = {date:"2026-08-11", week:18, day:"Di", entries:{
            B1:{name:"Kurzhantel Floor Press (neutraler Griff)", reps:["10","10","9"], note:""}}};`);
  const lr = w.eval(`JSON.stringify(lastResult("B1","Di",26,"Isometrisches Brustdrücken"))`);
  check("lastResult ignoriert Logs der ersetzten Uebung", lr === "null", lr);
  const lr2 = w.eval(`JSON.stringify(lastResult("B1","Di",27,"Kurzhantel Floor Press (neutraler Griff)"))`);
  check("lastResult findet Logs bei gleichem Namen", lr2 !== "null", lr2);

  // Regressionstest zum Datenverlust vom 06./11./13.08.2026:
  // Ein doppelter Uebungscode darf die erste Eingabe NICHT mehr ueberschreiben.
  w.eval(`
    currentSession = JSON.parse(JSON.stringify(currentSession));
    currentSession.blocks[1].exercises[0].code = "A1";   // kuenstliche Kollision mit Block 1 A1
    renderBlocks(currentSession);
  `);
  const rows = [...d.querySelectorAll('.setrow[data-code="A1"]')];
  check("Testaufbau: zwei setrows mit Code A1", rows.length === 2, rows.length);
  rows[0].querySelector('input[data-set="0"]').value = "11";
  rows[1].querySelector('input[data-set="0"]').value = "22";
  const e2 = w.eval("collectEntry()");
  check("Kollision: erste Eingabe bleibt erhalten", e2.entries.A1 && e2.entries.A1.reps[0] === "11",
    JSON.stringify(e2.entries.A1));
  check("Kollision: zweite Eingabe landet unter A1#2", e2.entries["A1#2"] && e2.entries["A1#2"].reps[0] === "22",
    JSON.stringify(e2.entries["A1#2"]));
  check("Kollision: Metadaten passen zur jeweiligen Uebung",
    e2.entries.A1.name !== e2.entries["A1#2"].name,
    `${e2.entries.A1 && e2.entries.A1.name} / ${e2.entries["A1#2"] && e2.entries["A1#2"].name}`);

  // Kein Trainingstag
  goto("2026-10-11");
  check("So 11.10. = kein Trainingstag", !d.querySelector("#noSession").classList.contains("hidden"));

  console.log(fails.length ? `\n${fails.length} FEHLER` : "\nALLE TESTS BESTANDEN");
  process.exit(fails.length ? 1 : 0);
}, 300);
