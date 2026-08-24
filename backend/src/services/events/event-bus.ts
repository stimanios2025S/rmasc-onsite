// ============================================================================
// RMASC OnSite — Server-Sent Events (SSE) Event Bus
// Synchronisation en temps réel entre les portails admin ↔ technicien
// ============================================================================

export interface SyncEvent {
  type: 'demande_recue' | 'chantier_cree' | 'mission_assignee' | 'mission_terminee' | 'blocage_signale' | 'equipe_disponible' | 'data_changed'
    | 'equipe_position' | 'equipe_en_route' | 'equipe_arrivee' | 'equipe_en_pause' | 'equipe_reprise' | 'equipe_terminee'
    | 'mission_transferee' | 'pointage_jour';
  payload: Record<string, any>;
  timestamp: string;
}

type Listener = (event: SyncEvent) => void;

class EventBus {
  private listeners: Set<Listener> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type: SyncEvent['type'], payload: Record<string, any>): void {
    const event: SyncEvent = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.listeners) {
      try { listener(event); } catch (_) { /* listener error */ }
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

// Singleton — shared across all routes
export const eventBus = new EventBus();
