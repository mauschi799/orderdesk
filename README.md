# Orderdesk – Gas-Lieferschein Disposition

> Vollständige MERN-Applikation zur Verwaltung und Disposition von Gas-Lieferscheinen mit Kanban-Workflow und SelectLine-Integration.

---

## Inhaltsverzeichnis

1. [Schnellstart](#schnellstart)
2. [Architektur](#architektur)
3. [Features](#features)
4. [Zugangsdaten (Demo)](#zugangsdaten-demo)
5. [SelectLine Integration](#selectline-integration)
6. [API-Dokumentation](#api-dokumentation)
7. [Deployment (Docker)](#deployment-docker)
8. [Konfiguration](#konfiguration)

---

## Schnellstart

### Voraussetzungen
- Node.js 18+
- MongoDB (lokal oder Atlas)
- npm oder yarn

### 1. Backend

```bash
cd backend
cp .env.example .env
# .env anpassen (MongoDB URI, JWT_SECRET etc.)
npm install
npm run seed    # Demo-Daten laden
npm run dev     # Startet auf Port 5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev     # Startet auf Port 3000
```

### 3. Browser öffnen

```
http://localhost:3000
```

---

## Zugangsdaten (Demo)

| Benutzername | PIN  | Rolle         |
|-------------|------|---------------|
| admin       | 1234 | Administrator |
| disponent   | 2345 | Disponent     |
| lagerist    | 3456 | Lagerist      |
| viewer      | 4567 | Betrachter    |

---

## Architektur

```
orderdesk/
├── backend/
│   └── src/
│       ├── models/          # Mongoose-Modelle (User, Delivery, AuditLog)
│       ├── routes/          # Express-Routen
│       │   ├── auth.js      # Login, Logout, PIN-Änderung
│       │   ├── deliveries.js# CRUD, Status, Kanban-Move
│       │   ├── users.js     # Benutzerverwaltung
│       │   ├── selectline.js# Import-Endpunkte
│       │   ├── audit.js     # Audit-Log
│       │   └── dashboard.js # Statistiken
│       ├── middleware/
│       │   └── auth.js      # JWT-Auth, Rollenprüfung
│       ├── services/
│       │   └── auditService.js
│       └── utils/
│           └── seed.js
│
└── frontend/
    └── src/
        ├── api/             # Axios-API-Client
        ├── components/
│       │   ├── ui/          # Wiederverwendbare UI-Komponenten
│       │   ├── kanban/      # Kanban-Board (DnD)
│       │   └── layout/      # Layout & Sidebar
        ├── pages/           # Seiten-Komponenten
        ├── store/           # Zustand (Auth)
        ├── types/           # TypeScript-Typen
        └── utils/           # Hilfsfunktionen
```

---

## Features

### Kanban-Board
- Drag & Drop zwischen Spalten (dnd-kit)
- Filterbarer nach Lager (Frei, Bengel, Trier)
- Echtzeit-Aktualisierung alle 30 Sekunden
- Farbcodierte Statusspalten

### Statusworkflow
```
neu → nicht_zugewiesen → zugewiesen → gedruckt → in_auslieferung → abgeschlossen
```

### Rollen & Berechtigungen

| Aktion              | Admin | Disponent | Lagerist | Viewer |
|---------------------|-------|-----------|----------|--------|
| Lieferscheine sehen | ✅    | ✅        | ✅       | ✅     |
| Status ändern       | ✅    | ✅        | teilw.   | ❌     |
| Lager zuweisen      | ✅    | ✅        | ❌       | ❌     |
| Drucken             | ✅    | ✅        | ✅       | ❌     |
| Importieren         | ✅    | ✅        | ❌       | ❌     |
| Benutzer verwalten  | ✅    | ❌        | ❌       | ❌     |

---

## SelectLine Integration

### Automatischer API-Import

In `.env` konfigurieren:

```env
SELECTLINE_API_URL=http://ihr-selectline-server/api/v1
SELECTLINE_API_KEY=ihr-api-key
```

Dann über `/import` → "API Import" ausführen.

**Erwartetes SelectLine-API-Format (GET /lieferscheine):**
```json
[
  {
    "Id": "SL-12345",
    "BelegNr": "LS-2024-0001",
    "AuftragNr": "A-2024-0042",
    "KundenNr": "K-1001",
    "Name": "Musterfirma GmbH",
    "Lieferdatum": "2024-12-01",
    "Strasse": "Musterstraße 1",
    "PLZ": "54290",
    "Ort": "Trier",
    "Telefon": "0651-12345",
    "Positionen": [
      {
        "ArtNr": "G-11KG",
        "Bezeichnung": "Propangas 11kg Flasche",
        "Menge": 5,
        "Einheit": "Stk",
        "Leergewicht": 7.8,
        "Fuellgewicht": 18.8
      }
    ]
  }
]
```

> Die Feldnamen werden automatisch auf gängige SelectLine-Varianten gemappt (z.B. `Belegnummer`, `KundenName`, `LieferStrasse` etc.)

### Manueller JSON-Import

Alternativ können SelectLine-Exporte als JSON in `/import` → "JSON einfügen" direkt eingefügt werden.

### Import-Logik
- **Neu**: Wird importiert mit Status `neu`
- **Update**: Wenn `neu` oder `nicht_zugewiesen`, wird aktualisiert
- **Skip**: Wenn bereits in Bearbeitung → wird übersprungen
- Alle Importe werden im Audit-Log protokolliert

---

## API-Dokumentation

### Authentifizierung
```
POST /api/auth/login        { username, pin }
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/change-pin   { currentPin, newPin }
```

### Lieferscheine
```
GET    /api/deliveries              ?status=&lager=&search=&page=&limit=
GET    /api/deliveries/kanban       ?lager=
GET    /api/deliveries/:id
POST   /api/deliveries
PUT    /api/deliveries/:id
DELETE /api/deliveries/:id          (nur Admin)

PATCH  /api/deliveries/:id/status   { status, notiz? }
PATCH  /api/deliveries/:id/lager    { lager }
PATCH  /api/deliveries/:id/print
PATCH  /api/deliveries/kanban/move  { deliveryId, spalte, position }
```

### SelectLine Import
```
GET  /api/selectline/test
POST /api/selectline/import         { startDate?, endDate? }
POST /api/selectline/import-manual  { data: [...] }
```

### Benutzer (Admin)
```
GET    /api/users
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
```

### Dashboard & Audit
```
GET /api/dashboard/stats
GET /api/audit              ?aktion=&page=&limit=
```

---

## Deployment (Docker)

```bash
# .env Datei anlegen
cat > .env << EOF
JWT_SECRET=ihr-sehr-langer-geheimer-schluessel-mindestens-32-zeichen
SELECTLINE_API_URL=http://ihr-selectline-server/api
SELECTLINE_API_KEY=ihr-api-key
EOF

# Starten
docker-compose up -d

# Demodata laden
docker-compose exec backend node src/utils/seed.js

# Logs
docker-compose logs -f
```

---

## Konfiguration

### Backend `.env`

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/orderdesk
JWT_SECRET=min-32-zeichen-langer-geheimer-schluessel
JWT_EXPIRES_IN=8h
AUTO_LOGOUT_MINUTES=60
FRONTEND_URL=http://localhost:3000

# SelectLine (optional)
SELECTLINE_API_URL=http://selectline-server/api/v1
SELECTLINE_API_KEY=api-key
```

---

## Erweiterungsmöglichkeiten

- **WebSockets**: Echtzeit-Updates zwischen Dispositieon und Lager
- **Push-Notifications**: Bei Statusänderungen benachrichtigen
- **Kartenansicht**: Leaflet/OpenStreetMap für Kundenstandorte (Geocoding via Nominatim)
- **Tourenplanung**: Gruppierung von Lieferscheinen zu Touren
- **Mobile App**: React Native mit gleicher API
- **Automatischer Import**: Cron-Job für regelmäßigen SelectLine-Abgleich
- **E-Mail-Benachrichtigungen**: Bei Statuswechseln via Nodemailer
- **Barcode/QR-Scanner**: Für schnelle Statuserfassung im Lager

---

## Lizenz

Intern – alle Rechte vorbehalten.
