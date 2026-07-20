import { useState, useRef } from 'react';
import { Send, Clock, ChevronDown, ChevronRight, Zap, Server, RotateCcw, Copy, Check } from 'lucide-react';
import { PageHeader, Card, Button } from '../components/ui';
import { cn } from '../utils';
import api from '../api';

type Mode = 'selectline' | 'intern';
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface HistoryEntry {
  id: number;
  mode: Mode;
  method: Method;
  path: string;
  status: number;
  duration: number;
  ts: string;
}

interface Response {
  status: number;
  statusText: string;
  duration: number;
  url: string;
  data: unknown;
  error?: string;
}

const SL_PRESETS: { label: string; method: Method; path: string; group: string }[] = [
  // Lieferscheine / Belege
  { group: 'Lieferscheine', label: 'Alle (Top 5)',    method: 'GET', path: "/Documents?filter=KindFlag EQ 'L'&$top=5" },
  { group: 'Lieferscheine', label: 'Einzeln by Key', method: 'GET', path: '/Documents/{KEY}' },
  { group: 'Lieferscheine', label: '+ Positionen',   method: 'GET', path: '/Documents/{KEY}/Positions' },
  // Adressen
  { group: 'Adressen', label: 'Customers (Top 5)',         method: 'GET', path: '/Customers?$top=5' },
  { group: 'Adressen', label: 'BusinessPartners (Top 5)',  method: 'GET', path: '/BusinessPartners?$top=5' },
  { group: 'Adressen', label: 'Addresses (Top 5)',         method: 'GET', path: '/Addresses?$top=5' },
  // Delivery addresses (verschiedene Versuche)
  { group: 'Lieferadressen?', label: 'DocumentAddresses',  method: 'GET', path: '/DocumentAddresses?$top=5' },
  { group: 'Lieferadressen?', label: 'BelegAdressen',      method: 'GET', path: '/BelegAdressen?$top=5' },
  { group: 'Lieferadressen?', label: 'DeliveryAddresses',  method: 'GET', path: '/DeliveryAddresses?$top=5' },
  { group: 'Lieferadressen?', label: 'Doc + expand DA',    method: 'GET', path: "/Documents?filter=KindFlag EQ 'L'&$top=3&$expand=DeliveryAddress" },
  { group: 'Lieferadressen?', label: 'Doc + expand Lf',    method: 'GET', path: "/Documents?filter=KindFlag EQ 'L'&$top=3&expand=Lieferadresse" },
  // Misc
  { group: 'Sonstiges', label: 'Artikel (Top 5)',  method: 'GET', path: '/Articles?$top=5' },
  { group: 'Sonstiges', label: 'Login (Auth)',     method: 'POST', path: '/Login' },
];

const INTERN_PRESETS: { label: string; method: Method; path: string; group: string }[] = [
  { group: 'Lager',         label: 'Produkte',                  method: 'GET',    path: '/api/lager/produkte' },
  { group: 'Lager',         label: 'Meldungen',                 method: 'GET',    path: '/api/lager/meldungen?limit=5' },
  { group: 'Lager',         label: 'Aktuell',                   method: 'GET',    path: '/api/lager/aktuell' },
  { group: 'Lager',         label: 'Filialen',                  method: 'GET',    path: '/api/lager/filialen' },
  { group: 'SelectLine',    label: 'Verbindungstest',           method: 'GET',    path: '/api/selectline/test' },
  { group: 'System',        label: 'Health',                    method: 'GET',    path: '/api/health' },
  { group: 'System',        label: 'Benutzer',                  method: 'GET',    path: '/api/users' },
  { group: 'System',        label: 'Dashboard Stats',           method: 'GET',    path: '/api/dashboard/stats' },
  { group: 'System',        label: 'Cron History',              method: 'GET',    path: '/api/cron/history' },
  { group: '⚠️ Wartung',   label: 'ALLE Lieferscheine löschen', method: 'DELETE', path: '/api/deliveries/all' },
  { group: '⚠️ Wartung',   label: '🔴 KOMPLETT-RESET (alle Daten)', method: 'DELETE', path: '/api/admin/reset' },
];

const METHOD_COLORS: Record<Method, string> = {
  GET:    'bg-green-50  text-green-700  border-green-200',
  POST:   'bg-blue-50   text-blue-700   border-blue-200',
  PUT:    'bg-amber-50  text-amber-700  border-amber-200',
  PATCH:  'bg-orange-50 text-orange-700 border-orange-200',
  DELETE: 'bg-red-50    text-red-700    border-red-200',
};

function statusColor(s: number) {
  if (s >= 200 && s < 300) return 'bg-green-100 text-green-800';
  if (s >= 300 && s < 400) return 'bg-blue-100 text-blue-800';
  if (s >= 400 && s < 500) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

function groupBy<T extends { group: string }>(arr: T[]) {
  const map: Record<string, T[]> = {};
  arr.forEach(item => { (map[item.group] ??= []).push(item); });
  return map;
}

let _id = 0;

export default function ApiTesterPage() {
  const [mode, setMode] = useState<Mode>('selectline');
  const [method, setMethod] = useState<Method>('GET');
  const [path, setPath] = useState('');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [presetsOpen, setPresetsOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const pathRef = useRef<HTMLInputElement>(null);

  const presets = mode === 'selectline' ? SL_PRESETS : INTERN_PRESETS;
  const groups = groupBy(presets);

  const applyPreset = (p: typeof presets[0]) => {
    setMethod(p.method);
    setPath(p.path);
    setBody('');
    pathRef.current?.focus();
  };

  const send = async () => {
    if (!path.trim()) return;
    setLoading(true);
    setResponse(null);
    try {
      let parsedBody: unknown = undefined;
      if (body.trim()) {
        try { parsedBody = JSON.parse(body); }
        catch { /* send as-is */ parsedBody = body; }
      }
      const { data } = await api.post(`/debug/${mode}`, {
        path: path.trim(),
        method,
        body: parsedBody,
      });
      setResponse(data);
      setHistory(h => [{
        id: ++_id,
        mode,
        method,
        path: path.trim(),
        status: data.status,
        duration: data.duration,
        ts: new Date().toLocaleTimeString('de-DE'),
      }, ...h.slice(0, 19)]);
    } catch (err: any) {
      setResponse({
        status: err.response?.status ?? 0,
        statusText: 'Fehler',
        duration: 0,
        url: path,
        data: null,
        error: err.response?.data?.error || err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(JSON.stringify(response?.data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const prettyJson = (v: unknown) => {
    try { return JSON.stringify(v, null, 2); }
    catch { return String(v); }
  };

  return (
    <div>
      <PageHeader
        title="API Tester"
        subtitle="Direktzugriff auf interne und SelectLine-API-Endpunkte"
      />

      <div className="p-6 flex gap-5 max-w-[1400px]">

        {/* Linke Spalte: Presets + History */}
        <div className="w-64 flex-shrink-0 space-y-4">

          {/* Presets */}
          <Card className="overflow-hidden">
            <button
              onClick={() => setPresetsOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Schnellzugriff
              {presetsOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {presetsOpen && (
              <div className="border-t border-slate-100 pb-2">
                {Object.entries(groups).map(([group, items]) => (
                  <div key={group}>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{group}</div>
                    {items.map(p => (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        className="w-full text-left px-4 py-1.5 text-xs text-slate-600 hover:bg-orange-50 hover:text-orange-700 flex items-center gap-2 transition-colors"
                      >
                        <span className={cn('text-[9px] font-bold border rounded px-1', METHOD_COLORS[p.method])}>{p.method}</span>
                        {p.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* History */}
          {history.length > 0 && (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 text-sm font-semibold text-slate-700 border-b border-slate-100">Verlauf</div>
              <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                {history.map(h => (
                  <button
                    key={h.id}
                    onClick={() => { setMode(h.mode); setMethod(h.method); setPath(h.path); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={cn('text-[9px] font-bold border rounded px-1', METHOD_COLORS[h.method])}>{h.method}</span>
                      <span className={cn('text-[10px] font-bold px-1 rounded', statusColor(h.status))}>{h.status}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{h.ts}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate font-mono">{h.path}</div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Rechte Spalte: Request + Response */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Request */}
          <Card className="p-4 space-y-3">
            {/* Modus-Toggle */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
              {([
                { key: 'selectline', label: 'SelectLine API', icon: Zap },
                { key: 'intern',     label: 'Interne API',    icon: Server },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setMode(key); setPath(''); setResponse(null); }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                    mode === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Method + Path */}
            <div className="flex gap-2">
              <select
                value={method}
                onChange={e => setMethod(e.target.value as Method)}
                className={cn(
                  'px-3 py-2 border rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-400 w-28',
                  METHOD_COLORS[method]
                )}
              >
                {(['GET','POST','PUT','PATCH','DELETE'] as Method[]).map(m => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <input
                ref={pathRef}
                value={path}
                onChange={e => setPath(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder={mode === 'selectline' ? "/Documents?filter=KindFlag EQ 'L'&$top=5" : '/api/lager/produkte'}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <Button onClick={send} loading={loading} disabled={!path.trim()}>
                <Send className="w-3.5 h-3.5" />
                Senden
              </Button>
            </div>

            {/* Request Body */}
            {(method === 'POST' || method === 'PUT' || method === 'PATCH') && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Request Body (JSON)</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={4}
                  placeholder='{ "key": "value" }'
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-y"
                />
              </div>
            )}
          </Card>

          {/* Response */}
          {response && (
            <Card className="overflow-hidden">
              {/* Response Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <span className={cn('text-sm font-bold px-2 py-0.5 rounded', statusColor(response.status))}>
                  {response.status} {response.statusText}
                </span>
                {response.duration > 0 && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    {response.duration} ms
                  </span>
                )}
                <span className="text-xs text-slate-400 font-mono truncate flex-1">{response.url}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={copyResponse}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Kopiert' : 'Kopieren'}
                  </button>
                  <button
                    onClick={() => setResponse(null)}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Response Body */}
              {response.error ? (
                <div className="p-4 text-sm text-red-600 font-mono bg-red-50">{response.error}</div>
              ) : (
                <pre className="p-4 text-xs font-mono text-slate-700 overflow-auto max-h-[60vh] leading-relaxed whitespace-pre-wrap break-all">
                  {prettyJson(response.data)}
                </pre>
              )}
            </Card>
          )}

          {!response && !loading && (
            <div className="text-center py-16 text-slate-300 text-sm">
              Endpunkt eingeben und „Senden" klicken
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
