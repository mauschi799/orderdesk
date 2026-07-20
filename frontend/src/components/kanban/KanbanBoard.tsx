import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, closestCenter, PointerSensor,
  useSensor, useSensors, DragStartEvent, DragEndEvent, DragOverEvent,
  useDroppable,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Printer, GripVertical } from 'lucide-react';
import { deliveriesApi } from '../../api';
import { Delivery } from '../../types';
import { KANBAN_COLUMNS, formatDate, formatWeight, calcGesamtgewicht, calcNettoGG, cn } from '../../utils';
import { StatusBadge } from '../ui';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useBrandStore } from '../../store/brandStore';

// ── Card ──────────────────────────────────────────────────────────────────────

function KanbanCard({
  delivery, isDragging = false, dragHandleProps = {},
}: { delivery: Delivery; isDragging?: boolean; dragHandleProps?: Record<string, any> }) {
  const navigate = useNavigate();
  const { colors } = useBrandStore(s => s.settings);
  const gkg    = calcGesamtgewicht(delivery.positionen);
  const nettoGG = calcNettoGG(delivery.positionen);
  const menge  = delivery.positionen.reduce((s, p) => s + p.menge, 0);

  return (
    <div className={cn(
      'bg-white rounded-xl border border-slate-200 shadow-sm transition-all select-none',
      isDragging ? 'opacity-40 rotate-1 shadow-xl' : 'hover:shadow-md hover:border-slate-300',
    )}>
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        className="flex items-center justify-between px-3 pt-2.5 pb-0 cursor-grab active:cursor-grabbing"
        onClick={e => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5 text-slate-300" />
        <div className="flex items-center gap-1">
          {delivery.druckStatus?.gedruckt && <Printer className="w-3 h-3 text-violet-400" />}
          {delivery.importQuelle === 'selectline' && (
            <span className="text-[9px] bg-blue-50 text-blue-500 border border-blue-200 px-1 rounded font-mono">SL</span>
          )}
        </div>
      </div>
      {/* Body */}
      <div className="px-3 pb-3 pt-1.5 cursor-pointer" onClick={() => navigate(`/lieferscheine/${delivery._id}`)}>
        <div className="text-[10px] font-mono text-slate-400 mb-0.5">{delivery.lieferscheinNr}</div>
        <div className="font-semibold text-slate-800 text-sm leading-tight truncate">{delivery.kunde.name}</div>
        {delivery.kunde.adresse?.ort && (
          <div className="text-xs text-slate-400 mt-0.5 truncate">📍 {delivery.kunde.adresse.ort}</div>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-slate-500">{formatDate(delivery.lieferdatum)}</span>
          <span className="text-xs font-medium text-slate-600">{menge} Stk</span>
        </div>
        {(gkg > 0 || nettoGG > 0) && (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {gkg > 0 && (
              <span className="text-xs font-semibold" style={{ color: colors.primary }}>
                ⚖ {formatWeight(gkg)}
              </span>
            )}
            {nettoGG > 0 && (
              <span className="text-xs font-semibold text-emerald-600">
                💨 {formatWeight(nettoGG)}
              </span>
            )}
          </div>
        )}
        <div className="mt-2"><StatusBadge status={delivery.status} /></div>
      </div>
    </div>
  );
}

// ── Sortable wrapper ──────────────────────────────────────────────────────────

function SortableCard({ delivery }: { delivery: Delivery }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: delivery._id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}>
      <KanbanCard delivery={delivery} isDragging={isDragging} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  col, deliveries, isOver,
}: { col: typeof KANBAN_COLUMNS[number]; deliveries: Delivery[]; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: col.id });
  return (
    <div className="flex flex-col" style={{ minWidth: 270, flex: '0 0 270px' }}>
      {/* Header */}
      <div className={cn(
        'flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 mb-2 transition-all',
        col.headerBg, col.headerBorder,
        isOver && 'shadow-md',
      )}>
        <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', col.dotColor)} />
        <span className="font-bold text-slate-700 text-sm flex-1">{col.label}</span>
        <span className="text-xs bg-white/80 text-slate-600 px-2 py-0.5 rounded-full font-mono font-semibold">
          {deliveries.length}
        </span>
      </div>
      {/* Drop area */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-xl p-1.5 min-h-[80px] transition-all',
          isOver ? 'bg-slate-50 ring-2 ring-dashed ring-slate-300' : '',
        )}
      >
        <SortableContext items={deliveries.map(d => d._id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {deliveries.map(d => <SortableCard key={d._id} delivery={d} />)}
          </div>
        </SortableContext>
        {deliveries.length === 0 && (
          <div className={cn(
            'h-16 flex items-center justify-center rounded-xl border-2 border-dashed text-xs transition-all',
            isOver ? 'border-slate-400 text-slate-500' : 'border-slate-200 text-slate-300',
          )}>
            {isOver ? '↓ Hier ablegen' : 'Leer'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────

export default function KanbanBoard() {
  const { hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const { data: kanbanData, isLoading } = useQuery({
    queryKey: ['kanban'],
    queryFn: () => deliveriesApi.kanban(),
    refetchInterval: 30_000,
  });

  const moveMutation = useMutation({
    mutationFn: ({ deliveryId, spalte, position }: { deliveryId: string; spalte: string; position: number }) =>
      deliveriesApi.kanbanMove(deliveryId, spalte, position),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const columns: Record<string, Delivery[]> = kanbanData || { neu: [], trier: [], bengel: [], erledigt: [] };

  const findColumn = useCallback((id: string): string | null => {
    for (const [col, items] of Object.entries(columns)) {
      if ((items as Delivery[]).some(d => d._id === id)) return col;
    }
    return null;
  }, [columns]);

  const activeDelivery = activeId
    ? (Object.values(columns).flat() as Delivery[]).find(d => d._id === activeId)
    : null;

  const resolveColumn = (id: string): string | null => {
    if (KANBAN_COLUMNS.some(c => c.id === id)) return id;
    return findColumn(id);
  };

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(active.id as string);
  const handleDragOver = ({ over }: DragOverEvent) => setOverId(over ? resolveColumn(over.id as string) : null);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    if (!over || !hasRole('administrator', 'disponent')) return;
    const deliveryId = active.id as string;
    const sourceCol = findColumn(deliveryId);
    const targetCol = resolveColumn(over.id as string);
    if (!targetCol || sourceCol === targetCol) return;
    const targetItems = (columns[targetCol] || []) as Delivery[];
    moveMutation.mutate({ deliveryId, spalte: targetCol, position: targetItems.length });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const visibleColumns = KANBAN_COLUMNS;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center px-4 py-2 border-b border-slate-100 bg-white gap-3">
        <span className="text-xs text-slate-400">
          Drag &amp; Drop → Lagerzuweisung ändert sich automatisch · Abgeschlossene Aufträge im Lieferschein-Archiv
        </span>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 p-4 h-full">
            {visibleColumns.map(col => (
              <KanbanColumn
                key={col.id}
                col={col}
                deliveries={(columns[col.id] || []) as Delivery[]}
                isOver={overId === col.id}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDelivery && (
              <div className="rotate-2 scale-105 shadow-2xl opacity-90">
                <KanbanCard delivery={activeDelivery} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
