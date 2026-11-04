# Changelog

Jede ausgelieferte Version bekommt einen Eintrag. Die App liest diese Datei unter
**Einstellungen → Application** und zeigt dort, was ein verfügbares Update ändert.

Format: `## [Version] - Datum`, darunter optional `### Kategorie` und Stichpunkte mit `- `.

## [1.1.1] - 2026-11-04

### Behoben
- Application: Wenn der genaue Stand (Commit) der laufenden Version unbekannt ist, wird nicht mehr pauschal „Neuere Version verfügbar" angezeigt, sondern nur anhand der Versionsnummer verglichen. Dazu gibt es einen Hinweis, wie Commit, Installationsdatum und Update-Button über `./update.sh` aktiviert werden.

## [1.1.0] - 2026-11-04

### Neu
- Aktualisierung aus der App: Unter Einstellungen → Application zeigt die App, ob eine neuere Version verfügbar ist und was sich ändert, und kann das Update selbst einspielen (mit automatischem Zurückrollen bei Fehlern)
- Versionsnummer mit Abgleich gegen GitHub und diese Änderungsübersicht
- Barzahler (Zahlungsart 14): Eine bereits geschriebene Rechnung schließt den Lieferschein nicht mehr automatisch ab, er bleibt im Orderdesk offen, bis ihn jemand abschließt
- Läger frei verwaltbar (Administrator): neue Auslieferungsläger anlegen, bearbeiten und deaktivieren, das Kanban-Board passt sich an
- Verlauf in der Lieferschein-Detailansicht: wer hat wann Status oder Lager geändert
- Lieferschein-Status ist jetzt auf jeden Status frei änderbar (nicht mehr nur Schritt für Schritt)
- Auto-Import: Ruhezeit (Standard 18:00 bis 07:30), in der nicht automatisch synchronisiert wird
- Kartenansicht: Details und Positionen im Seitenpanel, Lieferschein direkt zu einer Tour hinzufügen oder neue Tour anlegen

### Geändert
- Menü: Einstellungen und Verwaltung sind aufklappbare Gruppen, "Einstellungen" heißt jetzt "Mein Konto"
- Geocoding findet Adressen auch bei kleineren Abweichungen (z.B. "Am Kornmarkt" statt "Kornmarkt"); nicht auffindbare Straßen werden als ungenau (Ortsmittelpunkt) markiert

### Behoben
- SelectLine-Import: An Tagen mit mehr als 10 Lieferscheinen fehlten die übrigen, sie werden jetzt nachgeladen; nicht vollständig ladbare Tage erscheinen als Hinweis im Import-Ergebnis

## [1.0.0] - 2026-07-29

### Neu
- Erste Version: Kanban-Board, Lieferscheine, SelectLine-Import, Tourenplanung, Kartenansicht, Benutzer- und Rechteverwaltung
