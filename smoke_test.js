// Headless-Smoke-Test der App (jsdom). Aufruf: node smoke_test.js  (aus fitness-app/ heraus)
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
const NEU = plan.sessions.filter(s => s.day === "Fr" || (s.day === "Sa" && s.week >= 27));
const fr = plan.sessions.filter(s => s.day === "Fr");
const saNeu = plan.sessions.filter(s => s.day === "Sa" && s.week >= 27);
check("10 Sessions (W26 Di/Do/Sa, W27 Di, W27-29 Fr/Sa)", plan.sessions.length === 10, plan.sessions.length);
check("Reihenfolge der Sessions", plan.sessions.map(sid).join(",") === "26Di,26Do,26Sa,27Di,27Fr,27Sa,28Fr,28Sa,29Fr,29Sa",
  plan.sessions.map(sid).join(","));
check("Wochen 26-29", JSON.stringify(plan.meta.weeks) === "[26,27,28,29]", JSON.stringify(plan.meta.weeks));
check("Anker week12Monday = 2026-06-29", plan.meta.week12Monday === "2026-06-29", plan.meta.week12Monday);
check("Ab W28 kein Di/Do mehr, W27 kein Do", !plan.sessions.some(s => (s.week >= 28 && /Di|Do/.test(s.day)) || (s.week === 27 && s.day === "Do")));
check("Historie W26 + W27 Di unveraendert: W27 Di hat Floor Press 2x12 und Knie-Liegestuetz",
  (() => { const s = plan.sessions.find(x => sid(x) === "27Di"); const t = JSON.stringify(s);
           return /2x12 kg gesamt/.test(t) && /auf den Knien/.test(t); })());

const perSideWU = plan.sessions.flatMap(s => s.warmup.filter(x => x.perSide).map(x => `W${s.week}${s.day}:${x.name}`));
check("Warm-up: keine 'je Seite'-Uebung", perSideWU.length === 0, perSideWU.join(", "));

const westeKonflikt = [];
plan.sessions.forEach(s => s.blocks.forEach(b => {
  if (b.exercises.length < 2) return;
  const mit = b.exercises.filter(e => /Gewichtsweste/i.test(e.resistance || "")).length;
  if (mit > 0 && mit < b.exercises.length) westeKonflikt.push(`W${s.week} ${s.day} ${b.block}`);
}));
check("Gewichtsweste: im Paar entweder beide oder keine", westeKonflikt.length === 0, westeKonflikt.join(", "));

const codeKollision = [];
plan.sessions.forEach(s => {
  const codes = s.blocks.flatMap(b => b.exercises.map(e => e.code));
  if (new Set(codes).size !== codes.length) codeKollision.push(`W${s.week} ${s.day}: ${codes.join(",")}`);
});
check("Uebungscodes je Session eindeutig", codeKollision.length === 0, codeKollision.join(" | "));

/* ---- FREITAG: Aufbau und Orte ---- */
const FR_CODES = "A1 Klimmzug|A2 Kraniozervikale|B1 Kurzhantel-Squat|B2 Band Lateral|C1 Kurzhantel Floor|C2 Langhantel Romanian|D1 Langhantel-Rudern|D2 Band-Chest-Press|E1 Band Face Pull";
check("Fr: Bloecke A-E in fester Reihenfolge", fr.every(s => s.blocks.flatMap(b => b.exercises.map(e => e.code + " " + e.name)).every((t, i) =>
  t.startsWith(FR_CODES.split("|")[i]))), fr.map(s => s.blocks.flatMap(b => b.exercises.map(e => e.code)).join(",")).join(" / "));
check("Fr: Block 1 im Dachgeschoss, Block 2 im Keller",
  fr.every(s => /DACHGESCHOSS/.test(s.blocks[0].note) && /KELLER/.test(s.blocks[1].note)));
check("Fr: Klimmzug nur in Block 1 (Dachgeschoss), Kurz-/Langhanteln nie in Block 1",
  fr.every(s => /Klimmzug/.test(s.blocks[0].exercises[0].name) && !s.blocks[0].exercises.some(e => /kg gesamt/.test(e.resistance))));
check("Fr: Kurzhanteln EINE Einstellung (Squat = Floor Press)", fr.every(s => {
  const kh = s.blocks.flatMap(b => b.exercises).map(e => (e.resistance.match(/^2x([\d,]+) kg gesamt je Hantel/) || [])[1]).filter(Boolean);
  return kh.length === 2 && kh[0] === kh[1]; }));
check("Fr: Weste 10 kg in Block 2 (Squat + Seitheben), Block 3 ohne Weste",
  fr.every(s => s.blocks[1].exercises.every(e => /Gewichtsweste 10 kg/.test(e.resistance)) &&
                !s.blocks[2].exercises.some(e => /Gewichtsweste/.test(e.resistance))));
check("Fr: Warm-up = volles Kraft-Warm-up mit Physio 1 + 2, 30,30,30,30,45,60 s",
  fr.every(s => s.warmup.map(x => x.seconds).join(",") === "30,30,30,30,45,60" &&
    s.warmup.some(x => /Physio 1/.test(x.name)) && s.warmup.some(x => /Physio 2/.test(x.name)) && s.warmup.some(x => /Pull-aparts/.test(x.name))));
check("Fr: Finish Goblet, Optional nur Curl (kein Pushdown)",
  fr.every(s => /Goblet/.test(s.finish.text) && /Curl/.test(s.optional.text) && !/Pushdown/.test(s.optional.text)));
check("Sa W27-29: Treppe, dann Liegestuetz + Face Pull im Paar",
  saNeu.every(s => s.blocks.length === 2 && /Treppen/.test(s.blocks[0].exercises[0].name) &&
    /Liegestütz/.test(s.blocks[1].exercises[0].name) && /Face Pull/.test(s.blocks[1].exercises[1].name)));

/* ---- Progression ab W27 ---- */
const nw = (re) => all.filter(x => NEU.includes(x.s) && re.test(x.e.name));
const klimm = nw(/Klimmzug/);
check("Klimmzug Fr 3x3 / 3x4 / 3x5, 5 s, Kasten, kein Hochziehen",
  klimm.map(x => `${x.s.week}${x.s.day}:${x.e.sets}x${x.e.targetReps}`).join(",") === "27Fr:3x3,28Fr:3x4,29Fr:3x5" &&
  klimm.every(x => /5 s kontrolliert ablassen/.test(x.e.resistance) && /NICHT hochspringen/.test(x.e.resistance) && /KEIN Hochziehen/.test(x.e.resistance)),
  klimm.map(x => `${x.s.week}${x.s.day}:${x.e.sets}x${x.e.targetReps}`).join(","));
const liege = nw(/Liegestütz/);
check("Liegestuetz nur Sa: W27 Knie 5 s, W28 voll 5 s, W29 voll 6 s",
  liege.map(x => `${x.s.week}${x.s.day}:${/Knien/.test(x.e.name) ? "K" : "V"}${(x.e.resistance.match(/(\d) s ablassen/)||[])[1]}`).join(",") === "27Sa:K5,28Sa:V5,29Sa:V6",
  liege.map(x => `${x.s.week}${x.s.day}`).join(","));
check("Liegestuetze 3x10, 'KEIN Hochdruecken', 45 Grad",
  liege.every(x => x.e.sets === 3 && x.e.targetReps === "10" && /KEIN Hochdrücken/.test(x.e.resistance) && /45 Grad/.test(x.e.resistance)));
const band = (re) => nw(re).map(x => `${x.s.week}${x.s.day}:${/DUNKELGRUEN/.test(x.e.resistance) ? "DG" : /ROT/.test(x.e.resistance) ? "ROT" : "?"}`).join(",");
check("Chest-Press nur Fr: ROT, DG, DG", band(/Chest-Press/) === "27Fr:ROT,28Fr:DG,29Fr:DG", band(/Chest-Press/));
check("Face Pull Fr + Sa: ROT in W27, danach DG", band(/Face Pull/) === "27Fr:ROT,27Sa:ROT,28Fr:DG,28Sa:DG,29Fr:DG,29Sa:DG", band(/Face Pull/));
check("Face Pull: Ellbogen auf Schulterhoehe", nw(/Face Pull/).every(x => /Schulterhoehe/.test(x.e.resistance)));
const lhv = (re) => nw(re).map(x => (x.e.resistance.match(/Langhantel ([\d,]+) kg/)||[])[1]).join("/");
check("LH-Rudern 49,8/50,8/50,8", lhv(/Langhantel-Rudern/) === "49,8/50,8/50,8", lhv(/Langhantel-Rudern/));
check("RDL 51,8/52,8/53,8", lhv(/Romanian/) === "51,8/52,8/53,8", lhv(/Romanian/));
check("Floor Press 2x20 kg / 3 s / 3x6-10", nw(/Floor Press/).every(x => /^2x20 kg/.test(x.e.resistance) && /3 s exzentrisch/.test(x.e.resistance) && x.e.targetReps === "6-10"));
check("KH-Squat 2x20 kg / 4 s / Weste 10 kg", nw(/Kurzhantel-Squat/).every(x => /^2x20 kg/.test(x.e.resistance) && /4 s exzentrisch/.test(x.e.resistance) && /Gewichtsweste 10 kg/.test(x.e.resistance)));
check("Seitheben GELB, nie DUNKELGRUEN", nw(/Lateral Raise/).every(x => /GELB/.test(x.e.resistance) && !/DUNKELGRUEN/.test(x.e.resistance)));
check("Bandfarbe immer mit Farbnamen (nie nur 'gruen')", all.every(x => !/Band gruen|Band GRUEN/i.test(x.e.resistance)));
check("BRUST-Schmerzregel in jedem Block mit Brust- oder Dehnungsarbeit (ab W27 Fr/Sa)",
  nw(/Floor Press|Chest-Press|Liegestütz|Klimmzug|Face Pull/).every(x => /BRUST RECHTS/.test(x.b.note)));

const tr = nw(/Treppen-Aufstieg/);
check("Treppen W27-29: 13/14/14, Weste 15 kg", tr.map(x => x.e.sets).join(",") === "13,14,14" && tr.every(x => /Gewichtsweste 15 kg/.test(x.e.resistance)),
  tr.map(x => x.e.sets).join(","));
check("Treppen: Zielband 159-168 bei HFmax 177 (Entscheidung 04.10.2026)",
  tr.every(x => /159-168 bpm/.test(x.e.resistance) && /HFmax 177/.test(x.e.resistance) && !/155-163/.test(x.e.resistance)));
check("Sa Warm-up hoechstens 4:30 und ueberwiegend Aufstiege",
  saNeu.every(s => s.warmup.reduce((a, x) => a + x.seconds, 0) <= 270 &&
    s.warmup.filter(x => /Aufstieg/i.test(x.name)).reduce((a, x) => a + x.seconds, 0) >= 180));

/* ---- ZEITBUDGET (Franks Regel 28.08.2026) -------------------------------
   normale Wdh. = 3 s | Exzentrik t s = 4 + t | exzentrisch-only: Liegestuetz t + 4, Klimmzug t + 8
   Treppen = 54,7 s je Auf-/Abstieg (gemessen 27.08.2026) | Wechsel im Paar +8 s | Blockwechsel +40 s
   FREITAG zusaetzlich: Kasten 30 s, Weg Dachgeschoss -> Keller 45 s (Frank: 90 s hin und zurueck),
   Weste anlegen 30 s, Langhantel RDL -> Rudern umbauen 30 s, Goblet-Finish 30 + 2x10x7 + 60 s.
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

// Lasten muessen aus dem Scheibeninventar baubar sein (2x10, 6x5, 8x2, 4x0,5 kg)
const proSeite = new Set();
for (let a=0;a<=1;a++) for (let b=0;b<=3;b++) for (let c=0;c<=4;c++) for (let e=0;e<=2;e++)
  proSeite.add(10*a + 5*b + 2*c + 0.5*e);
const lhBaubar = new Set([...proSeite].map(x => +(7.8 + 2*x).toFixed(1)));
const khProSeite = new Set();
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

const badUrl = plan.exercises.filter(e => e.video && !/^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/.test(e.video))
  .map(e => `${e.name} -> ${e.video}`);
check("Alle Video-URLs wohlgeformt", badUrl.length === 0, badUrl.join(" | "));
check("Jede Uebung ab W27 Fr/Sa hat eine Beschreibung", nw(/./).every(x => !!x.e.description),
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
  goto("2026-10-06");
  check("06.10.2026 = Di W26 (Historie)", label().includes("Di") && label().includes("26"), label());
  check("Di W26: Isometrie statt Floor Press", host().includes("Isometrisches Brustdrücken") && !host().includes("Floor Press"));
  goto("2026-10-13");
  check("13.10.2026 = Di W27 (Historie)", label().includes("Di") && label().includes("27"), label());
  check("Di W27: Floor Press 2x12 kg", host().includes("2x12 kg gesamt je Hantel"));

  // Do 15.10. entfaellt
  goto("2026-10-15");
  check("Do 15.10.2026: keine Einheit", !d.querySelector("#noSession").classList.contains("hidden"));
  check("Do 15.10.2026: Hinweis nennt naechste Einheit Fr 16.10.", d.querySelector("#noSessionMsg").textContent.includes("16.10.2026"),
    d.querySelector("#noSessionMsg").textContent);

  // Freitag
  goto("2026-10-16");
  check("16.10.2026 = Fr W27", label().includes("Fr") && label().includes("27"), label());
  const codes = [...d.querySelectorAll(".excode")].map(x => x.textContent);
  check("Fr W27: Codes A1,A2,B1,B2,C1,C2,D1,D2,E1", codes.join(",") === "A1,A2,B1,B2,C1,C2,D1,D2,E1", codes.join(","));
  const setCodes = [...d.querySelectorAll(".setrow")].map(r => r.dataset.code);
  check("Gerenderte Set-Zeilen eindeutig", new Set(setCodes).size === setCodes.length, setCodes.join(","));
  check("Fr W27: Orte sichtbar", host().includes("DACHGESCHOSS") && host().includes("KELLER"));
  check("Fr W27: Ausstattungshinweis zu den zwei Orten", d.querySelector("#equipList").textContent.includes("Zwei Orte"));
  check("Fr W27: Klimmzug 3 Set-Felder", d.querySelectorAll('.setrow[data-code="A1"] input[data-set]').length === 3);
  check("Fr W27: Finish Goblet", d.querySelector("#finishCard").textContent.includes("Goblet"));
  check("Warm-up: 6 Eintraege", d.querySelectorAll("#warmupList li").length === 6);
  const q = w.eval("buildTimerQueue(currentSession)");
  check("Timer: Sekunden 30,30,30,30,45,60", q.filter(x => x.type === "work").map(x => x.seconds).join(",") === "30,30,30,30,45,60");

  goto("2026-10-17");
  check("17.10.2026 = Sa W27", label().includes("Sa") && label().includes("27"), label());
  check("Sa W27: Treppen mit 13 Set-Feldern", d.querySelectorAll('.setrow[data-code="A1"] input[data-set]').length === 13);
  check("Sa W27: Knie-Liegestuetz + Face Pull", host().includes("auf den Knien") && host().includes("Face Pull"));
  goto("2026-10-20");
  check("Di 20.10.2026: kein Training", !d.querySelector("#noSession").classList.contains("hidden"));
  goto("2026-10-23");
  check("23.10.2026 = Fr W28", label().includes("Fr") && label().includes("28"), label());
  goto("2026-10-30");
  check("30.10.2026 = Fr W29", label().includes("Fr") && label().includes("29"), label());
  goto("2026-10-31");
  check("31.10.2026 = Sa W29 (letzte Einheit)", label().includes("Sa") && label().includes("29"), label());

  // Reps eintragen und einsammeln (Fr)
  goto("2026-10-16");
  const inp = d.querySelector('.setrow[data-code="E1"] input[data-set="0"]');
  inp.value = "15"; inp.dispatchEvent(new w.Event("input"));
  const entry = w.eval("collectEntry()");
  check("collectEntry: E1 = Face Pull, reps[0]=15",
    entry.entries.E1 && entry.entries.E1.reps[0] === "15" && /Face Pull/.test(entry.entries.E1.name), JSON.stringify(entry.entries.E1));
  check("collectEntry: Datum/Woche/Tag", entry.date === "2026-10-16" && entry.week === 27 && entry.day === "Fr");

  // "Letztes Mal": ueber den Namen, auch wenn die Uebung frueher an einem anderen Tag / unter anderem Code lief
  w.eval(`LOGS["2026-10-13"] = {date:"2026-10-13", week:27, day:"Di", entries:{
            B1:{name:"Kurzhantel Floor Press (neutraler Griff)", reps:["11","10","8"], note:"2x20 kg!!"}}};
          LOGS["2026-10-08"] = {date:"2026-10-08", week:26, day:"Do", entries:{
            A1:{name:"Langhantel-Rudern vorgebeugt", reps:["13","11","9"], note:""}}};
          LOGS["2026-08-11"] = {date:"2026-08-11", week:18, day:"Di", entries:{
            B1:{name:"Kurzhantel Floor Press (neutraler Griff)", reps:["10","10","9"], note:""}}};`);
  const lr = JSON.parse(w.eval(`JSON.stringify(lastResult("C1","Fr",27,"Kurzhantel Floor Press (neutraler Griff)"))`));
  check("lastResult Fr C1 findet Di-B1 vom 13.10. (juengster Eintrag)", lr && lr.date === "2026-10-13" && lr.reps[0] === "11", JSON.stringify(lr));
  const lr2 = JSON.parse(w.eval(`JSON.stringify(lastResult("D1","Fr",27,"Langhantel-Rudern vorgebeugt"))`));
  check("lastResult Fr D1 findet Do-A1 vom 08.10.", lr2 && lr2.date === "2026-10-08", JSON.stringify(lr2));
  const lr3 = w.eval(`JSON.stringify(lastResult("B1","Di",26,"Isometrisches Brustdrücken"))`);
  check("lastResult ignoriert Logs anderer Uebungen", lr3 === "null", lr3);
  w.eval(`renderBlocks(currentSession)`);
  check("Fr: 'Letztes Mal' wird angezeigt", host().includes("Letztes Mal (2026-10-13)"));

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

  goto("2026-10-18");
  check("So 18.10. = kein Trainingstag", !d.querySelector("#noSession").classList.contains("hidden"));

  console.log(fails.length ? `\n${fails.length} FEHLER` : "\nALLE TESTS BESTANDEN");
  process.exit(fails.length ? 1 : 0);
}, 300);
