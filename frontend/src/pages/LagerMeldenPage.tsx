import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ClipboardList, CheckCircle, Clock, Package, Store } from 'lucide-react';
import { lagerApi } from '../api';
import { LagerMeldung, LagerPosition, LagerProdukt } from '../types';
import { useAuthStore } from '../store/authStore';
import { Card, Button, PageHeader } from '../components/ui';
import { formatDateTime, cn } from '../utils';

const EINHEITEN = ['Stk', 'Kg', 'Liter', 'Flasche', 'Palette', 't'];

const emptyPosition = (): LagerPosition => ({
  artikelnummer: '',
  beschreibung: '',
  menge: 0,
  einheit: 'Stk',
});

export default function LagerMeldenPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedFiliale, setSelectedFiliale] = useState<string>('');
  const [customFiliale, setCustomFiliale] = useState('');
  const [mengen, setMengen] = useState<Record<string, number>>({});
  const [freiPositionen, setFreiPositionen] = useState<LagerPosition[]>([emptyPosition()]);
  const [notiz, setNotiz] = useState('');
  const [success, setSuccess] = useState(false);

  // Filialen für die dieser User melden darf
  const { data: meldeFilialen = [] } = useQuery<string[]>({
    queryKey: ['lager-melde-filialen'],
    queryFn: lagerApi.meldeFilialen,
  });

  // Automatisch erste/einzige Filiale auswählen
  useEffect(() => {
    if (meldeFilialen.length === 1 && !selectedFiliale) {
      setSelectedFiliale(meldeFilialen[0]);
    }
  }, [meldeFilialen]);

  // Produkte für gewählte Filiale
  const { data: produkte = [], isLoading: produkteLoading } = useQuery<LagerProdukt[]>({
    queryKey: ['lager-produkte-meine', selectedFiliale],
    queryFn: () => lagerApi.produkteMeine(selectedFiliale || undefined),
    enabled: !!selectedFiliale,
  });

  const { data: meineM = [] } = useQuery<LagerMeldung[]>({
    queryKey: ['lager-meine'],
    queryFn: lagerApi.meine,
  });

  const hatProdukte = produkte.some(p => p.typ !== 'trenner');

  // Mengen zurücksetzen wenn Filiale oder Produktliste wechselt
  useEffect(() => {
    if (hatProdukte) {
      setMengen(Object.fromEntries(produkte.map(p => [p._id, 0])));
    }
  }, [selectedFiliale, produkte.length]);

  const buildPositionen = (): LagerPosition[] => {
    if (hatProdukte) {
      return produkte
        .filter(p => p.typ !== 'trenner' && (mengen[p._id] ?? 0) > 0)
        .map(p => ({
          artikelnummer: p.artikelnummer,
          beschreibung: p.beschreibung,
          menge: mengen[p._id] ?? 0,
          einheit: p.einheit,
        }));
    }
    return freiPositionen.filter(p => p.beschreibung.trim() && p.menge >= 0);
  };

  const meldeMutation = useMutation({
    mutationFn: () => {
      const positionen = buildPositionen();
      const filiale = user?.role === 'filialen' ? (user.filiale ?? undefined) : selectedFiliale;
      return lagerApi.melden({ positionen, notiz: notiz || undefined, filiale });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lager-meine'] });
      setSuccess(true);
      if (hatProdukte) {
        setMengen(Object.fromEntries(produkte.map(p => [p._id, 0])));
      } else {
        setFreiPositionen([emptyPosition()]);
      }
      setNotiz('');
      setTimeout(() => setSuccess(false), 4000);
    },
  });

  const addRow = () => setFreiPositionen(p => [...p, emptyPosition()]);
  const removeRow = (i: number) => setFreiPositionen(p => p.filter((_, idx) => idx !== i));
  const updateRow = (i: number, field: keyof LagerPosition, value: string | number) =>
    setFreiPositionen(p => p.map((row, idx) => idx === i ? { ...row, [field]: value } : row));

  // Für filialen-Rolle: immer ihre eigene Filiale
  const isFilialen = user?.role === 'filialen';
  // Administratoren sind immer uneingeschränkt (siehe Backend getMeldenFilialen) —
  // sie dürfen daher auch eine noch unbekannte/neue Filiale frei eingeben, statt
  // nur aus der Liste bereits bekannter Filialen zu wählen.
  const isAdmin = user?.role === 'administrator';
  const activeFilialeLabel = isFilialen ? (user.filiale ?? '') : selectedFiliale;
  const needsFilialeSelector = !isFilialen && (meldeFilialen.length > 1 || isAdmin);
  const canSubmit = !!activeFilialeLabel && buildPositionen().length > 0;

  const letzteM = meineM[0] as LagerMeldung | undefined;

  return (
    <div>
      <PageHeader
        title="Bestand melden"
        subtitle={activeFilialeLabel ? `Filiale: ${activeFilialeLabel}` : 'Filiale auswählen'}
      />

      <div className="p-6 space-y-4 max-w-2xl">

        {/* Filiale-Selektor (nur wenn mehrere Filialen verfügbar) */}
        {needsFilialeSelector && (
          <Card className="p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
              <Store className="w-3.5 h-3.5 text-orange-500" />
              Für welche Filiale melden?
            </label>
            <div className="flex flex-wrap gap-2">
              {meldeFilialen.map(f => (
                <button
                  key={f}
                  onClick={() => setSelectedFiliale(f)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium border transition-all',
                    selectedFiliale === f
                      ? 'border-orange-400 bg-orange-50 text-orange-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Freie Filial-Eingabe für Admins (z.B. neue, noch unbekannte Filiale) */}
            {isAdmin && (
              <div className={cn('flex items-center gap-2', meldeFilialen.length > 0 && 'mt-3 pt-3 border-t border-slate-100')}>
                <input
                  value={customFiliale}
                  onChange={e => setCustomFiliale(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && customFiliale.trim()) setSelectedFiliale(customFiliale.trim()); }}
                  placeholder="Andere Filiale eingeben..."
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                <button
                  onClick={() => { if (customFiliale.trim()) setSelectedFiliale(customFiliale.trim()); }}
                  disabled={!customFiliale.trim()}
                  className="px-3 py-2 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:border-slate-300 disabled:opacity-40 disabled:pointer-events-none"
                >
                  Verwenden
                </button>
              </div>
            )}
          </Card>
        )}

        {/* Keine Filiale verfügbar */}
        {!isFilialen && !isAdmin && meldeFilialen.length === 0 && (
          <Card className="p-6 text-center">
            <Store className="w-8 h-8 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Keine Filialen für diesen Account hinterlegt.</p>
            <p className="text-xs text-slate-300 mt-1">Ein Administrator kann Filialen in der Benutzerverwaltung zuweisen.</p>
          </Card>
        )}

        {/* Letzte Meldung Info */}
        {letzteM && (
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-100">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            Letzte Meldung: {formatDateTime(letzteM.gemeldetAm)}
            {' · '}{letzteM.positionen.length} Positionen
            {!isFilialen && letzteM.filiale && (
              <span className="ml-1 text-slate-400">({letzteM.filiale})</span>
            )}
          </div>
        )}

        {/* Eingabe-Formular (nur anzeigen wenn Filiale ausgewählt) */}
        {(isFilialen || selectedFiliale) && (
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-orange-500" />
              Aktueller Lagerbestand
              {!isFilialen && selectedFiliale && (
                <span className="ml-1 text-sm font-normal text-slate-400">– {selectedFiliale}</span>
              )}
            </h3>

            {produkteLoading && (
              <div className="py-6 text-center text-sm text-slate-400">Produkte werden geladen…</div>
            )}

            {/* Produktbasierte Eingabe */}
            {!produkteLoading && hatProdukte && (
              <div className="space-y-2">
                <div className="grid grid-cols-[auto_1fr_96px] gap-3 px-1 pb-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-16">Art.-Nr.</span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Bezeichnung</span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-right">Menge</span>
                </div>
                {produkte.map(p => p.typ === 'trenner' ? (
                  <div key={p._id} className="pt-3 pb-1.5 first:pt-0">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5">
                      {p.beschreibung}
                    </div>
                  </div>
                ) : (
                  <div key={p._id} className="grid grid-cols-[auto_1fr_96px] gap-3 items-center py-1.5 border-b border-slate-50 last:border-0">
                    <span className="font-mono text-xs text-slate-400 w-16 truncate">{p.artikelnummer || '–'}</span>
                    <div>
                      <span className="text-sm text-slate-800 font-medium">{p.beschreibung}</span>
                      <span className="ml-2 text-xs text-slate-400">{p.einheit}</span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={mengen[p._id] ?? 0}
                      onChange={e => setMengen(m => ({ ...m, [p._id]: parseFloat(e.target.value) || 0 }))}
                      className={cn(
                        'w-full px-2.5 py-2 border rounded-lg text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-orange-400',
                        (mengen[p._id] ?? 0) > 0
                          ? 'border-orange-300 bg-orange-50 font-semibold text-orange-700'
                          : 'border-slate-200'
                      )}
                    />
                  </div>
                ))}
                <p className="text-xs text-slate-400 pt-1">
                  Nur Positionen mit Menge &gt; 0 werden übermittelt ({buildPositionen().length} von {produkte.filter(p => p.typ !== 'trenner').length})
                </p>
              </div>
            )}

            {/* Freie Eingabe */}
            {!produkteLoading && !hatProdukte && (
              <div className="space-y-2">
                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 flex items-start gap-2">
                  <Package className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  Noch keine Produkte konfiguriert — freie Eingabe aktiv.
                </div>
                <div className="grid grid-cols-[1fr_2fr_80px_80px_32px] gap-2 px-1">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Art.-Nr.</span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Bezeichnung</span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Menge</span>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Einheit</span>
                  <span />
                </div>
                {freiPositionen.map((pos, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2fr_80px_80px_32px] gap-2 items-center">
                    <input
                      value={pos.artikelnummer}
                      onChange={e => updateRow(i, 'artikelnummer', e.target.value)}
                      placeholder="optional"
                      className="px-2.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
                    />
                    <input
                      value={pos.beschreibung}
                      onChange={e => updateRow(i, 'beschreibung', e.target.value)}
                      placeholder="z.B. Propangas 11 kg"
                      className="px-2.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    />
                    <input
                      type="number"
                      min={0}
                      value={pos.menge}
                      onChange={e => updateRow(i, 'menge', parseFloat(e.target.value) || 0)}
                      className="px-2.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 text-right"
                    />
                    <select
                      value={pos.einheit}
                      onChange={e => updateRow(i, 'einheit', e.target.value)}
                      className="px-2 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                    >
                      {EINHEITEN.map(e => <option key={e}>{e}</option>)}
                    </select>
                    <button
                      onClick={() => removeRow(i)}
                      disabled={freiPositionen.length === 1}
                      className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-400 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addRow}
                  className="mt-1 flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Zeile hinzufügen
                </button>
              </div>
            )}

            {/* Notiz */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">Notiz (optional)</label>
              <textarea
                value={notiz}
                onChange={e => setNotiz(e.target.value)}
                rows={2}
                placeholder="Besonderheiten, Anmerkungen..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
              />
            </div>

            {meldeMutation.isError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {(meldeMutation.error as any)?.response?.data?.message || 'Fehler beim Senden'}
              </div>
            )}

            {success && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Bestand erfolgreich gemeldet!
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <Button
                onClick={() => meldeMutation.mutate()}
                loading={meldeMutation.isPending}
                disabled={!canSubmit}
              >
                Bestand melden
              </Button>
            </div>
          </Card>
        )}

        {/* Letzte Meldungen */}
        {meineM.length > 0 && (
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Meine letzten Meldungen
            </h3>
            <div className="space-y-3">
              {meineM.map((m: LagerMeldung) => (
                <div key={m._id} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{formatDateTime(m.gemeldetAm)}</span>
                      {!isFilialen && (
                        <span className="text-xs font-medium text-slate-600">{m.filiale}</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">{m.positionen.length} Pos.</span>
                  </div>
                  <div className="space-y-1">
                    {m.positionen.map((pos, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{pos.beschreibung}</span>
                        <span className="font-mono font-medium text-slate-800">
                          {pos.menge} {pos.einheit}
                        </span>
                      </div>
                    ))}
                  </div>
                  {m.notiz && (
                    <p className="mt-2 text-xs text-slate-400 italic">{m.notiz}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
