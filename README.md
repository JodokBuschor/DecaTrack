# DecaTrack v12

DecaTrack ist ein lokales, frei konfigurierbares Trainingstagebuch als Progressive Web App (PWA). Die App speichert alle Daten im Browser und kann auf dem iPhone zum Home-Bildschirm hinzugefügt werden.

## Neu in v12

- Disziplinen sind nicht mehr fest im Code vorgegeben.
- Eigene Disziplinen können hinzugefügt, umbenannt, mit Icon/Farbe versehen und gelöscht werden.
- Bei einem Update von v11 werden die bisherigen zehn Zehnkampf-Disziplinen und Athletik automatisch übernommen.
- Krafttraining: das Feld „Gewicht / Last“ akzeptiert Freitext, z. B. `100–120 kg`, `BW + 20 kg` oder `100 kg + Band`.
- Disziplin-Infos sind immer sichtbar; das Formular für neue Infos erscheint erst nach „+ Info“.
- Einzelne Disziplin-Infos können bearbeitet und gelöscht werden.
- Ziele sind auf der Disziplinseite optisch stärker hervorgehoben.
- Disziplintrainings können nachträglich bearbeitet werden.
- Krafteinheiten können nachträglich bearbeitet werden, inklusive Übungen, Sätzen, Wiederholungen, Last, Bewertungen und Notizen.
- Manifest und App-Beschreibung wurden von „Zehnkampf“ auf ein universelles Trainingstagebuch angepasst.
- Die iPhone-Optimierungen aus v11 bleiben erhalten: 16-px-Formfelder gegen Safari-Autozoom, responsive Boxen und PWA-Unterstützung.

## Datenspeicherung und Migration

Der LocalStorage-Key bleibt unverändert (`decatrack_v1`). Dadurch findet v12 die bestehenden v11-Daten automatisch.

Beim ersten Laden von v12 werden alte Daten in das neue v12-Format überführt. Athletik wird dabei zu einer normalen, frei verwaltbaren Disziplin. Bestehende Athletiktrainings werden in die gemeinsame Trainingsliste übernommen.

## Backup

Der JSON-Export enthält den kompletten zentralen App-State:

- selbst angelegte Disziplinen mit Name, Icon und Farbe
- Leistungs- und Technikziele
- alle Disziplin-Infos
- alle Disziplintrainings mit Datum, Beschreibung, Resultat und Bewertung
- alle Krafttrainingseinheiten
- alle Übungen je Krafteinheit inklusive Sätze, Wiederholungen, Last und Einzelbewertung
- Gesamtbewertung und Notizen jeder Krafteinheit

Ein v11-Backup kann weiterhin importiert werden und wird beim Import automatisch migriert.

## PWA / iPhone

Die App enthält weiterhin:

- `manifest.webmanifest`
- Apple-Touch-Icon
- 192x192- und 512x512-PWA-Icons
- Service Worker für Offline-Nutzung
- Safe-Area-Unterstützung für iPhones
- Formfeld-Grössen, die Safari-Autozoom verhindern

Wichtig: Für Service Worker und PWA-Installation muss die App über HTTPS oder localhost ausgeliefert werden, z. B. über GitHub Pages.
