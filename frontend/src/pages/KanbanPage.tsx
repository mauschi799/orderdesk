import { useNavigate } from 'react-router-dom';
import { RefreshCw, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import KanbanBoard from '../components/kanban/KanbanBoard';
import { Button, PageHeader } from '../components/ui';
import { useAuthStore } from '../store/authStore';

export default function KanbanPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { hasRole } = useAuthStore();

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Kanban-Board"
        subtitle="Disposition via Drag & Drop — Trier · Bengel · Erledigt"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['kanban'] })}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
              title="Aktualisieren"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {hasRole('administrator', 'disponent') && (
              <Button size="sm" onClick={() => navigate('/lieferscheine/neu')}>
                <Plus className="w-3.5 h-3.5" />
                Neu
              </Button>
            )}
          </div>
        }
      />
      <div className="flex-1 overflow-hidden">
        <KanbanBoard />
      </div>
    </div>
  );
}
