import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Wifi, WifiOff, Upload, CheckCircle, AlertCircle, RefreshCw, FileJson, Info, Key, ChevronRight, Hash } from 'lucide-react';
import api from '../api';
import { PageHeader, Card, Button } from '../components/ui';
import { cn } from '../utils';

interface ImportResult {
  message: string; imported: number; updated: number; skipped: number; dauer?: number;
  errors: { key?: string; error: string }[];
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fetchArticles, setFetchArticles] = useState(true);
  const [singleKey, setSingleKey] = useState('');
  const [jsonInput, setJsonInput] = useState('');
  const [activeTab, setActiveTab] = useState<'api'|'single'|'manual'>('api');
  const [lastResult, setLastResult] = useState<ImportResult|null>(null);

  const { data: connectionStatus, refetch: recheckConnection, isFetching } = useQuery({
    queryKey: ['selectline-connection'],
    queryFn: () => api.get('/selectline/test').then(r => r.data),
    retry: false,
  });

  const importMutation = useMutation({
    mutationFn: () => api.post('/selectline/import', { dateFrom: dateFrom||undefined, dateTo: dateTo||undefined, fetchArticles }).then(r => r.data),
    onSuccess: (data) => { setLastResult(data); queryClient.invalidateQueries({ queryKey: ['deliveries'] }); queryClient.invalidateQueries({ queryKey: ['kanban'] }); }
  });
  const singleMutation = useMutation({
    mutationFn: () => api.post('/selectline/import-single', { documentKey: singleKey.trim(), fetchArticles }).then(r => r.data),
    onSuccess: (data) => { setLastResult({ ...data, imported: data.outcome==='imported'?1:0, updated: data.outcome==='updated'?1:0, skipped: data.outcome==='skipped'?1:0, errors: [] }); queryClient.invalidateQueries({ queryKey: ['kanban'] }); }
  });
  const manualMutation = useMutation({
    mutationFn: () => { const parsed = JSON.parse(jsonInput); return api.post('/selectline/import-manual', { data: Array.isArray(parsed)?parsed:[parsed] }).then(r => r.data); },
    onSuccess: (data) => { setLastResult(data); setJsonInput(''); queryClient.invalidateQueries({ queryKey: ['kanban'] }); }
  });

  const isConnected = connectionStatus?.connected;
  const today = new Date().toISOString().split('T')[0];
  const TABS = [{ id:'api', label:'Vollimport', icon:Download }, { id:'single', label:'Einzelimport', icon:Hash }, { id:'manual', label:'JSON einfügen', icon:FileJson }] as const;

  return (
    <div>
      <PageHeader title="SelectLine Import" subtitle="Lieferscheine aus SelectLine importieren" />
      <div className="p-6 space-y-4 max-w-4xl">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', isConnected?'bg-green-50':'bg-red-50')}>
                {isConnected ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-red-500" />}
              </div>
              <div>
                <div className="font-semibold text-slate-800 text-sm">SelectLine API {isConnected ? 'verbunden' : 'nicht verbunden'}</div>
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  {connectionStatus?.baseUrl ? <span className="font-mono">{connectionStatus.baseUrl}</span> : <span>Nicht konfiguriert</span>}
                  {isConnected && <span className="text-green-600 flex items-center gap-1"><Key className="w-3 h-3"/>Token aktiv</span>}
                  {!isConnected && connectionStatus?.message && <span className="text-red-500">{connectionStatus.message}</span>}
                </div>
              </div>
            </div>
            <button onClick={() => recheckConnection()} disabled={isFetching} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            </button>
          </div>
          {!isConnected && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
              <p className="font-semibold mb-1">Benötigte Umgebungsvariablen:</p>
              <pre className="font-mono bg-amber-100/70 rounded p-2">{`SELECTLINE_API_URL=http://server:port/api/v1\nSELECTLINE_USERNAME=benutzer\nSELECTLINE_PASSWORD=passwort\nSELECTLINE_MANDANT=mandant`}</pre>
            </div>
          )}
        </Card>

        <Card className="p-3 bg-slate-50 border-slate-200">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
            {['POST /Login','GET /Documents?KindFlag=L','GET /Documents/{key}','GET /Documents/{key}/Positions', fetchArticles?'GET /Articles/{nr}':null].filter(Boolean).map((s,i,a)=>(
              <span key={s} className="flex items-center gap-2">
                <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono">{s}</code>
                {i<a.length-1 && <ChevronRight className="w-3 h-3 text-slate-300"/>}
              </span>
            ))}
          </div>
        </Card>

        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer px-1">
          <input type="checkbox" checked={fetchArticles} onChange={e=>setFetchArticles(e.target.checked)} className="accent-orange-500"/>
          Artikeldaten laden (Gewichte via GET /Articles)
        </label>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
          {TABS.map(tab => { const Icon=tab.icon; return (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',activeTab===tab.id?'bg-white shadow-sm text-slate-900':'text-slate-500 hover:text-slate-700')}>
              <Icon className="w-3.5 h-3.5"/>{tab.label}
            </button>
          );})}
        </div>

        {activeTab==='api' && (
          <Card className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Alle Lieferscheine importieren <span className="text-xs text-slate-400 font-normal">– KindFlag EQ 'L'</span></h2>
            <div className="grid grid-cols-2 gap-4 mb-5">
              <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Von Datum</label><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} max={today} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/></div>
              <div><label className="block text-sm font-medium text-slate-700 mb-1.5">Bis Datum</label><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} max={today} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"/></div>
            </div>
            <Button onClick={()=>importMutation.mutate()} loading={importMutation.isPending} disabled={!isConnected}>
              <Download className="w-4 h-4"/> {importMutation.isPending ? 'Importiere...' : 'Jetzt importieren'}
            </Button>
            {importMutation.isError && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{(importMutation.error as any)?.response?.data?.message||'Import fehlgeschlagen'}</div>}
          </Card>
        )}

        {activeTab==='single' && (
          <Card className="p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Einzelimport <span className="text-xs text-slate-400 font-normal">– GET /Documents/{'{key}'} + Positions</span></h2>
            <div className="flex gap-3">
              <input value={singleKey} onChange={e=>setSingleKey(e.target.value)} placeholder="DocumentKey / Lieferschein-Nr." className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"/>
              <Button onClick={()=>singleMutation.mutate()} loading={singleMutation.isPending} disabled={!singleKey.trim()||!isConnected}>Importieren</Button>
            </div>
            {singleMutation.isError && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{(singleMutation.error as any)?.response?.data?.message||'Fehler'}</div>}
          </Card>
        )}

        {activeTab==='manual' && (
          <Card className="p-6">
            <h2 className="font-semibold text-slate-800 mb-2">SelectLine JSON einfügen</h2>
            <p className="text-sm text-slate-500 mb-3">Exportiertes JSON direkt einfügen. Felder werden automatisch gemappt.</p>
            <pre className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 overflow-x-auto">{`[{ "DocumentKey":"LS-001","Name1":"Kunde GmbH","DeliveryDate":"2024-12-01","DeliveryCity":"Trier","Positions":[{"ArticleKey":"G-11KG","Description":"Propangas 11kg","Quantity":5,"Unit":"Stk","FilledWeight":18.8,"EmptyWeight":7.8}] }]`}</pre>
            <textarea value={jsonInput} onChange={e=>setJsonInput(e.target.value)} rows={8} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none" placeholder='[{ "DocumentKey": "LS-...", ... }]'/>
            <div className="flex gap-3 mt-3">
              <Button onClick={()=>manualMutation.mutate()} loading={manualMutation.isPending} disabled={!jsonInput.trim()}><Upload className="w-4 h-4"/>JSON importieren</Button>
              {jsonInput && <button onClick={()=>setJsonInput('')} className="text-sm text-slate-400 hover:text-slate-600">Löschen</button>}
            </div>
            {manualMutation.isError && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{(manualMutation.error as any)?.message||'Ungültiges JSON'}</div>}
          </Card>
        )}

        {lastResult && (
          <Card className="p-5 animate-fade-in">
            <div className="flex items-center gap-2 mb-3"><CheckCircle className="w-5 h-5 text-green-500"/><h3 className="font-semibold text-slate-800">Ergebnis</h3>{lastResult.dauer&&<span className="text-xs text-slate-400 ml-auto">{(lastResult.dauer/1000).toFixed(1)}s</span>}</div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-green-50 rounded-xl"><div className="text-2xl font-bold text-green-600">{lastResult.imported}</div><div className="text-xs text-green-700 font-medium">Neu</div></div>
              <div className="text-center p-3 bg-blue-50 rounded-xl"><div className="text-2xl font-bold text-blue-600">{lastResult.updated}</div><div className="text-xs text-blue-700 font-medium">Aktualisiert</div></div>
              <div className="text-center p-3 bg-slate-50 rounded-xl"><div className="text-2xl font-bold text-slate-600">{lastResult.skipped}</div><div className="text-xs text-slate-500 font-medium">Übersprungen</div></div>
            </div>
            {lastResult.errors?.length>0 && <div className="mt-3 space-y-1">{lastResult.errors.map((e,i)=><div key={i} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-mono">{e.key&&<b>{e.key}: </b>}{e.error||String(e)}</div>)}</div>}
          </Card>
        )}

        <Card className="p-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-2 text-sm flex items-center gap-2"><Info className="w-4 h-4"/>Hinweise</h3>
          <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
            <li>Nur lesender Zugriff – <strong>keine Daten werden in SelectLine geschrieben</strong></li>
            <li>Token-Auth: POST /Login → AccessToken → Bearer-Header für alle weiteren Requests</li>
            <li>Nur Lieferscheine mit KindFlag = 'L' werden geladen</li>
            <li>Lieferscheine im Workflow werden nicht überschrieben</li>
            <li>PDF-Druck: POST /Documents/{'{key}'}/PrintPdf mit {'{"MasterName":"!BLATT1"}'}</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
