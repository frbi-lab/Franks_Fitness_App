// Headless-Smoke-Test der App (jsdom). Aufruf: node smoke_test.js  (aus fitness-app/ heraus)
//
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
check("12 Sessions", plan.sessions.length === 12, plan.sessions.length);
check("Wochen 16-19", JSON.stringify(plan.meta.weeks) === "[16,17,18,19]", JSON.stringify(plan.meta.weeks));
check("Anker week12Monday = 2026-06-29", plan.meta.week12Monday === "2026-06-29", plan.meta.week12Monday);

// Franks Regel 16.08.2026: keine "je Seite"-Uebung mehr im Warm-up
const perSideWU = plan.sessions.flatMap(s => s.warmup.filter(x => x.perSide).map(x => `W${s.week}${s.day}:${x.name}`));
check("Warm-up: keine 'je Seite'-Uebung mehr", perSideWU.length === 0, perSideWU.join(", "));

// Franks Regel 16.08.2026: Gewichtsweste nie in einem alternierenden Paar
const westeKonflikt = [];
plan.sessions.forEach(s => s.blocks.forEach(b => {
  if (b.exercises.length < 2) return;                       // Einzeluebung: Weste unproblematisch
  const mit = b.exercises.filter(e => /Gewichtsweste/i.test(e.resistance || "")).length;
  if (mit > 0 && mit < b.exercises.length) westeKonflikt.push(`W${s.week} ${s.day} ${b.block}`);
}));
check("Gewichtsweste in keinem Superset", westeKonflikt.length === 0, westeKonflikt.join(", "));

// App speichert Logs unter dem Uebungscode -> Codes muessen je Session eindeutig sein
const codeKollision = [];
plan.sessions.forEach(s => {
  const codes = s.blocks.flatMap(b => b.exercises.map(e => e.code));
  if (new Set(codes).size !== codes.length) codeKollision.push(`W${s.week} ${s.day}: ${codes.join(",")}`);
});
check("Uebungscodes je Session eindeutig", codeKollision.length === 0, codeKollision.join(" | "));

// Physio-Uebung: je Woche genau Di + Sa, immer 3x10, immer mit der Kernvorgabe
const liege = {};
plan.sessions.forEach(s => s.blocks.forEach(b => b.exercises.forEach(e => {
  if (/Liegestütz exzentrisch/.test(e.name)) (liege[s.week] = liege[s.week] || []).push(s.day);
})));
check("Exzentrische Liegestuetze: je Woche Di + Sa",
  [16,17,18,19].every(x => (liege[x] || []).sort().join(",") === "Di,Sa"), JSON.stringify(liege));
const liegeEx = plan.sessions.flatMap(s => s.blocks.flatMap(b => b.exercises)).filter(e => /Liegestütz/.test(e.name));
check("Liegestuetze immer 3x10", liegeEx.every(e => e.sets === 3 && e.targetReps === "10"));
check("Vorgabe enthaelt 'KEIN Hochdruecken' und 45-Grad-Ellbogen",
  liegeEx.every(e => /KEIN Hochdrücken/.test(e.resistance) && /45 Grad/.test(e.resistance)));

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
  .filter(e => /Overhead|Schulterdrücken|Klimmzug|Hängen/i.test(e.name)).map(e => e.name);
check("Keine Uebung ueber Schulterhoehe", ueber90.length === 0, ueber90.join(", "));

/* =================================================================
   TEIL 2 - App-Verhalten
   ================================================================= */
setTimeout(() => {
  // W19 Di = 18.08.2026 (week12Monday 29.06. + 7 Wochen)
  goto("2026-08-18");
  const label = d.querySelector("#sessionLabel").textContent;
  check("18.08.2026 = Di W19", label.includes("Di") && label.includes("19"), label);

  const codes = [...d.querySelectorAll(".excode")].map(x => x.textContent);
  check("Di W19: Codes A1,A2,B1,B2,C1,C2,D1",
    ["A1","A2","B1","B2","C1","C2","D1"].every(c => codes.includes(c)), codes.join(","));
  const setCodes = [...d.querySelectorAll(".setrow")].map(r => r.dataset.code);
  check("Gerenderte Set-Zeilen eindeutig (Log kann nicht ueberschrieben werden)",
    new Set(setCodes).size === setCodes.length, setCodes.join(","));
  check("Cool-down rendert als D1, nicht A1", setCodes.includes("D1"), setCodes.join(","));
  check("Di W19 B1 = exzentrische Liegestuetze",
    d.querySelector('.setrow[data-code="B1"]').parentElement.textContent.includes("Liegestütz"));
  check("Di W19: kein Floor Press mehr", !d.querySelector("#blocksHost").textContent.includes("Floor Press"));
  // Nur die Widerstandsangaben pruefen: in der Ausfuehrungs-Beschreibung darf "Gewichtsweste"
  // vorkommen (dort steht bewusst, dass die Liegestuetze NICHT mit Weste gesteigert werden).
  check("Di W19: keine Gewichtsweste in den Widerstandsangaben",
    ![...d.querySelectorAll("#blocksHost .exres")].some(x => x.textContent.includes("Gewichtsweste")));
  check("Di W19: nur EINE Kurzhantel-Einstellung",
    new Set((d.querySelector("#equipList").textContent.match(/2x\d+ kg gesamt je Hantel/g) || [])).size === 1,
    d.querySelector("#equipList").textContent.match(/2x\d+ kg gesamt je Hantel/g));

  check("Warm-up: 6 Eintraege", d.querySelectorAll("#warmupList li").length === 6,
    d.querySelectorAll("#warmupList li").length);
  const q = w.eval("buildTimerQueue(currentSession)");
  const works = q.filter(x => x.type === "work");
  check("Timer: 6 work-Segmente (Aussenrotation nur einmal)", works.length === 6, works.length);
  check("Timer: kein 'links'/'rechts' mehr",
    !works.some(x => /links|rechts/i.test(x.name || "")), works.map(x => x.name).join(" | "));
  check("Timer: alle Segmente 30s", works.every(x => x.seconds === 30));

  // Do W19 = 20.08.2026: Weste sitzt beim Goblet-Finisher, RDL zurueck auf 50,8 kg
  goto("2026-08-20");
  check("20.08.2026 = Do W19", d.querySelector("#sessionLabel").textContent.includes("19"));
  check("Do W19: Weste steht beim Goblet-Finisher",
    d.querySelector("#finishCard").textContent.includes("Gewichtsweste"));
  check("Do W19: RDL 50,8 kg", d.querySelector("#blocksHost").textContent.includes("50,8 kg"));
  check("Do W19: Chest-Press DUNKELGRUEN", d.querySelector("#blocksHost").textContent.includes("Band DUNKELGRUEN (60-170"));

  // Sa W19 = 22.08.2026: Treppen + neuer Liegestuetz-Block
  goto("2026-08-22");
  check("22.08.2026 = Sa W19", d.querySelector("#sessionLabel").textContent.includes("19"));
  check("Sa W19: Treppen-Aufstieg mit 10 Set-Feldern",
    d.querySelectorAll('.setrow[data-code="A1"] input[data-set]').length === 10,
    d.querySelectorAll('.setrow[data-code="A1"] input[data-set]').length);
  check("Sa W19: Liegestuetz-Block vorhanden", d.querySelector("#blocksHost").textContent.includes("Liegestütz exzentrisch"));
  check("Sa W19: Liegestuetz hat 3 Set-Felder",
    d.querySelectorAll('.setrow[data-code="B1"] input[data-set]').length === 3);

  // Reps eintragen und einsammeln
  const inp = d.querySelector('.setrow[data-code="B1"] input[data-set="0"]');
  inp.value = "10"; inp.dispatchEvent(new w.Event("input"));
  const entry = w.eval("collectEntry()");
  check("collectEntry: B1 = Liegestuetz, reps[0]=10",
    entry.entries.B1 && entry.entries.B1.reps[0] === "10" && /Liegestütz/.test(entry.entries.B1.name),
    JSON.stringify(entry.entries.B1));
  check("collectEntry: Datum/Woche/Tag",
    entry.date === "2026-08-22" && entry.week === 19 && entry.day === "Sa");

  // "Letztes Mal" darf nach einem Uebungstausch nicht die Vorgaengeruebung zeigen
  w.eval(`LOGS["2026-08-11"] = {date:"2026-08-11", week:18, day:"Di", entries:{
            B1:{name:"Kurzhantel Floor Press (neutraler Griff)", reps:["10","10","9"], note:""}}};`);
  const lr = w.eval(`JSON.stringify(lastResult("B1","Di",19,"Liegestütz exzentrisch (nur ablassen)"))`);
  check("lastResult ignoriert Logs der ersetzten Uebung", lr === "null", lr);
  const lr2 = w.eval(`JSON.stringify(lastResult("B1","Di",19,"Kurzhantel Floor Press (neutraler Griff)"))`);
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
  goto("2026-08-23");
  check("So 23.08. = kein Trainingstag", !d.querySelector("#noSession").classList.contains("hidden"));

  console.log(fails.length ? `\n${fails.length} FEHLER` : "\nALLE TESTS BESTANDEN");
  process.exit(fails.length ? 1 : 0);
}, 300);
