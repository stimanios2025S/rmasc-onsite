'use client';

import { useState, useRef, useEffect } from 'react';
import { useSyncEvents, useSyncNotifications, SyncNotification } from '@/lib/use-sync-events';

interface SyncNotificationsProps {
  onRefresh?: () => void;
}

export default function SyncNotifications({ onRefresh }: SyncNotificationsProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const {
    notifications,
    unreadCount,
    markRead,
    clearAll,
    handleDemande,
    handleChantier,
    handleMission,
    handleBlocage,
  } = useSyncNotifications();

  const { connected } = useSyncEvents({
    onDemandeRecue: (p) => { handleDemande(p); onRefresh?.(); },
    onChantierCree: (p) => { handleChantier(p); onRefresh?.(); },
    onMissionAssignee: (p) => { handleMission(p); onRefresh?.(); },
    onBlocageSignale: (p) => { handleBlocage(p); onRefresh?.(); },
    onEquipeEnRoute: () => { onRefresh?.(); },
    onEquipeArrivee: () => { onRefresh?.(); },
    onMissionTransferee: () => { onRefresh?.(); },
    onDataChanged: () => { onRefresh?.(); },
  });

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const iconFor = (type: SyncNotification['type']) => {
    switch (type) {
      case 'demande': return '📋';
      case 'chantier': return '🏗️';
      case 'mission': return '👷';
      case 'blocage': return '🚫';
    }
  };

  const colorFor = (type: SyncNotification['type']) => {
    switch (type) {
      case 'demande': return '#f59e0b';
      case 'chantier': return '#10b981';
      case 'mission': return '#3b82f6';
      case 'blocage': return '#ef4444';
    }
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'à l\'instant';
    if (diff < 3600000) return `il y a ${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `il y a ${Math.floor(diff / 3600000)}h`;
    return `il y a ${Math.floor(diff / 86400000)}j`;
  };

  return (
    <div className="sync-notifications" ref={panelRef}>
      {/* Bell button */}
      <button
        className="sync-bell"
        onClick={() => { setOpen(!open); if (!open && unreadCount > 0) clearAll(); }}
        title="Synchronisation temps réel"
      >
        <span className="sync-bell-icon">
          {connected ? '🔔' : '🔕'}
        </span>
        {unreadCount > 0 && (
          <span className="sync-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
        <span className={`sync-dot ${connected ? 'connected' : 'disconnected'}`} />
      </button>

      {/* Panel */}
      {open && (
        <div className="sync-panel">
          <div className="sync-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📡</span>
              <span style={{ fontWeight: 700 }}>Synchronisation</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontSize: '11px', padding: '2px 8px', borderRadius: '10px',
                background: connected ? '#10b98120' : '#ef444420',
                color: connected ? '#10b981' : '#ef4444',
                fontWeight: 600,
              }}>
                {connected ? 'En ligne' : 'Hors ligne'}
              </span>
            </div>
          </div>

          <div className="sync-panel-body">
            {notifications.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📡</div>
                <div style={{ fontSize: '13px' }}>Aucune notification pour l&apos;instant</div>
                <div style={{ fontSize: '11px', marginTop: '4px' }}>
                  Les nouveaux chantiers et équipes apparaîtront ici en temps réel
                </div>
              </div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`sync-notif ${n.read ? 'read' : 'unread'}`}
                  onClick={() => markRead(n.id)}
                >
                  <div className="sync-notif-icon" style={{ background: `${colorFor(n.type)}15` }}>
                    {iconFor(n.type)}
                  </div>
                  <div className="sync-notif-content">
                    <div className="sync-notif-title">{n.title}</div>
                    <div className="sync-notif-msg">{n.message}</div>
                    <div className="sync-notif-time">{timeAgo(n.timestamp)}</div>
                  </div>
                  {!n.read && <div className="sync-notif-dot" style={{ background: colorFor(n.type) }} />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
