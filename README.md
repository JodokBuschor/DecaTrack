# DecaTrack v10

Neu in v10:
- neues App-Icon integriert (PWA-Icons und Apple-Touch-Icon)
- Service-Worker-Cache auf v10 angehoben
- App-Version auf v10 gesetzt

# DecaTrack v9

## Neu
- Kraft-Verlauf zeigt maximal die letzten 5 Einheiten.
- Jede Disziplin-/Athletikseite zeigt maximal die letzten 5 Trainings.
- Neue, offline verfügbare SVG-Icons in der unteren Tab-Navigation.
- Jede Disziplin wird nur noch mit Name + kleinem Sport-Icon dargestellt.
- Backup-Seite zeigt, welche Datenmengen im Backup enthalten sind.
- Vollständige iPhone/PWA-Vorbereitung mit Manifest, Apple-Touch-Icon, 192/512-PWA-Icons und Offline-Service-Worker.

## Backup
Der Export schreibt den kompletten zentralen App-State in eine JSON-Datei. Enthalten sind:
- Leistungs- und Technikziele
- alle frei angelegten Disziplin-/Athletik-Infos
- alle Disziplintrainings inkl. Datum, Beschreibung, Resultat und Bewertung
- alle Athletiktrainings inkl. Datum, Beschreibung, Resultat und Bewertung
- alle Krafttrainingseinheiten
- alle Übungen je Krafttraining inkl. Sätze, Wiederholungen, Gewicht und Einzelbewertung
- Gesamtbewertung und Notizen jeder Krafttrainingseinheit

Übungs-Dropdown, Kalender und 0–100-Status werden aus diesen gespeicherten Daten berechnet und müssen daher nicht separat gesichert werden.

## Auf dem iPhone als App installieren
Eine PWA muss über HTTPS oder localhost ausgeliefert werden. Einfach die `index.html` aus der Dateien-App zu öffnen reicht für eine zuverlässige PWA nicht.

Empfohlen: GitHub Pages
1. Den gesamten Inhalt dieses Projektordners in ein GitHub-Repository laden.
2. In GitHub: Settings > Pages.
3. Als Source den Branch `main` und den Root-Ordner auswählen.
4. Die erzeugte HTTPS-Adresse auf dem iPhone in Safari öffnen.
5. Teilen-Symbol antippen.
6. `Zum Home-Bildschirm` wählen.
7. `Hinzufügen` wählen.

Danach startet DecaTrack im Standalone-Modus und die App-Dateien stehen nach dem ersten erfolgreichen Laden offline zur Verfügung.

Wichtig: Trainingsdaten liegen weiterhin lokal in Safari/WebKit auf dem iPhone. Regelmässige JSON-Backups sind deshalb empfehlenswert.
