'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { getToken } from './auth';

export interface SyncEvent {
  type: 'demande_recue' | 'chantier_cree' | 'mission_assignee' | 'mission_terminee' | 'blocage_signale' | 'blocage_annule' | 'equipe_disponible' | 'data_changed'
    | 'equipe_position' | 'equipe_en_route' | 'equipe_arrivee' | 'equipe_en_pause' | 'equipe_reprise' | 'equipe_terminee'
    | 'mission_transferee' | 'pointage_jour';
  payload: Record<string, any>;
  timestamp: string;
}

interface UseSyncEventsOptions {
  onEvent?: (event: SyncEvent) => void;
  onDemandeRecue?: (payload: Record<string, any>) => void;
  onChantierCree?: (payload: Record<string, any>) => void;
  onMissionAssignee?: (payload: Record<string, any>) => void;
  onBlocageSignale?: (payload: Record<string, any>) => void;
  onEquipePosition?: (payload: Record<string, any>) => void;
  onEquipeEnRoute?: (payload: Record<string, any>) => void;
  onEquipeArrivee?: (payload: Record<string, any>) => void;
  onMissionTransferee?: (payload: Record<string, any>) => void;
  onDataChanged?: (payload: Record<string, any>) => void;
  autoReconnect?: boolean;
}

interface UseSyncEventsReturn {
  connected: boolean;
  lastEvent: SyncEvent | null;
  reconnect: () => void;
}

export function useSyncEvents(options: UseSyncEventsOptions = {}): UseSyncEventsReturn {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SyncEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const mountedRef = useRef(true);

  // Store callbacks in refs so connect() never changes identity
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    setConnected(false);
  }, []);

  // connect() is stable — reads callbacks from ref, never recreated
  const connect = useCallback(() => {
    cleanup();
    if (!mountedRef.current) return;

    const token = getToken();
    if (!token) return;

    const opts = optionsRef.current;
    const autoReconnect = opts.autoReconnect !== false;

    // EventSource doesn't support custom headers, so pass token as query param
    const url = `/api/sync/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      reconnectAttempts.current = 0;
    };

    es.onmessage = (msg) => {
      try {
        const event: SyncEvent = JSON.parse(msg.data);
        setLastEvent(event);
        opts.onEvent?.(event);

        switch (event.type) {
          case 'demande_recue':
            opts.onDemandeRecue?.(event.payload);
            break;
          case 'chantier_cree':
            opts.onChantierCree?.(event.payload);
            break;
          case 'mission_assignee':
            opts.onMissionAssignee?.(event.payload);
            break;
          case 'blocage_signale':
            opts.onBlocageSignale?.(event.payload);
            break;
          case 'blocage_annule':
            opts.onDataChanged?.(event.payload);
            break;
          case 'equipe_position':
            opts.onEquipePosition?.(event.payload);
            break;
          case 'equipe_en_route':
            opts.onEquipeEnRoute?.(event.payload);
            opts.onDataChanged?.(event.payload);
            break;
          case 'equipe_arrivee':
            opts.onEquipeArrivee?.(event.payload);
            opts.onDataChanged?.(event.payload);
            break;
          case 'mission_transferee':
            opts.onMissionTransferee?.(event.payload);
            opts.onDataChanged?.(event.payload);
            break;
          case 'mission_terminee':
          case 'equipe_en_pause':
          case 'equipe_reprise':
          case 'equipe_terminee':
          case 'pointage_jour':
            opts.onDataChanged?.(event.payload);
            break;
          case 'data_changed':
            opts.onDataChanged?.(event.payload);
            break;
        }
      } catch {
        // Ignore malformed events (e.g., heartbeat comments)
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      eventSourceRef.current = null;

      if (autoReconnect && mountedRef.current) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        reconnectTimerRef.current = setTimeout(connect, delay);
      }
    };
  }, [cleanup]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => { mountedRef.current = false; cleanup(); };
  }, [connect, cleanup]);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return { connected, lastEvent, reconnect };
}

// ─── Notification types ────────────────────────────────────────────────

export interface SyncNotification {
  id: string;
  type: 'demande' | 'chantier' | 'mission' | 'blocage' | 'equipe';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export function useSyncNotifications(maxNotifications = 20) {
  const [notifications, setNotifications] = useState<SyncNotification[]>([]);

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleDemande = useCallback((payload: Record<string, any>) => {
    const notif: SyncNotification = {
      id: `demande-${payload.demandeId}-${Date.now()}`,
      type: 'demande',
      title: 'Nouvelle demande reçue',
      message: `${payload.nomChantier} (${payload.client}) — ${payload.ville || 'Non spécifié'}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [notif, ...prev].slice(0, maxNotifications));
  }, [maxNotifications]);

  const handleChantier = useCallback((payload: Record<string, any>) => {
    const notif: SyncNotification = {
      id: `chantier-${payload.chantierId}-${Date.now()}`,
      type: 'chantier',
      title: 'Chantier créé',
      message: `"${payload.nom}" → ${payload.client || 'Client inconnu'}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [notif, ...prev].slice(0, maxNotifications));
  }, [maxNotifications]);

  const handleMission = useCallback((payload: Record<string, any>) => {
    const notif: SyncNotification = {
      id: `mission-${payload.missionId}-${Date.now()}`,
      type: 'mission',
      title: 'Équipe assignée',
      message: `${payload.equipeNom} → ${payload.chantierNom} (phase ${payload.phase})`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [notif, ...prev].slice(0, maxNotifications));
  }, [maxNotifications]);

  const handleBlocage = useCallback((payload: Record<string, any>) => {
    const notif: SyncNotification = {
      id: `blocage-${payload.blocageId}-${Date.now()}`,
      type: 'blocage',
      title: '⚠️ Blocage signalé',
      message: `${payload.equipeNom} — ${payload.chantierNom}: ${payload.raison}`,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [notif, ...prev].slice(0, maxNotifications));
  }, [maxNotifications]);

  const handleEquipe = useCallback((payload: Record<string, any>, title: string, message: string) => {
    const notif: SyncNotification = {
      id: `equipe-${payload.equipeId || payload.missionId || ''}-${Date.now()}`,
      type: 'equipe',
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setNotifications(prev => [notif, ...prev].slice(0, maxNotifications));
  }, [maxNotifications]);

  return {
    notifications,
    unreadCount,
    markRead,
    clearAll,
    handleDemande,
    handleChantier,
    handleMission,
    handleBlocage,
    handleEquipe,
  };
}
