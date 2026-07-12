# Franks Training-App

Web-App für den Fitness-Masterplan (Juli 2026, 90°-Variante v2). Läuft komplett statisch auf GitHub Pages; Trainingsergebnisse werden per GitHub-API als `data/logs.json` ins Repo geschrieben.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Die komplette App (eine Datei, kein Build nötig) |
| `plan.json` | Trainingsplan, generiert aus der Master-Excel |
| `tools/xlsx_to_plan.py` | Konverter Excel → `plan.json` (bei Plan-Updates neu ausführen) |
| `data/logs.json` | Wird von der App beim ersten Speichern angelegt |

## Einrichtung (einmalig, ~10 Minuten)

### 1. Repo anlegen und Dateien hochladen
1. Auf https://github.com/new ein **öffentliches** Repo anlegen, z.B. `fitness-app`.
2. Alle Dateien dieses Ordners hochladen (Add file → Upload files) oder per git pushen.

### 2. GitHub Pages aktivieren
1. Im Repo: **Settings → Pages**.
2. Source: **Deploy from a branch**, Branch: `main`, Ordner: `/ (root)` → Save.
3. Nach 1–2 Minuten ist die App unter `https://<benutzername>.github.io/fitness-app/` erreichbar.

### 3. Token für das Speichern erstellen (Fine-grained PAT)
1. https://github.com/settings/personal-access-tokens → **Generate new token**.
2. Name z.B. `fitness-app`, Expiration z.B. 90 Tage (danach neu erzeugen).
3. **Repository access: Only select repositories** → nur `fitness-app` auswählen.
4. **Permissions → Repository permissions → Contents: Read and write.** Sonst nichts.
5. Token kopieren (`github_pat_…`).

### 4. App konfigurieren
In der App auf ⚙️ tippen: GitHub-Benutzername, Repo-Name, Branch `main`, Token einfügen → **Verbindung testen** → Speichern. Der Token bleibt nur im Browser (localStorage) des jeweiligen Geräts und geht direkt an `api.github.com`.

> Hinweis: Das Repo ist öffentlich (Voraussetzung für kostenloses GitHub Pages), also sind Plan und Trainingslogs öffentlich lesbar. Der Token gehört **nicht** ins Repo – nur in die App-Einstellungen.

## Tägliche Nutzung
1. App öffnen – sie zeigt automatisch die Einheit für heute (oder den nächsten Trainingstag).
2. **Vorbereiten:** Equipment-Liste für den Tag.
3. **Warm-up:** Start drücken – 30 s pro Übung (Seiten einzeln), 5 s Pause, lauter Signalton am Ende jeder Übung. Handy nicht stummschalten.
4. **Training:** Pro Übung Reps je Runde eintragen (bei „je Seite" z.B. `8/8`). Eingaben werden lokal zwischengespeichert.
5. **💾 In GitHub speichern** – schreibt den Tag in `data/logs.json`.
6. ⬇︎ lädt jederzeit ein lokales JSON-Backup herunter.

## Datum / Pause / Verschieben
- Anderes Datum oben wählen, um nachzutragen oder vorzuarbeiten.
- Nach einer Trainingspause (z.B. Reise): unter ⚙️ **„Montag der Plan-Woche 12"** entsprechend nach hinten setzen – der gesamte Plan verschiebt sich mit. Standard: 13.07.2026 (Woche 12 = 14./16./18.07.).

## Plan-Update (neuer Masterplan aus Excel)
```bash
pip install openpyxl
python3 tools/xlsx_to_plan.py "Pfad/zum/neuen Masterplan.xlsx" plan.json
```
Dann `plan.json` ins Repo committen.

## Auswertung durch Claude
`data/logs.json` im Repo enthält pro Datum: Woche, Tag, Reps pro Satz, Notizen. Im Projekt „Franks Fitness Plan" einfach sagen: *„Lies meine Logs aus dem Repo und prüfe, ob die Progression passt"* – die Datei ist öffentlich unter
`https://raw.githubusercontent.com/<benutzername>/fitness-app/main/data/logs.json` lesbar.
