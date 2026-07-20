import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Store, History, Clock, User, ChevronDown, ChevronUp, Filter, Printer } from 'lucide-react';
import { lagerApi } from '../api';
import { LagerMeldung } from '../types';
import { Card, PageHeader } from '../components/ui';
import { formatDateTime, cn } from '../utils';

function drucken(m: LagerMeldung) {
  const meldender = m.gemeldetVon && typeof m.gemeldetVon === 'object' ? m.gemeldetVon.name : String(m.gemeldetVon ?? '–');
  const datum = new Date(m.gemeldetAm).toLocaleString('de-DE', { dateStyle: 'full', timeStyle: 'short' });

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Lagerbestand – ${m.filiale}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12pt; color: #000; padding: 20mm; }
    h1 { font-size: 18pt; font-weight: bold; margin-bottom: 4px; }
    .meta { color: #555; font-size: 10pt; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead th { text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em;
                border-bottom: 2px solid #000; padding: 4px 12px 4px 0; }
    tbody td { padding: 6px 12px 6px 0; border-bottom: 1px solid #e0e0e0; font-size: 11pt; }
    .col-nr   { width: 90px; font-family: monospace; color: #666; font-size: 10pt; }
    .col-menge { width: 70px; text-align: right; font-weight: 600; }
    .col-einheit { width: 60px; color: #555; }
    .notiz { margin-top: 20px; font-size: 10pt; color: #555; font-style: italic;
              border-top: 1px solid #e0e0e0; padding-top: 10px; }
    .footer { position: fixed; bottom: 10mm; left: 20mm; right: 20mm;
               font-size: 9pt; color: #aaa; border-top: 1px solid #eee;
               padding-top: 4px; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <h1>${m.filiale}</h1>
  <div class="meta">
    Lagerbestand vom ${datum}<br>
    Gemeldet von: ${meldender}
  </div>
  <table>
    <thead>
      <tr>
        <th class="col-nr">Art.-Nr.</th>
        <th>Bezeichnung</th>
        <th class="col-menge" style="text-align:right">Menge</th>
        <th class="col-einheit">Einheit</th>
      </tr>
    </thead>
    <tbody>
      ${m.positionen.map(p => `
        <tr>
          <td class="col-nr">${p.artikelnummer || '–'}</td>
          <td>${p.beschreibung}</td>
          <td class="col-menge">${p.menge}</td>
          <td class="col-einheit">${p.einheit}</td>
        </tr>`).join('')}
    </tbody>
  </table>
  ${m.notiz ? `<div class="notiz">Notiz: ${m.notiz}</div>` : ''}
  <div class="footer">
    <span>${m.filiale} – Lagerbestand</span>
    <span>${datum}</span>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=800,height=600');
  if (w) { w.document.write(html); w.document.close(); }
}

function MeldungCard({ m, expanded, onToggle }: { m: LagerMeldung; expanded: boolean; onToggle: () => void }) {
  const meldender = m.gemeldetVon && typeof m.gemeldetVon === 'object' ? m.gemeldetVon.name : String(m.gemeldetVon ?? '–');
  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
              <Store className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-sm">{m.filiale}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <Clock className="w-3 h-3" />
                {formatDateTime(m.gemeldetAm)}
                <User className="w-3 h-3 ml-1" />
                {meldender}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{m.positionen.length} Positionen</span>
            {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </button>
        <button
          onClick={e => { e.stopPropagation(); drucken(m); }}
          title="Drucken"
          className="px-3 py-4 text-slate-300 hover:text-slate-600 hover:bg-slate-50 transition-colors border-l border-slate-100 self-stretch flex items-center"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-50">
          <table className="w-full mt-3">
            <thead>
              <tr>
                {['Art.-Nr.', 'Bezeichnung', 'Menge', 'Einheit'].map(h => (
                  <th key={h} className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {m.positionen.map((pos, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-4 text-xs font-mono text-slate-400">{pos.artikelnummer || '–'}</td>
                  <td className="py-1.5 pr-4 text-sm text-slate-700">{pos.beschreibung}</td>
                  <td className="py-1.5 pr-4 text-sm font-medium text-slate-800 text-right tabular-nums">{pos.menge}</td>
                  <td className="py-1.5 text-sm text-slate-500">{pos.einheit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {m.notiz && (
            <p className="mt-3 text-xs text-slate-400 italic border-t border-slate-50 pt-3">{m.notiz}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function LagerUebersichtPage() {
  const [tab, setTab] = useState<'aktuell' | 'verlauf'>('aktuell');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterFiliale, setFilterFiliale] = useState('');

  const { data: aktuellRaw = [], isLoading: loadingAktuell } = useQuery<LagerMeldung[]>({
    queryKey: ['lager-aktuell'],
    queryFn: lagerApi.aktuell,
    enabled: tab === 'aktuell',
  });

  const { data: verlauf = [], isLoading: loadingVerlauf } = useQuery<LagerMeldung[]>({
    queryKey: ['lager-verlauf', filterFiliale],
    queryFn: () => lagerApi.meldungen({ filiale: filterFiliale || undefined, limit: 200 }),
    enabled: tab === 'verlauf',
  });

  const { data: filialen = [] } = useQuery<string[]>({
    queryKey: ['lager-filialen'],
    queryFn: lagerApi.filialen,
  });

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id);

  // Aktuell-Tab: client-seitig nach Filiale filtern
  const aktuell = filterFiliale
    ? aktuellRaw.filter(m => m.filiale === filterFiliale)
    : aktuellRaw;

  const data = tab === 'aktuell' ? aktuell : verlauf;
  const isLoading = tab === 'aktuell' ? loadingAktuell : loadingVerlauf;

  return (
    <div>
      <PageHeader
        title="Lagerbestände"
        subtitle={filterFiliale ? filterFiliale : `${aktuellRaw.length} Filialen`}
      />

      <div className="p-6 max-w-3xl space-y-4">

        {/* Tabs + Filter in einer Zeile */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
            {([
              { key: 'aktuell', label: 'Aktuell', icon: Store },
              { key: 'verlauf', label: 'Verlauf', icon: History },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  tab === key
                    ? 'bg-white text-slate-800 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {filialen.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={filterFiliale}
                onChange={e => { setFilterFiliale(e.target.value); setExpandedId(null); }}
                className={cn(
                  'px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition-colors',
                  filterFiliale
                    ? 'border-orange-300 bg-orange-50 text-orange-700 font-medium'
                    : 'border-slate-200'
                )}
              >
                <option value="">Alle Filialen</option>
                {filialen.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              {filterFiliale && (
                <button
                  onClick={() => setFilterFiliale('')}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Zurücksetzen
                </button>
              )}
            </div>
          )}
        </div>

        {/* Liste */}
        {isLoading && (
          <div className="text-sm text-slate-400 text-center py-8">Lädt...</div>
        )}

        {!isLoading && data.length === 0 && (
          <Card className="p-8 text-center">
            <Store className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">
              {filterFiliale ? `Keine Meldungen für "${filterFiliale}"` : 'Noch keine Bestandsmeldungen vorhanden'}
            </p>
          </Card>
        )}

        <div className="space-y-2">
          {data.map((m: LagerMeldung) => (
            <Card key={m._id} className="overflow-hidden p-0">
              <MeldungCard
                m={m}
                expanded={expandedId === m._id}
                onToggle={() => toggle(m._id)}
              />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
