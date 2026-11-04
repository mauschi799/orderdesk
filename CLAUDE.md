# Hinweise für Claude Code (und Entwickler)

## Versionierung: bei JEDEM Commit/Push Pflicht

Die App vergleicht unter **Einstellungen → Application** die installierte Version mit
`main` auf GitHub und zeigt, was sich durch ein Update ändert. Das funktioniert nur, wenn
bei jedem Push, der ausgeliefert wird, die Versionsnummer erhöht und der Changelog gepflegt wird.

1. **Versionsnummer erhöhen** (SemVer):
   - Patch (`1.1.0` → `1.1.1`): Fehlerbehebungen
   - Minor (`1.1.0` → `1.2.0`): neue Funktionen
   - Major (`1.x` → `2.0.0`): grundlegende Umbauten / Inkompatibilitäten
   - Einzige Quelle: `backend/package.json` → `version`. `frontend/package.json` bekommt dieselbe Nummer:
     `(cd backend && npm version X.Y.Z --no-git-tag-version) && (cd frontend && npm version X.Y.Z --no-git-tag-version)`
2. **`CHANGELOG.md` ergänzen**: ganz oben neuer Abschnitt `## [X.Y.Z] - JJJJ-MM-TT` mit
   `### Neu` / `### Geändert` / `### Behoben` und Stichpunkten (`- `), die ein Anwender versteht
   (keine Dateinamen/Interna). Die App zeigt genau diese Stichpunkte im Update-Hinweis an.
3. Version und Changelog gehören **in denselben Commit** wie die Änderung (oder in den letzten Commit vor dem Push).
4. Beim Commit-Hinweis an den Nutzer die neue Versionsnummer nennen.

Ohne Versions-Bump erkennt die App keine neue Version (sie zeigt dann nur die Commit-Liste).
