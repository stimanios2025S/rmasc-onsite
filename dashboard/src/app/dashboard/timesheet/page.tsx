'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Loader2, RefreshCw, ChevronLeft, ChevronRight, Clock, Calendar,
  Wrench, Zap, Shield, MapPin,
} from 'lucide-react';
import { fetchTimesheet, type TimesheetData, type TimesheetEquipe, type TimesheetEvent } from '@/lib/api';
import { useSyncEvents } from '@/lib/use-sync-events';

/* ─── CONSTANTS ────────────────────────────────────────────────────── */
const TYPE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  mecanique: { label: 'Mécanique', icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-500' },
  electrique: { label: 'Électrique', icon: Zap, color: 'text-orange-600', bg: 'bg-orange-500' },
  mixte: { label: 'Vérification', icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-500' },
};

const EVENT_STYLE: Record<string, { bg: string; border: string; dot: string }> = {
  pointage_matin: { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400' },
  pointage_fin: { bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-400' },
  arrivee: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-400' },
  depart: { bg: 'bg-stone-50', border: 'border-stone-200', dot: 'bg-stone-400' },
  pause: { bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-400' },
  retour_shop: { bg: 'bg-sky-50', border: 'border-sky-200', dot: 'bg-sky-400' },
};

/* ─── MAIN PAGE ────────────────────────────────────────────────────── */
export default function TimesheetPage() {
  const [data, setData] = useState<TimesheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTimesheet(selectedDate);
      setData(result);
    } catch (e: any) {
      console.error('Timesheet load error:', e);
    }
    setLoading(false);
  }, [selectedDate]);

  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  // Auto-refresh on real-time events (pointage, arrival, pause, etc.)
  useSyncEvents({
    onDataChanged: () => { if (isToday) loadData(); },
    onEquipeArrivee: () => { if (isToday) loadData(); },
    onEquipeEnRoute: () => { if (isToday) loadData(); },
  });

  useEffect(() => { loadData(); }, [loadData]);

  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (loading && !data) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 size={36} className="animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header + Date Picker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-800 flex items-center gap-2">
            <Clock size={22} className="text-indigo-500" /> Feuille de Temps
          </h1>
          <p className="text-sm text-stone-400 mt-0.5">Pointages, arrivées, pauses et fin de journée</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-2 py-1.5">
          <button onClick={() => shiftDate(-1)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-all">
            <ChevronLeft size={16} className="text-stone-500" />
          </button>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={14} className="text-stone-400" />
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="text-sm font-semibold text-stone-700 outline-none bg-transparent cursor-pointer"
              style={{ fontSize: '16px' }}
            />
          </div>
          <button onClick={() => shiftDate(1)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-all">
            <ChevronRight size={16} className="text-stone-500" />
          </button>
          {!isToday && (
            <button onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
              className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-all">
              Aujourd&apos;hui
            </button>
          )}
          <button onClick={loadData} className="p-1.5 hover:bg-stone-100 rounded-lg transition-all">
            <RefreshCw size={14} className={`text-stone-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Date Title */}
      <div className="text-center">
        <p className="text-sm font-bold text-stone-500 capitalize">{formatDate(selectedDate)}</p>
      </div>

      {/* Empty State */}
      {data && data.equipes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <Clock size={40} className="text-stone-300" />
          <p className="text-sm text-stone-400">Aucun pointage enregistré pour cette date</p>
        </div>
      )}

      {/* Team Timelines */}
      <div className="space-y-6">
        {data?.equipes.map(team => (
          <TeamTimeline key={team.equipe_id} team={team} />
        ))}
      </div>
    </div>
  );
}

/* ─── TEAM TIMELINE COMPONENT ─────────────────────────────────────── */
function TeamTimeline({ team }: { team: TimesheetEquipe }) {
  const meta = TYPE_META[team.equipe_type] || TYPE_META.mixte;
  const Icon = meta.icon;
  const s = team.stats;

  // Calculate total worked time
  const totalWorkedMin = (() => {
    if (!s.matinal) return null;
    const start = team.events.find(e => e.type === 'pointage_matin');
    const end = team.events.find(e => e.type === 'pointage_fin');
    if (!start) return null;
    const startMs = new Date(start.horodatage).getTime();
    const endMs = end ? new Date(end.horodatage).getTime() : Date.now();
    return Math.round((endMs - startMs) / 60000) - s.totalPausedMinutes;
  })();

  const formatMinutes = (min: number) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
  };

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm overflow-hidden">
      {/* Team Header */}
      <div className="px-5 py-4 border-b border-stone-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center shadow-md`}>
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-stone-800">{team.equipe_nom}</p>
              <p className="text-[10px] text-stone-400">{meta.label}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs">
            {s.matinal && (
              <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full font-semibold">
                🌅 {s.matinal}
              </span>
            )}
            {s.arrivee && (
              <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full font-semibold">
                📍 {s.arrivee}
              </span>
            )}
            {s.isPaused && (
              <span className="flex items-center gap-1 text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full font-semibold animate-pulse">
                ⏸ En pause
              </span>
            )}
            {s.fin_journee && (
              <span className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full font-semibold">
                🌙 {s.fin_journee}
              </span>
            )}
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 mt-3 text-xs text-stone-400">
          {totalWorkedMin !== null && totalWorkedMin > 0 && (
            <span className="flex items-center gap-1">
              <Clock size={12} /> Temps total: <span className="font-bold text-stone-600">{formatMinutes(totalWorkedMin)}</span>
            </span>
          )}
          {s.totalPausedMinutes > 0 && (
            <span className="flex items-center gap-1 text-orange-500">
              ⏸ Pauses: {formatMinutes(s.totalPausedMinutes)}
            </span>
          )}
          <span>{team.events.length} événement{team.events.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4">
        {team.events.length === 0 ? (
          <p className="text-xs text-stone-300 italic text-center py-4">Aucun événement</p>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[19px] top-2 bottom-2 w-[2px] bg-stone-100" />

            <div className="space-y-1">
              {team.events.map((evt, i) => (
                <EventRow key={i} event={evt} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── EVENT ROW COMPONENT ──────────────────────────────────────────── */
function EventRow({ event }: { event: TimesheetEvent }) {
  const style = EVENT_STYLE[event.type] || { bg: 'bg-stone-50', border: 'border-stone-200', dot: 'bg-stone-400' };

  return (
    <div className="flex items-start gap-3 relative">
      {/* Dot */}
      <div className={`w-[10px] h-[10px] rounded-full ${style.dot} mt-[7px] z-10 shrink-0 ring-2 ring-white`} />

      {/* Time */}
      <span className="text-xs font-mono font-bold text-stone-400 w-12 shrink-0 mt-1">{event.heure}</span>

      {/* Event Card */}
      <div className={`flex-1 ${style.bg} border ${style.border} rounded-xl px-3 py-2 mb-1`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm">{event.icon}</span>
            <span className="text-xs font-semibold text-stone-700">{event.label}</span>
          </div>
          {event.en_cours && (
            <span className="text-[9px] font-bold text-orange-500 bg-orange-100 px-2 py-0.5 rounded-full animate-pulse">
              EN COURS
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[10px] text-stone-400">
          {event.chantier && (
            <span className="flex items-center gap-1">
              <MapPin size={9} /> {event.chantier}
            </span>
          )}
          {event.distance !== undefined && event.distance !== null && (
            <span className={event.conforme ? 'text-emerald-500' : 'text-rose-500'}>
              {event.conforme ? '✅' : '❌'} {Math.round(event.distance)}m
            </span>
          )}
          {event.duree_minutes !== undefined && event.duree_minutes !== null && (
            <span className="text-orange-500 font-medium">
              {event.duree_minutes}min
            </span>
          )}
          {event.heure_fin && (
            <span>→ {event.heure_fin}</span>
          )}
          {event.motif && (
            <span className="italic">{event.motif}</span>
          )}
        </div>
      </div>
    </div>
  );
}
