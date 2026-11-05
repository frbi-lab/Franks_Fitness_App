// Headless-Smoke-Test der App (jsdom). Aufruf: node smoke_test.js  (aus fitness-app/ heraus)
//
// STAND 05.11.2026: November-Zyklus W31-34 (6-8 Wdh., Kurzhanteln und Langhantel nacheinander, Scheiben
// 2x10/8x5/17x2/4x0,5, Kurzhantel max. 30 kg). W27-29 bleiben als Historie. Neu getestet: verschobene
// Einheiten ("Diese Einheit an diesem Tag machen"). Die Fassung vom 15.10. liegt als
// smoke_test.oktober-freitag.bak.js im Projektordner.
//
// STAND 15.10.2026: Umstellung ab W27 auf KRAFT NUR FREITAG + Samstag (Treppe, Liegestuetz, Face Pull).
// W26 (Di/Do/Sa) und W27 Di bleiben als trainierte Historie im Plan. Teil 1 prueft die neue Struktur,
// das Zeitmodell kennt jetzt den Freitag (Weg Dachgeschoss -> Keller, Weste, Langhantel-Umbau).
// Die Fassung vom 03.10. liegt als smoke_test.oktober-vor-freitag.bak.js daneben.
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
const all = plan.sessions.flatMap(s => s.blocks.flatMap(b => b.exercises.map(e => ({s, b, e}))));
const sid = (s) => `${s.week}${s.day}`;
const NEU = plan.sessions.filter(s => s.week >= 31);
const fr = NEU.filter(s => s.day === "Fr");
const saNeu = NEU.filter(s => s.day === "Sa");
check("14 Sessions (W27-29 Historie + W31-34, je Fr/Sa)", plan.sessions.length === 14, plan.sessions.length);
check("Reihenfolge der Sessions", plan.sessions.map(sid).join(",") ===
  "27Fr,27Sa,28Fr,28Sa,29Fr,29Sa,31Fr,31Sa,32Fr,32Sa,33Fr,33Sa,34Fr,34Sa", plan.sessions.map(sid).join(","));
check("Wochen 27-29, 31-34 (W30 bewusst leer)", JSON.stringify(plan.meta.weeks) === "[27,28,29,31,32,33,34]", JSON.stringify(plan.meta.weeks));
check("Anker week12Monday = 2026-06-29", plan.meta.week12Monday === "2026-06-29", plan.meta.week12Monday);
check("Nur Fr und Sa", plan.sessions.every(s => /Fr|Sa/.test(s.day)));
check("Historie W29 Fr unveraendert (RDL 53,8, Floor Press 2x20)",
  (() => { const t = JSON.stringify(plan.sessions.find(x => sid(x) === "29Fr")); return /53,8 kg gesamt/.test(t) && /2x20 kg gesamt/.test(t); })());

const perSideWU = plan.sessions.flatMap(s => s.warmup.filter(x => x.perSide).map(x => `W${s.week}${s.day}:${x.name}`));
check("Warm-up: keine 'je Seite'-Uebung", perSideWU.length === 0, perSideWU.join(", "));

const westeKonflikt = [];
plan.sessions.forEach(s => s.blocks.forEach(b => {
  if (b.exercises.length < 2) return;
  const mit = b.exercises.filter(e => /Gewichtsweste/i.test(e.resistance || "")).length;
  if (mit > 0 && mit < b.exercises.length) westeKonflikt.push(`W${s.week} ${s.day} ${b.block}`);
}));
check("Gewichtsweste: im Paar entweder beide oder keine", westeKonflikt.length === 0, westeKonflikt.join(", "));
const westeKg = NEU.map(s => [...JSON.stringify(s.blocks).matchAll(/Gewichtsweste (\d+) kg/g)].map(m => m[1]));
check("Weste W31-34: nur EIN Gewicht pro Woche (15 kg, Fr und Sa)",
  [31,32,33,34].every(w => new Set(NEU.filter(s => s.week === w).flatMap(s => [...JSON.stringify(s.blocks).matchAll(/Gewichtsweste (\d+) kg/g)].map(m => m[1]))).size === 1)
  && westeKg.flat().every(x => x === "15"), JSON.stringify(westeKg));

const codeKollision = [];
plan.sessions.forEach(s => {
  const codes = s.blocks.flatMap(b => b.exercises.map(e => e.code));
  if (new Set(codes).size !== codes.length) codeKollision.push(`W${s.week} ${s.day}: ${codes.join(",")}`);
});
check("Uebungscodes je Session eindeutig", codeKollision.length === 0, codeKollision.join(" | "));

/* ---- FREITAG W31-34: Aufbau, Orte, Reihenfolge Kurzhantel -> Langhantel ---- */
const FR_CODES = "A1 Klimmzug|A2 Kraniozervikale|B1 Kurzhantel-Squat|B2 Band Lateral|C1 Kurzhantel Floor|C2 Band Face Pull|D1 Langhantel Romanian|D2 Band-Chest-Press|E1 Langhantel-Rudern";
check("Fr: Bloecke A-E in fester Reihenfolge", fr.every(s => {
  const t = s.blocks.flatMap(b => b.exercises.map(e => e.code + " " + e.name));
  return t.length === 9 && t.every((x, i) => x.startsWith(FR_CODES.split("|")[i])); }),
  fr.map(s => s.blocks.flatMap(b => b.exercises.map(e => e.code)).join(",")).join(" / "));
check("Fr: Block 1 im Dachgeschoss, Block 2 im Keller",
  fr.every(s => /DACHGESCHOSS/.test(s.blocks[0].note) && /KELLER/.test(s.blocks[1].note)));
check("Fr: Kurzhanteln nur Bloecke 2-3, Langhantel nur Bloecke 4-5", fr.every(s => s.blocks.every((b, i) =>
  b.exercises.every(e => (/je Hantel/.test(e.resistance) ? (i === 1 || i === 2) : true) &&
                         (/Langhantel [\d,]+ kg/.test(e.resistance) ? (i === 3 || i === 4) : true)))));
check("Fr: Block 4 sagt 'Kurzhanteln ABRAEUMEN'", fr.every(s => /ABRAEUMEN/.test(s.blocks[3].note)));
check("Fr: Weste 15 kg in Block 2, Block 3 ohne Weste und 'Weste AUSZIEHEN'",
  fr.every(s => s.blocks[1].exercises.every(e => /Gewichtsweste 15 kg/.test(e.resistance)) &&
    !s.blocks[2].exercises.some(e => /Gewichtsweste/.test(e.resistance)) && /Weste AUSZIEHEN/.test(s.blocks[2].note)));
check("Fr: Warm-up = volles Kraft-Warm-up mit Physio 1 + 2, 30,30,30,30,45,60 s",
  fr.every(s => s.warmup.map(x => x.seconds).join(",") === "30,30,30,30,45,60" &&
    s.warmup.some(x => /Physio 1/.test(x.name)) && s.warmup.some(x => /Physio 2/.test(x.name)) && s.warmup.some(x => /Pull-aparts/.test(x.name))));
check("Fr: kein Finish mehr, Optional nur Curl", fr.every(s => !s.finish && /Curl/.test(s.optional.text) && !/Pushdown/.test(s.optional.text)));
check("Sa: Treppe, dann Liegestuetz + Face Pull im Paar",
  saNeu.every(s => s.blocks.length === 2 && /Treppen/.test(s.blocks[0].exercises[0].name) &&
    /Liegestütz/.test(s.blocks[1].exercises[0].name) && /Face Pull/.test(s.blocks[1].exercises[1].name)));

/* ---- 6-8 Wiederholungen (Frank 05.11.2026) ---- */
const nw = (re) => all.filter(x => NEU.includes(x.s) && re.test(x.e.name));
const schwer = nw(/Kurzhantel-Squat|Floor Press|Romanian|Langhantel-Rudern/);
check("Squat, Floor Press, RDL, Rudern: 6-8 Wdh.", schwer.length === 16 && schwer.every(x => x.e.targetReps === "6-8"),
  schwer.filter(x => x.e.targetReps !== "6-8").map(x => `${x.s.week} ${x.e.name} ${x.e.targetReps}`).join(", "));
check("Squat 4 Saetze, Rest 3", nw(/Kurzhantel-Squat/).every(x => x.e.sets === 4) && nw(/Floor Press|Romanian|Langhantel-Rudern/).every(x => x.e.sets === 3));
check("Baender bleiben hoch: Seitheben 12-15, Face Pull 12-20, Chest-Press 10-15",
  nw(/Lateral/).every(x => x.e.targetReps === "12-15") && nw(/Face Pull/).every(x => x.e.targetReps === "12-20") &&
  nw(/Chest-Press/).every(x => x.e.targetReps === "10-15"));
const fmt = (re, rx) => nw(re).map(x => (x.e.resistance.match(rx) || [])[1]).join("/");
check("KH-Squat 2x28/30/30/30, 4 s, Zughilfen", fmt(/Kurzhantel-Squat/, /^2x(\d+) kg/) === "28/30/30/30" &&
  nw(/Kurzhantel-Squat/).every(x => /4 s exzentrisch/.test(x.e.resistance) && /ZUGHILFEN/.test(x.e.resistance)), fmt(/Kurzhantel-Squat/, /^2x(\d+) kg/));
check("Kein Kurzhantel ueber 30 kg (Herstellergrenze)", all.every(x => { const m = x.e.resistance.match(/^2x(\d+) kg/); return !m || +m[1] <= 30; }));
check("Floor Press 2x24, 3 s, Schulter-Rueckfall 2x20 im Block", fmt(/Floor Press/, /^2x(\d+) kg/) === "24/24/24/24" &&
  nw(/Floor Press/).every(x => /3 s exzentrisch/.test(x.e.resistance) && /2x20 kg mit 4 s/.test(x.b.note)), fmt(/Floor Press/, /^2x(\d+) kg/));
check("RDL 59,8/59,8/61,8/61,8 mit Zughilfen", fmt(/Romanian/, /Langhantel ([\d,]+) kg/) === "59,8/59,8/61,8/61,8" &&
  nw(/Romanian/).every(x => /ZUGHILFEN/.test(x.e.resistance)), fmt(/Romanian/, /Langhantel ([\d,]+) kg/));
check("Rudern 53,8/53,8/55,8/55,8, 3 s hoch / 3 s exzentrisch", fmt(/Langhantel-Rudern/, /Langhantel ([\d,]+) kg/) === "53,8/53,8/55,8/55,8" &&
  nw(/Langhantel-Rudern/).every(x => /3 s hoch, 3 s exzentrisch/.test(x.e.resistance)), fmt(/Langhantel-Rudern/, /Langhantel ([\d,]+) kg/));
const klimm = nw(/Klimmzug/);
check("Klimmzug 3x6/5 s, 3x7/5 s, 3x8/5 s, 3x8/6 s, Kasten, kein Hochziehen",
  klimm.map(x => `${x.e.sets}x${x.e.targetReps}/${(x.e.resistance.match(/(\d) s kontrolliert/)||[])[1]}`).join(",") === "3x6/5,3x7/5,3x8/5,3x8/6" &&
  klimm.every(x => /NICHT hochspringen/.test(x.e.resistance) && /KEIN Hochziehen/.test(x.e.resistance)),
  klimm.map(x => `${x.e.sets}x${x.e.targetReps}`).join(","));
const liege = nw(/Liegestütz/);
check("Liegestuetz nur Sa: W31 Knie 5 s, W32-33 voll 5 s, W34 voll 6 s",
  liege.map(x => `${x.s.week}${x.s.day}:${/Knien/.test(x.e.name) ? "K" : "V"}${(x.e.resistance.match(/(\d) s ablassen/)||[])[1]}`).join(",") === "31Sa:K5,32Sa:V5,33Sa:V5,34Sa:V6",
  liege.map(x => `${x.s.week}${x.s.day}`).join(","));
check("Liegestuetze 3x10, 'KEIN Hochdruecken', 45 Grad",
  liege.every(x => x.e.sets === 3 && x.e.targetReps === "10" && /KEIN Hochdrücken/.test(x.e.resistance) && /45 Grad/.test(x.e.resistance)));
check("Face Pull ROT (nie DUNKELGRUEN), Ellbogen auf Schulterhoehe",
  nw(/Face Pull/).every(x => /Band ROT/.test(x.e.resistance) && !/DUNKELGRUEN/.test(x.e.resistance) && /Schulterhoehe/.test(x.e.resistance)));
check("Chest-Press DUNKELGRUEN", nw(/Chest-Press/).every(x => /DUNKELGRUEN/.test(x.e.resistance)));
check("Seitheben GELB, nie DUNKELGRUEN", nw(/Lateral Raise/).every(x => /GELB/.test(x.e.resistance) && !/DUNKELGRUEN/.test(x.e.resistance)));
check("Bandfarbe immer mit Farbnamen (nie nur 'gruen')", all.every(x => !/Band gruen|Band GRUEN/i.test(x.e.resistance)));
check("BRUST-Schmerzregel in jedem Block mit Brust- oder Dehnungsarbeit",
  nw(/Floor Press|Chest-Press|Liegestütz|Klimmzug|Face Pull/).every(x => /BRUST RECHTS/.test(x.b.note)));

const tr = nw(/Treppen-Aufstieg/);
check("Treppen W31-34: 12/13/14/14, Weste 15 kg", tr.map(x => x.e.sets).join(",") === "12,13,14,14" && tr.every(x => /Gewichtsweste 15 kg/.test(x.e.resistance)),
  tr.map(x => x.e.sets).join(","));
check("Treppen: Zielband 159-168 bei HFmax 178",
  tr.every(x => /159-168 bpm/.test(x.e.resistance) && /HFmax 178/.test(x.e.resistance) && !/155-163/.test(x.e.resistance)));
check("Sa Warm-up hoechstens 4:30 und ueberwiegend Aufstiege",
  saNeu.every(s => s.warmup.reduce((a, x) => a + x.seconds, 0) <= 270 &&
    s.warmup.filter(x => /Aufstieg/i.test(x.name)).reduce((a, x) => a + x.seconds, 0) >= 180));

/* ---- ZEITBUDGET (Franks Regel 28.08.2026) -------------------------------
   normale Wdh. = 3 s | Exzentrik t s = 4 + t | exzentrisch-only: Liegestuetz t + 4, Klimmzug t + 8
   Treppen = 54,7 s je Auf-/Abstieg (gemessen 27.08.2026) | Wechsel im Paar +8 s | Blockwechsel +40 s
   FREITAG zusaetzlich: Kasten 30 s, Weg Dachgeschoss -> Keller 45 s (Frank: 90 s hin und zurueck),
   Weste anlegen 30 s, Langhantel RDL -> Rudern umbauen 30 s, Goblet-Finish 30 + 2x10x7 + 60 s.
   AB W31: Weste aus + Kurzhanteln umstecken 60 s, Kurzhanteln abraeumen + Langhantel laden 90 s.
   Freitag hat kein Zeitlimit (Frank 15.10.2026) - die Grenze 65 min ist nur ein Plausibilitaetsanker. */
const NORM = 3, SWITCH = 8, BLOCK = 40, TREPPE = 54.7;
const BUDGET = { Di: 45 * 60, Do: 45 * 60, Sa: 45 * 60, Fr: 65 * 60 };
const tempoOf = (r) => { const m = (r || "").match(/(\d+)\s*s\s*(exzentrisch|kontrolliert ablassen|ablassen)/); return m ? +m[1] : 0; };
const oberReps = (t) => { const m = String(t || "").match(/(\d+)\s*$/); return m ? +m[1] : 1; };
function repSeconds(e) {
  const t = tempoOf(e.resistance);
  if (/Kraniozervikale/.test(e.name)) return 10;
  if (/Isometrisch/.test(e.name)) return 10;
  if (/Klimmzug/.test(e.name)) return t + 8;
  if (/Liegestütz/.test(e.name)) return t + 4;
  return t ? 4 + t : NORM;
}
function posten(s) {
  const out = [["Warm-up (+20 s Umbau)", s.warmup.reduce((a, x) => a + x.seconds * (x.perSide ? 2 : 1), 0) + 20]];
  s.blocks.forEach((b, i) => {
    const add = i > 0 ? BLOCK : 0;
    const pause = (String(b.pause).match(/(\d+)\s*s/) || [0, 45])[1] * 1;
    const names = b.exercises.map(e => e.name.split(" (")[0]).join(" + ");
    if (b.exercises.some(e => /Treppen-Aufstieg/.test(e.name))) {
      out.push([`${b.block}: ${names} (${b.exercises[0].sets}x) + 3 min Gehpause`, b.exercises[0].sets * TREPPE + 180 + add]);
      return;
    }
    const work = b.exercises.map(e => oberReps(e.targetReps) * repSeconds(e));
    let t;
    if (b.exercises.length > 1) {
      const totalWork = b.exercises.reduce((a, e, k) => a + e.sets * work[k], 0);
      const nSets = b.exercises.reduce((a, e) => a + e.sets, 0);
      t = totalWork + (nSets - 1) * (pause + SWITCH);
    } else {
      t = b.exercises[0].sets * work[0] + (b.exercises[0].sets - 1) * pause;
    }
    out.push([`${b.block}: ${names}` + (add ? " (inkl. 40 s Blockwechsel)" : ""), t + add]);
  });
  const ex = s.blocks.flatMap(b => b.exercises.map(e => e.name)).join("|");
  if (/Klimmzug/.test(ex)) out.push(["Kasten stellen", 30]);
  if (s.day === "Di" && /Floor Press/.test(ex)) out.push(["Scheibenwechsel Squat -> Floor Press", 30]);
  if (s.day === "Do") out.push(["Scheibenwechsel Rudern -> RDL", 60]);
  if (s.day === "Fr") {
    out.push(["Weg Dachgeschoss -> Keller", 45]);
    out.push(["Gewichtsweste anlegen (Block 2)", 30]);
    if (s.week >= 31) {
      out.push(["Weste aus + Kurzhanteln umstecken (Block 3)", 60]);
      out.push(["Kurzhanteln abraeumen + Langhantel auf RDL laden (Block 4)", 90]);
    }
    out.push(["Langhantel umbauen RDL -> Rudern", 30]);
  }
  const ft = (s.finish && s.finish.text) || "";
  if (/Goblet/.test(ft)) out.push(["Finish: Weste anlegen + Goblet 2x10 a 7 s + Pause", 30 + 2 * 10 * 7 + 60]);
  else if (/Weste-Squat/.test(ft)) out.push(["Finish: Weste anlegen + Weste-Squat 2x12 a 7 s + Pause", 30 + 2 * 12 * 7 + 60]);
  return out;
}
const sessionSeconds = (s) => posten(s).reduce((a, p) => a + p[1], 0);
const mmss = (x) => `${Math.floor(x/60)}:${String(Math.round(x)%60).padStart(2,"0")}`;
const zeiten = plan.sessions.map(s => ({ id: `W${s.week} ${s.day}`, day: s.day, sec: Math.round(sessionSeconds(s)) }));
const zuLang = zeiten.filter(x => x.sec > BUDGET[x.day]);
check("Keine Einheit ueber ihrem Rahmen (Di/Do/Sa 45 min, Fr 65 min)", zuLang.length === 0,
  zuLang.map(x => `${x.id} ${mmss(x.sec)}`).join(", "));
console.log("      Dauer je Einheit: " + zeiten.map(x => `${x.id} ${mmss(x.sec)}`).join(" | "));
if (process.env.POSTEN) plan.sessions.forEach(s => posten(s).forEach(p => console.log(`POSTEN\tW${s.week} ${s.day}\t${p[0]}\t${mmss(p[1])}`)));

// Lasten muessen aus dem Scheibeninventar baubar sein (ab 05.11.2026: 2x10, 8x5, 17x2, 4x0,5 kg)
// Kurzhantel-Paar: je Scheibensorte 4 Stueck -> je Seite max 0x10, 2x5, 4x2, 1x0,5; Herstellergrenze 30 kg.
const proSeite = new Set();
for (let a=0;a<=1;a++) for (let b=0;b<=4;b++) for (let c=0;c<=8;c++) for (let e=0;e<=2;e++)
  proSeite.add(10*a + 5*b + 2*c + 0.5*e);
const lhBaubar = new Set([...proSeite].map(x => +(7.8 + 2*x).toFixed(1)));
const khProSeite = new Set();
for (let b=0;b<=2;b++) for (let c=0;c<=4;c++) for (let e=0;e<=1;e++) khProSeite.add(5*b + 2*c + 0.5*e);
const khBaubar = new Set([...khProSeite].map(x => +(2 + 2*x).toFixed(1)).filter(x => x <= 30));
const lastFehler = [];
plan.sessions.forEach(s => s.blocks.forEach(b => b.exercises.forEach(e => {
  const r = e.resistance || "";
  let m = r.match(/Langhantel ([\d,]+) kg gesamt/);
  if (m) { const v = +m[1].replace(",", "."); if (!lhBaubar.has(v)) lastFehler.push(`W${s.week} ${s.day} LH ${v}`); }
  m = r.match(/^2x([\d,]+) kg gesamt je Hantel/);
  if (m) { const v = +m[1].replace(",", "."); if (!khBaubar.has(v)) lastFehler.push(`W${s.week} ${s.day} KH ${v}`); }
})));
check("Alle Lasten baubar", lastFehler.length === 0, lastFehler.join(", "));
// Gesamtgewicht und Scheibenaufteilung muessen zusammenpassen (ab W31)
const aufteilung = [];
nw(/./).forEach(x => {
  const r = x.e.resistance || "";
  let m = r.match(/^2x([\d,]+) kg gesamt je Hantel \(Stange 2 kg \+ je Seite ([^)]+)\)/) ||
          r.match(/Langhantel ([\d,]+) kg gesamt \(Stange 7,8 kg \+ je Seite ([^)]+)\)/);
  if (!m) return;
  const seite = m[2].split("+").reduce((a, t) => { const k = t.trim().match(/(\d+)x([\d,]+)/); return a + (+k[1]) * (+k[2].replace(",", ".")); }, 0);
  const stange = /je Hantel/.test(r) ? 2 : 7.8;
  if (Math.abs(stange + 2 * seite - +m[1].replace(",", ".")) > 0.01) aufteilung.push(`W${x.s.week} ${x.e.name}: ${m[1]} vs ${(stange + 2*seite).toFixed(1)}`);
});
check("Scheibenaufteilung ergibt das angegebene Gesamtgewicht", aufteilung.length === 0, aufteilung.join(" | "));

const badUrl = plan.exercises.filter(e => e.video && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(e.video))
  .map(e => `${e.name} -> ${e.video}`);
check("Alle Video-URLs wohlgeformt", badUrl.length === 0, badUrl.join(" | "));
check("Jede Uebung ab W31 hat eine Beschreibung", nw(/./).every(x => !!x.e.description),
  nw(/./).filter(x => !x.e.description).map(x => x.e.name).join(", "));

const ueber90 = plan.sessions.flatMap(s => s.blocks.flatMap(b => b.exercises))
  .filter(e => /Overhead|Schulterdrücken|Frontheben|Schrägbank/i.test(e.name)).map(e => e.name);
check("Kein Ueberkopfdruecken / Frontheben", ueber90.length === 0, ueber90.join(", "));
check("meta.rules nennt die Physio-Ausnahme",
  /Physio verordneten/.test(plan.meta.rules) && /Schmerz-Ampel/.test(plan.meta.rules), plan.meta.rules);
check("meta.trainingDays enthaelt Fr", plan.meta.trainingDays.includes("Fr"), JSON.stringify(plan.meta.trainingDays));

/* =================================================================
   TEIL 2 - App-Verhalten
   ================================================================= */
setTimeout(() => {
  const host = () => d.querySelector("#blocksHost").textContent;
  const label = () => d.querySelector("#sessionLabel").textContent;

  // Historie bleibt aufrufbar
  goto("2026-10-30");
  check("30.10.2026 = Fr W29 (Historie)", label().includes("Fr") && label().includes("29"), label());
  check("Fr W29: Floor Press 2x20 kg", host().includes("2x20 kg gesamt je Hantel"));

  // W30 hat keinen Plan
  goto("2026-11-06");
  check("Fr 06.11.2026 (W30): keine Einheit", !d.querySelector("#noSession").classList.contains("hidden"));
  check("Fr 06.11.2026: Hinweis nennt naechste Einheit Fr 13.11.", d.querySelector("#noSessionMsg").textContent.includes("13.11.2026"),
    d.querySelector("#noSessionMsg").textContent);

  // Neuer Zyklus
  goto("2026-11-13");
  check("13.11.2026 = Fr W31", label().includes("Fr") && label().includes("31") && !label().includes("verschoben"), label());
  const codes = [...d.querySelectorAll(".excode")].map(x => x.textContent);
  check("Fr W31: Codes A1,A2,B1,B2,C1,C2,D1,D2,E1", codes.join(",") === "A1,A2,B1,B2,C1,C2,D1,D2,E1", codes.join(","));
  const setCodes = [...d.querySelectorAll(".setrow")].map(r => r.dataset.code);
  check("Gerenderte Set-Zeilen eindeutig", new Set(setCodes).size === setCodes.length, setCodes.join(","));
  check("Fr W31: Orte sichtbar", host().includes("DACHGESCHOSS") && host().includes("KELLER"));
  check("Fr W31: Ausstattungshinweis zu den zwei Orten", d.querySelector("#equipList").textContent.includes("Zwei Orte"));
  check("Fr W31: Squat 4 Set-Felder", d.querySelectorAll('.setrow[data-code="B1"] input[data-set]').length === 4);
  check("Fr W31: Squat 2x28 kg, RDL 59,8 kg", host().includes("2x28 kg gesamt je Hantel") && host().includes("Langhantel 59,8 kg"));
  check("Fr W31: kein Goblet-Finish, Curl optional", !d.querySelector("#finishCard").textContent.includes("Goblet") &&
    d.querySelector("#finishCard").textContent.includes("Curl"));
  check("Warm-up: 6 Eintraege", d.querySelectorAll("#warmupList li").length === 6);
  const q = w.eval("buildTimerQueue(currentSession)");
  check("Timer: Sekunden 30,30,30,30,45,60", q.filter(x => x.type === "work").map(x => x.seconds).join(",") === "30,30,30,30,45,60");

  goto("2026-11-14");
  check("14.11.2026 = Sa W31", label().includes("Sa") && label().includes("31"), label());
  check("Sa W31: Treppen mit 12 Set-Feldern", d.querySelectorAll('.setrow[data-code="A1"] input[data-set]').length === 12);
  check("Sa W31: Knie-Liegestuetz + Face Pull", host().includes("auf den Knien") && host().includes("Face Pull"));
  goto("2026-11-17");
  check("Di 17.11.2026: kein Training", !d.querySelector("#noSession").classList.contains("hidden"));
  goto("2026-12-04");
  check("04.12.2026 = Fr W34", label().includes("Fr") && label().includes("34"), label());
  goto("2026-12-05");
  check("05.12.2026 = Sa W34 (letzte Einheit)", label().includes("Sa") && label().includes("34"), label());

  // Verschieben: Freitags-Einheit am Donnerstag machen (Fall vom 05.11.2026)
  goto("2026-11-19");
  check("Do 19.11.: zunaechst keine Einheit", !d.querySelector("#noSession").classList.contains("hidden"));
  const opts = [...d.querySelectorAll("#moveSelect option")].map(o => o.value);
  check("Do 19.11.: Auswahl bietet Einheiten an, naechstliegende ungeloggte zuerst", opts.length === 14 && /^3[12]\|(Fr|Sa)$/.test(opts[0]), opts.slice(0,3).join(","));
  d.querySelector("#moveSelect").value = "32|Fr";
  d.querySelector("#btnMoveHere").click();
  check("Do 19.11.: zeigt jetzt Fr W32 (verschoben)", label().includes("Fr") && label().includes("32") && label().includes("verschoben"), label());
  check("Do 19.11.: Hinweis 'Geplant für ... 20.11.2026'", d.querySelector("#progressionHint").textContent.includes("20.11.2026"),
    d.querySelector("#progressionHint").textContent);
  check("Do 19.11.: 'Verschiebung aufheben' sichtbar", !d.querySelector("#btnUnmove").classList.contains("hidden"));
  const inpM = d.querySelector('.setrow[data-code="B1"] input[data-set="0"]');
  inpM.value = "7"; inpM.dispatchEvent(new w.Event("input"));
  const em = w.eval("collectEntry()");
  check("collectEntry (verschoben): Datum 19.11., Woche 32, Tag Fr", em.date === "2026-11-19" && em.week === 32 && em.day === "Fr", JSON.stringify([em.date, em.week, em.day]));
  w.eval(`LOGS["2026-11-19"] = collectEntry();`);
  w.localStorage.removeItem("ffp_moved_2026-11-19");
  goto("2026-11-20"); goto("2026-11-19");
  check("Do 19.11.: gespeichertes Log haelt die Verschiebung auch ohne lokale Markierung", label().includes("32") && label().includes("verschoben"), label());
  check("Do 19.11.: nach dem Speichern kein 'aufheben' mehr", d.querySelector("#btnUnmove").classList.contains("hidden"));
  w.eval(`delete LOGS["2026-11-19"]`);
  w.localStorage.removeItem("ffp_draft_2026-11-19");
  goto("2026-11-20");
  check("Fr 20.11. bleibt regulaer Fr W32", label().includes("32") && !label().includes("verschoben"), label());

  // Reps eintragen und einsammeln (Fr)
  goto("2026-11-13");
  const inp = d.querySelector('.setrow[data-code="E1"] input[data-set="0"]');
  inp.value = "7"; inp.dispatchEvent(new w.Event("input"));
  const entry = w.eval("collectEntry()");
  check("collectEntry: E1 = Rudern, reps[0]=7",
    entry.entries.E1 && entry.entries.E1.reps[0] === "7" && /Rudern/.test(entry.entries.E1.name), JSON.stringify(entry.entries.E1));
  check("collectEntry: Datum/Woche/Tag", entry.date === "2026-11-13" && entry.week === 31 && entry.day === "Fr");

  // "Letztes Mal": ueber den Namen, auch wenn die Uebung frueher an einem anderen Tag / unter anderem Code lief
  w.eval(`LOGS["2026-10-13"] = {date:"2026-10-13", week:27, day:"Di", entries:{
            B1:{name:"Kurzhantel Floor Press (neutraler Griff)", reps:["11","10","8"], note:"2x20 kg!!"}}};
          LOGS["2026-10-08"] = {date:"2026-10-08", week:26, day:"Do", entries:{
            A1:{name:"Langhantel-Rudern vorgebeugt", reps:["13","11","9"], note:""}}};
          LOGS["2026-08-11"] = {date:"2026-08-11", week:18, day:"Di", entries:{
            B1:{name:"Kurzhantel Floor Press (neutraler Griff)", reps:["10","10","9"], note:""}}};`);
  w.eval(`LOGS["2026-11-05"] = {date:"2026-11-05", week:30, day:"Fr", entries:{
            D1:{name:"Langhantel-Rudern vorgebeugt", reps:["6","8","7"], note:"53,8 kg"}}};`);
  const lr = JSON.parse(w.eval(`JSON.stringify(lastResult("C1","Fr",31,"Kurzhantel Floor Press (neutraler Griff)"))`));
  check("lastResult Fr C1 findet Di-B1 vom 13.10. (juengster Eintrag)", lr && lr.date === "2026-10-13" && lr.reps[0] === "11", JSON.stringify(lr));
  const lr2 = JSON.parse(w.eval(`JSON.stringify(lastResult("E1","Fr",31,"Langhantel-Rudern vorgebeugt"))`));
  check("lastResult Fr E1 (Rudern) findet den W30-Eintrag vom 05.11. trotz anderem Code", lr2 && lr2.date === "2026-11-05", JSON.stringify(lr2));
  const lr3 = w.eval(`JSON.stringify(lastResult("B1","Di",26,"Isometrisches Brustdrücken"))`);
  check("lastResult ignoriert Logs anderer Uebungen", lr3 === "null", lr3);
  w.eval(`renderBlocks(currentSession)`);
  check("Fr: 'Letztes Mal' wird angezeigt", host().includes("Letztes Mal (2026-11-05)"));

  // Regressionstest zum Datenverlust vom 06./11./13.08.2026
  w.eval(`
    currentSession = JSON.parse(JSON.stringify(currentSession));
    currentSession.blocks[1].exercises[0].code = "A1";
    renderBlocks(currentSession);
  `);
  const rows = [...d.querySelectorAll('.setrow[data-code="A1"]')];
  check("Testaufbau: zwei setrows mit Code A1", rows.length === 2, rows.length);
  rows[0].querySelector('input[data-set="0"]').value = "11";
  rows[1].querySelector('input[data-set="0"]').value = "22";
  const e2 = w.eval("collectEntry()");
  check("Kollision: erste Eingabe bleibt erhalten", e2.entries.A1 && e2.entries.A1.reps[0] === "11", JSON.stringify(e2.entries.A1));
  check("Kollision: zweite Eingabe landet unter A1#2", e2.entries["A1#2"] && e2.entries["A1#2"].reps[0] === "22", JSON.stringify(e2.entries["A1#2"]));

  goto("2026-11-15");
  check("So 15.11. = kein Trainingstag", !d.querySelector("#noSession").classList.contains("hidden"));

  console.log(fails.length ? `\n${fails.length} FEHLER` : "\nALLE TESTS BESTANDEN");
  process.exit(fails.length ? 1 : 0);
}, 300);
