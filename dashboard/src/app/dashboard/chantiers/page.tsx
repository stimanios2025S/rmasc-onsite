'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fetchChantiers, creerChantier, modifierChantier, supprimerChantier, fetchEquipes, reassignerEquipe, type ChantierData, type EquipeData } from '@/lib/api';
import {
  Search, Wrench, Zap, Shield, Loader2, Plus, ArrowUpRight, X,
  MapPin, Building2, CheckCircle, Upload, FileText, ChevronLeft, ChevronRight,
  User, Phone, Clock, AlertTriangle, HardHat, Send, Users, CircleDot,
} from 'lucide-react';
import MapPicker from '@/components/MapPicker';

/* ═══════════════════════════════════════════════════════════════
   TEAM SEARCH BAR — Portal-based dropdown, never clipped
   ═══════════════════════════════════════════════════════════════ */
const STATUT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  DISPONIBLE: { label: 'Disponible', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  EN_MISSION: { label: 'En mission', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  EN_REPOS: { label: 'En repos', color: 'text-stone-400', bg: 'bg-stone-100 border-stone-200' },
};
const TYPE_ICONS: Record<string, any> = { mecanique: Wrench, electrique: Zap, verification: Shield, mixte: Shield };
const TYPE_LABELS: Record<string, string> = { mecanique: 'Méca', electrique: 'Élec', verification: 'Vérif', mixte: 'Mixte' };

function TeamSearchBar({
  equipes,
  selectedId,
  onSelect,
  disabled,
  placeholder,
}: {
  equipes: EquipeData[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selectedEquipe = equipes.find(e => e.id === selectedId);

  useEffect(() => {
    if (selectedEquipe) setQuery('');
  }, [selectedEquipe?.id]);

  const filtered = useMemo(() => {
    if (!query.trim()) return equipes;
    const q = query.toLowerCase().trim();
    return equipes.filter(e =>
      e.nom.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      e.statut_equipe.toLowerCase().includes(q) ||
      e.membres_noms?.toLowerCase().includes(q)
    );
  }, [equipes, query]);

  // Calculate dropdown position from trigger element
  function updatePosition() {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    // If less than 320px below, open upward
    if (spaceBelow < 320) {
      setDropPos({ top: rect.top - 8, left: rect.left, width: rect.width });
    } else {
      setDropPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  }

  function openDropdown() {
    updatePosition();
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const reposition = () => updatePosition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') { openDropdown(); setHighlightIdx(0); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && highlightIdx >= 0 && filtered[highlightIdx]) {
      e.preventDefault();
      onSelect(filtered[highlightIdx].id);
      setOpen(false);
      setQuery('');
      setHighlightIdx(-1);
    }
    else if (e.key === 'Escape') { setOpen(false); setHighlightIdx(-1); }
  }

  const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - dropPos.top - 40 : 400;
  const openUpward = spaceBelow < 320;

  return (
    <div ref={wrapRef} className="relative">
      {/* Display / Trigger */}
      {!open && selectedEquipe && !disabled ? (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-indigo-100 transition-all" onClick={() => openDropdown()}>
          <Users size={14} className="text-indigo-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-indigo-800 truncate">{selectedEquipe.nom}</span>
              <span className="text-[10px] font-medium text-indigo-500 bg-indigo-100 px-1.5 py-0.5 rounded shrink-0">{TYPE_LABELS[selectedEquipe.type] || selectedEquipe.type}</span>
            </div>
            {selectedEquipe.membres_noms && (
              <p className="text-[10px] text-indigo-500 truncate mt-0.5">{selectedEquipe.membres_noms}</p>
            )}
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${STATUT_LABELS[selectedEquipe.statut_equipe]?.bg || 'bg-stone-100'} ${STATUT_LABELS[selectedEquipe.statut_equipe]?.color || 'text-stone-500'} border`}>
            {STATUT_LABELS[selectedEquipe.statut_equipe]?.label || selectedEquipe.statut_equipe}
          </span>
          <button onClick={(e) => { e.stopPropagation(); onSelect(''); setQuery(''); }} className="ml-auto text-stone-300 hover:text-rose-500 shrink-0"><X size={14} /></button>
        </div>
      ) : (
        <div className={`flex items-center gap-2 bg-stone-50 border rounded-xl px-3 py-2.5 transition-all ${open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-stone-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text'}`}
          onClick={() => { if (!disabled) openDropdown(); }}>
          <Search size={14} className={`${open ? 'text-indigo-400' : 'text-stone-300'} shrink-0`} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlightIdx(0); if (!open) { updatePosition(); setOpen(true); } }}
            onFocus={() => { if (!disabled) { updatePosition(); setOpen(true); } }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Rechercher une équipe...'}
            disabled={disabled}
            className="bg-transparent text-sm text-stone-700 outline-none flex-1 placeholder:text-stone-300 disabled:cursor-not-allowed"
          />
          {query && (
            <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="text-stone-300 hover:text-stone-500 shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ═══ PORTAL DROPDOWN — renders at body level, never clipped ═══ */}
      {open && !disabled && typeof document !== 'undefined' && createPortal(
        <>
          {/* Invisible backdrop to catch clicks outside */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] bg-white rounded-2xl border border-stone-200 shadow-2xl shadow-stone-300/30 overflow-hidden flex flex-col"
            style={{
              top: openUpward ? 'auto' : dropPos.top,
              bottom: openUpward ? window.innerHeight - dropPos.top : 'auto',
              left: dropPos.left,
              width: dropPos.width,
              maxHeight: '300px',
            }}
          >
            {/* Stats bar */}
            <div className="flex items-center gap-2 px-4 py-2 bg-stone-50 border-b border-stone-100 shrink-0">
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                {filtered.length} équipe{filtered.length !== 1 ? 's' : ''}
              </span>
              {query && (
                <span className="text-[10px] text-stone-300">· pour &quot;{query}&quot;</span>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-emerald-500">
                  {equipes.filter(e => e.statut_equipe === 'DISPONIBLE').length} dispo
                </span>
                <span className="text-[10px] font-medium text-blue-500">
                  {equipes.filter(e => e.statut_equipe === 'EN_MISSION').length} en mission
                </span>
              </div>
            </div>
            {/* Team list */}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <Search size={24} className="text-stone-200 mx-auto mb-2" />
                  <p className="text-xs text-stone-400">Aucune équipe trouvée</p>
                  <p className="text-[10px] text-stone-300 mt-1">Essayez un autre terme de recherche</p>
                </div>
              ) : (
                filtered.map((eq, idx) => {
                  const TypeIcon = TYPE_ICONS[eq.type] || Shield;
                  const isSel = eq.id === selectedId;
                  const statutInfo = STATUT_LABELS[eq.statut_equipe] || { label: eq.statut_equipe, color: 'text-stone-500', bg: 'bg-stone-100' };
                  return (
                    <button
                      key={eq.id}
                      onClick={(e) => { e.stopPropagation(); onSelect(eq.id); setOpen(false); setQuery(''); }}
                      onMouseEnter={() => setHighlightIdx(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all ${isSel ? 'bg-indigo-50' : idx === highlightIdx ? 'bg-stone-50' : 'bg-white'} hover:bg-indigo-50 border-b border-stone-50 last:border-0`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${eq.type === 'mecanique' ? 'bg-blue-100 text-blue-600' : eq.type === 'electrique' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        <TypeIcon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-stone-800 truncate">{eq.nom}</span>
                          {isSel && <CheckCircle size={12} className="text-indigo-500 shrink-0" />}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-medium text-stone-400">{TYPE_LABELS[eq.type] || eq.type}</span>
                          {eq.membres_noms && (
                            <>
                              <span className="text-stone-200">·</span>
                              <span className="text-[10px] text-stone-400 truncate">👤 {eq.membres_noms}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-lg shrink-0 border ${statutInfo.bg} ${statutInfo.color}`}>
                        {statutInfo.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

const PHASE_ICON: Record<string, any> = { mecanique: Wrench, electrique: Zap, verification: Shield };
const PHASE_COLOR: Record<string, string> = {
  mecanique: 'text-blue-600 bg-blue-50',
  electrique: 'text-orange-600 bg-orange-50',
  verification: 'text-emerald-600 bg-emerald-50',
};
const STATUT_DOT: Record<string, string> = {
  en_cours: 'bg-emerald-400', bloque: 'bg-rose-400', planifie: 'bg-indigo-400',
  termine: 'bg-stone-300', en_attente: 'bg-amber-400', reception_officielle: 'bg-emerald-300',
};

const COMPLEXITE_OPTIONS = [
  { value: 'FACILE', label: 'Facile', desc: 'Gaine standard. Délais normaux.', color: 'emerald', icon: CheckCircle },
  { value: 'MOYENNE', label: 'Moyenne', desc: 'Contraintes mineures, buffer standard.', color: 'amber', icon: Clock },
  { value: 'DIFFICILE', label: 'Difficile', desc: 'Gaine complexe. Alerte prioritaire.', color: 'rose', icon: AlertTriangle },
];

export default function ChantiersPage() {
  const [chantiers, setChantiers] = useState<ChantierData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('Tous');
  const [recherche, setRecherche] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [creant, setCreant] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [form, setForm] = useState({
    nom_projet: '', client_nom: '', client_telephone: '', client_adresse: '',
    latitude: '', longitude: '', rayon_geofencing: '50',
    complexite: 'MOYENNE', fiche_technique: '', dxf_url: '', pdf_url: '',
    date_echeance: '',
  });
  const [dxfFile, setDxfFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [detailChantier, setDetailChantier] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editChantier, setEditChantier] = useState<ChantierData | null>(null);
  const [editForm, setEditForm] = useState({ nom: '', client_nom: '', adresse: '', latitude: '', longitude: '', complexite: 'MOYENNE', rayonGeofencing: 50, equipe_id: '', date_echeance: '' });
  const [saving, setSaving] = useState(false);
  const [equipes, setEquipes] = useState<EquipeData[]>([]);
  const [reassignChantier, setReassignChantier] = useState<ChantierData | null>(null);
  const [reassignLoading, setReassignLoading] = useState(false);

  useEffect(() => { loadChantiers(); loadEquipes(); }, []);

  async function loadChantiers() {
    try { setChantiers(await fetchChantiers()); } catch (_) { }
    setLoading(false);
  }

  async function loadEquipes() {
    try { setEquipes(await fetchEquipes()); } catch (_) { }
  }

  async function handleReassigner(chantierId: string, nouvelleEquipeId: string) {
    setReassignLoading(true);
    try {
      const res = await reassignerEquipe(chantierId, nouvelleEquipeId);
      setMessage({ type: 'success', text: res.message || 'Équipe réassignée.' });
      setReassignChantier(null);
      await loadChantiers();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Erreur de réassignation.' });
    }
    setReassignLoading(false);
  }

  async function uploadFile(file: File, type: string): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('type', type);
    const res = await fetch('/api/upload/single', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Upload échoué');
    const data = await res.json();
    return data.url;
  }

  async function handleCreer() {
    if (creant) return;
    setCreant(true);
    setMessage(null);
    try {
      let dxfUrl = form.dxf_url;
      let pdfUrl = form.pdf_url;
      if (dxfFile) dxfUrl = await uploadFile(dxfFile, 'dxf');
      if (pdfFile) pdfUrl = await uploadFile(pdfFile, 'pdf');
      const res = await creerChantier({
        nom: form.nom_projet,
        client_nom: form.client_nom || undefined,
        adresse: form.client_adresse || undefined,
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        rayon_geofencing: parseInt(form.rayon_geofencing) || 50,
        complexite: form.complexite,
        dxfUrl: dxfUrl || undefined,
        pdfUrl: pdfUrl || undefined,
        ficheTechnique: form.fiche_technique || undefined,
        date_echeance: form.date_echeance || undefined,
      });
      setMessage({ type: 'success', text: res.message || 'Chantier créé !' });
      setShowWizard(false);
      setStep(1);
      resetForm();
      await loadChantiers();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Erreur de création.' });
    }
    setCreant(false);
  }

  function resetForm() {
    setForm({
      nom_projet: '', client_nom: '', client_telephone: '', client_adresse: '',
      latitude: '', longitude: '', rayon_geofencing: '50',
      complexite: 'MOYENNE', fiche_technique: '', dxf_url: '', pdf_url: '',
      date_echeance: '',
    });
    setDxfFile(null);
    setPdfFile(null);
  }

  function ouvrirEdition(c: ChantierData) {
    setEditChantier(c);
    // Trouver l'equipe_id correspondant au nom de l'équipe actuelle
    const currentEquipe = equipes.find(e => e.nom === c.equipe_actuelle);
    setEditForm({
      nom: c.nom,
      client_nom: c.client_nom || '',
      adresse: '',
      latitude: c.lat?.toString() || '',
      longitude: c.lng?.toString() || '',
      complexite: c.complexite || 'MOYENNE',
      rayonGeofencing: 50,
      equipe_id: currentEquipe?.id || '',
      date_echeance: c.date_echeance ? c.date_echeance.slice(0, 16) : '',
    });
  }

  async function handleSauvegarder() {
    if (!editChantier) return;
    setSaving(true);
    try {
      await modifierChantier(editChantier.id, {
        nom: editForm.nom,
        client_nom: editForm.client_nom || undefined,
        adresse: editForm.adresse || undefined,
        latitude: parseFloat(editForm.latitude),
        longitude: parseFloat(editForm.longitude),
        complexite: editForm.complexite,
        rayon_geofencing: editForm.rayonGeofencing || 50,
        date_echeance: editForm.date_echeance || undefined,
      });
      // Si l'équipe a changé, réassigner
      if (editForm.equipe_id && editForm.equipe_id !== equipes.find(e => e.nom === editChantier.equipe_actuelle)?.id) {
        try {
          await reassignerEquipe(editChantier.id, editForm.equipe_id);
        } catch (smsErr: any) {
          // Si le backend bloque (équipe sur site), afficher l'erreur mais ne pas empêcher la sauvegarde du chantier
          setMessage({ type: 'error', text: smsErr.message || 'Chantier mis à jour, mais erreur réassignation.' });
          setSaving(false);
          setEditChantier(null);
          await loadChantiers();
          return;
        }
      }
      setMessage({ type: 'success', text: 'Chantier mis à jour.' });
      setEditChantier(null);
      await loadChantiers();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Erreur de mise à jour.' });
    }
    setSaving(false);
  }

  async function handleSupprimer(id: string, nom: string) {
    if (!confirm(`Supprimer définitivement le chantier "${nom}" ?`)) return;
    try {
      await supprimerChantier(id);
      setMessage({ type: 'success', text: `Chantier "${nom}" supprimé.` });
      await loadChantiers();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Erreur de suppression.' });
    }
  }

  async function ouvrirDetail(id: string) {
    setDetailLoading(true);
    setDetailChantier(null);
    try {
      const res = await fetch(`/api/chantiers/${id}/detail`);
      if (res.ok) setDetailChantier(await res.json());
    } catch (_) { }
    setDetailLoading(false);
  }

  const filtres = ['Tous', 'En cours', 'Bloqués', 'Planifiés', 'Terminés'];
  const statMap: Record<string, string> = {
    'En cours': 'en_cours', 'Bloqués': 'bloque', 'Planifiés': 'planifie', 'Terminés': 'termine',
  };
  const filtered = chantiers.filter(c => {
    if (filtreStatut !== 'Tous' && c.statut !== statMap[filtreStatut]) return false;
    if (recherche && !c.nom.toLowerCase().includes(recherche.toLowerCase()) && !c.ref.toLowerCase().includes(recherche.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 size={36} className="animate-spin text-indigo-500" /></div>;
  }

  return (
    <div>
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-stone-800">
          Chantiers <span className="text-stone-400 font-normal">({chantiers.length})</span>
        </h1>
        <button onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:from-indigo-600 hover:to-purple-700 shadow-lg shadow-indigo-500/20 transition-all">
          <Plus size={16} /> Ajouter un Chantier
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 px-4 py-3 rounded-2xl text-sm font-medium flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <X size={18} />}
          {message.text}
          <button onClick={() => setMessage(null)} className="ml-auto"><X size={16} /></button>
        </div>
      )}

      {/* Recherche + Filtres */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex items-center gap-2 bg-white/80 rounded-2xl px-4 py-2 border border-stone-100 shadow-sm flex-1">
          <Search size={16} className="text-stone-300" />
          <input placeholder="Rechercher un chantier..." value={recherche} onChange={e => setRecherche(e.target.value)}
            className="bg-transparent text-sm text-stone-600 outline-none flex-1 placeholder:text-stone-300" />
        </div>
        <div className="flex bg-white/80 rounded-2xl border border-stone-100 shadow-sm p-1 gap-1 flex-wrap">
          {filtres.map(f => (
            <button key={f} onClick={() => setFiltreStatut(f)}
              className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${filtreStatut === f ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}>{f}</button>
          ))}
        </div>
      </div>

      {/* Grille de chantiers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <p className="col-span-full text-center text-stone-400 py-16">Aucun chantier trouvé.</p>
        ) : filtered.map(c => {
          const Icon = PHASE_ICON[c.phase_actuelle || 'mecanique'] || Wrench;
          const phase = c.phase_actuelle || 'mecanique';
          return (
            <div key={c.id} onClick={() => ouvrirDetail(c.id)}
              className="bg-white/90 backdrop-blur-md rounded-3xl border border-stone-100 shadow-sm p-5 hover:shadow-md transition-all group cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 mt-0.5 rounded-full shrink-0 ${STATUT_DOT[c.statut] || 'bg-stone-300'}`} />
                  <div>
                    <p className="text-sm font-semibold text-stone-800">{c.nom}</p>
                    <p className="text-[10px] text-stone-400 font-mono">{c.ref}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => ouvrirEdition(c)} title="Modifier"
                    className="p-2 rounded-lg bg-stone-50 text-stone-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                  </button>
                  <button onClick={() => handleSupprimer(c.id, c.nom)} title="Supprimer"
                    className="p-2 rounded-lg bg-stone-50 text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition-all">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>

              {/* ═══ ÉQUIPE ASSIGNÉE ═══ */}
              <div className="mb-3">
                {c.equipe_actuelle && c.equipe_actuelle !== 'Aucune équipe' && c.equipe_actuelle !== 'Aucune' ? (
                  <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl px-3 py-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider">Équipe</span>
                        <CircleDot size={8} className="text-emerald-400" />
                      </div>
                      <p className="text-xs font-bold text-indigo-800 truncate">{c.equipe_actuelle}</p>
                    </div>
                    {(c.en_cours ?? 0) > 0 && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 shrink-0 flex items-center gap-1">
                        <CircleDot size={8} /> Sur site
                      </span>
                    )}
                    {(c as any).mission_statut === 'en_route' && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold text-sky-600 bg-sky-50 border border-sky-200 shrink-0 flex items-center gap-1">
                        🚗 En route
                      </span>
                    )}
                    {(c as any).mission_statut === 'en_pause' && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 shrink-0 flex items-center gap-1">
                        ⏸ Pause
                      </span>
                    )}
                    {phase && (
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 ${PHASE_COLOR[phase] || 'bg-stone-100 text-stone-600'}`}>
                        <Icon size={11} /> {phase === 'mecanique' ? 'Méca' : phase === 'electrique' ? 'Élec' : 'Vérif'}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-stone-50 border border-dashed border-stone-200 rounded-xl px-3 py-2">
                    <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-stone-300" />
                    </div>
                    <div className="flex-1">
                      <span className="text-[10px] font-semibold text-stone-300 uppercase tracking-wider">Équipe</span>
                      <p className="text-xs text-stone-400 italic">Non assignée</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs text-stone-500 mb-3">
                <span>{c.client_nom || 'Client inconnu'}</span>
                {c.complexite && (
                  <>
                    <span className="text-stone-300">•</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      c.complexite === 'DIFFICILE' ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : c.complexite === 'FACILE' ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                      : 'bg-amber-50 text-amber-600 border-amber-200'
                    }`}>{c.complexite}</span>
                  </>
                )}
                {c.date_echeance && (
                  <>
                    <span className="text-stone-300">•</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                      new Date(c.date_echeance) < new Date() ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-indigo-50 text-indigo-600 border-indigo-200'
                    }`}>
                      ⏰ {new Date(c.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </>
                )}
              </div>

              {(c.dxf || c.pdf) && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {c.dxf && (
                    <a href={`https://onsite.sarl-rmasc.com${c.dxf}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-full transition-all">
                      <FileText size={11} /> Plan CAD
                    </a>
                  )}
                  {c.pdf && (
                    <a href={`https://onsite.sarl-rmasc.com${c.pdf}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-full transition-all">
                      <FileText size={11} /> Fiche Technique
                    </a>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-stone-400 mb-1">
                <span className="flex items-center gap-1">📍 {c.lat?.toFixed(2)}, {c.lng?.toFixed(2)}</span>
                <span className="flex items-center gap-2 font-medium">
                  {c.en_cours > 0 && <span className="text-indigo-600">🔄 {c.en_cours}</span>}
                  {(c.en_attente ?? 0) > 0 && <span className="text-amber-500">⏳ {c.en_attente}</span>}
                  {(c.bloquee ?? 0) > 0 && <span className="text-rose-500">🚫 {c.bloquee}</span>}
                  {(c.terminee ?? 0) > 0 && <span className="text-emerald-500">✅ {c.terminee}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══ WIZARD MODAL (3 étapes, responsive) ═══ */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowWizard(false); }}>
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh]">
            {/* Barre de progression */}
            <div className="shrink-0 flex items-center bg-gradient-to-r from-indigo-50 to-purple-50 px-4 sm:px-8 py-4 border-b border-stone-100">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center flex-1 last:flex-none">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step > s ? 'bg-emerald-500 text-white' : step === s ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30' : 'bg-stone-200 text-stone-400'}`}>
                    {step > s ? <CheckCircle size={18} /> : s}
                  </div>
                  <span className={`ml-3 text-xs font-semibold hidden sm:block ${step >= s ? 'text-stone-800' : 'text-stone-300'}`}>
                    {s === 1 ? 'Client' : s === 2 ? 'Complexité' : 'Documents'}
                  </span>
                  {s < 3 && <div className={`flex-1 h-0.5 mx-3 ${step > s ? 'bg-emerald-400' : 'bg-stone-200'}`} />}
                </div>
              ))}
              <button onClick={() => { setShowWizard(false); resetForm(); }} className="ml-4 text-stone-300 hover:text-stone-500"><X size={22} /></button>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8">
              {/* STEP 1: CLIENT */}
              {step === 1 && (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 size={18} className="text-indigo-500" />
                      <h4 className="font-bold text-stone-700">Informations Générales & Client</h4>
                    </div>
                    <p className="text-xs text-stone-400 mb-4">Saisissez les détails du projet et du client</p>
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Nom du projet *</label>
                        <input value={form.nom_projet} onChange={e => setForm({ ...form, nom_projet: e.target.value })} required
                          placeholder="Ex: Clinique Saint-Charles"
                          className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-stone-500 mb-1.5 block"><User size={12} className="inline mr-1" />Nom du client</label>
                          <input value={form.client_nom} onChange={e => setForm({ ...form, client_nom: e.target.value })}
                            placeholder="Dr. Martin" className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-stone-500 mb-1.5 block"><Phone size={12} className="inline mr-1" />Téléphone</label>
                          <input value={form.client_telephone} onChange={e => setForm({ ...form, client_telephone: e.target.value })}
                            placeholder="+213..." type="tel" inputMode="tel" autoComplete="tel"
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 outline-none focus:border-indigo-400 transition-all"
                            style={{ fontSize: '16px' }} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Adresse du chantier</label>
                          <input value={form.client_adresse} onChange={e => setForm({ ...form, client_adresse: e.target.value })}
                            placeholder="15 Rue des Capucins, Alger" className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-stone-500 mb-1.5 block">📏 Zone de travail (m)</label>
                          <input value={form.rayon_geofencing} onChange={e => setForm({ ...form, rayon_geofencing: e.target.value })}
                            type="number" min="10" max="500" placeholder="50"
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-stone-500 mb-1.5 block"><MapPin size={12} className="inline mr-1" />Latitude *</label>
                          <input value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} required
                            type="number" step="any" placeholder="36.7525"
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-stone-500 mb-1.5 block"><MapPin size={12} className="inline mr-1" />Longitude *</label>
                          <input value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} required
                            type="number" step="any" placeholder="3.0588"
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1.5 block">📅 Date limite (Échéance)</label>
                        <input value={form.date_echeance} onChange={e => setForm({ ...form, date_echeance: e.target.value })}
                          type="datetime-local"
                          className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                        <p className="text-[10px] text-stone-400 mt-1">L'équipe doit terminer avant cette date</p>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-stone-500 mb-1.5 block"><MapPin size={12} className="inline mr-1" />Position sur la carte</label>
                        <MapPicker
                          initialLat={form.latitude ? parseFloat(form.latitude) : 36.75}
                          initialLng={form.longitude ? parseFloat(form.longitude) : 3.05}
                          initialRayon={parseInt(form.rayon_geofencing) || 50}
                          onPositionChange={(lat, lng) => setForm({ ...form, latitude: String(lat), longitude: String(lng) })}
                          onRayonChange={(r) => setForm({ ...form, rayon_geofencing: String(r) })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: COMPLEXITÉ */}
              {step === 2 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <HardHat size={18} className="text-amber-500" />
                    <h4 className="font-bold text-stone-700">Complexité du Chantier</h4>
                  </div>
                  <p className="text-xs text-stone-400 mb-6">Évaluez la difficulté de la gaine pour déterminer les délais</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {COMPLEXITE_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const active = form.complexite === opt.value;
                      return (
                        <button key={opt.value} type="button" onClick={() => setForm({ ...form, complexite: opt.value })}
                          className={`p-5 rounded-2xl border-2 text-center transition-all ${active
                            ? opt.value === 'DIFFICILE' ? 'border-rose-400 bg-rose-50 shadow-lg shadow-rose-100'
                            : opt.value === 'MOYENNE' ? 'border-amber-400 bg-amber-50 shadow-lg shadow-amber-100'
                            : 'border-emerald-400 bg-emerald-50 shadow-lg shadow-emerald-100'
                            : 'border-stone-200 bg-white hover:border-stone-300'}`}>
                          <div className={`w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center ${opt.value === 'DIFFICILE' ? 'bg-rose-100 text-rose-600' : opt.value === 'MOYENNE' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            <Icon size={24} />
                          </div>
                          <p className="font-bold text-stone-800 mb-1">{opt.label}</p>
                          <p className="text-xs text-stone-400 leading-relaxed">{opt.desc}</p>
                          {opt.value === 'DIFFICILE' && (
                            <span className="inline-block mt-2 text-[10px] font-bold text-rose-500 bg-rose-100 px-2 py-0.5 rounded-full">⚠ Alerte Prioritaire</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: DOCUMENTS */}
              {step === 3 && (
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Upload size={18} className="text-purple-500" />
                      <h4 className="font-bold text-stone-700">Documents Techniques & Fichiers CAD</h4>
                    </div>
                    <p className="text-xs text-stone-400 mb-4">Ajoutez les plans et la fiche technique</p>
                  </div>

                  {/* DXF */}
                  <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${dxfFile ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-stone-50 hover:border-indigo-300'}`}>
                    {dxfFile ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileText size={24} className="text-emerald-500" />
                          <div className="text-left">
                            <p className="text-sm font-semibold text-stone-700">{dxfFile.name}</p>
                            <p className="text-xs text-stone-400">{(dxfFile.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setDxfFile(null)} className="text-rose-400 hover:text-rose-600"><X size={18} /></button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <FileText size={32} className="text-stone-300 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-stone-500">Fichier CAD / Plan</p>
                        <p className="text-xs text-stone-400 mt-1">Déposez un fichier .DXF ou .PDF</p>
                        <input type="file" accept=".dxf,.pdf,.dwg" onChange={e => setDxfFile(e.target.files?.[0] || null)} className="hidden" />
                        <span className="inline-block mt-3 text-xs font-medium text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">Parcourir</span>
                      </label>
                    )}
                  </div>

                  {/* PDF */}
                  <div className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${pdfFile ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-stone-50 hover:border-indigo-300'}`}>
                    {pdfFile ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileText size={24} className="text-emerald-500" />
                          <div className="text-left">
                            <p className="text-sm font-semibold text-stone-700">{pdfFile.name}</p>
                            <p className="text-xs text-stone-400">{(pdfFile.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setPdfFile(null)} className="text-rose-400 hover:text-rose-600"><X size={18} /></button>
                      </div>
                    ) : (
                      <label className="cursor-pointer block">
                        <FileText size={32} className="text-stone-300 mx-auto mb-2" />
                        <p className="text-sm font-semibold text-stone-500">Fiche Technique</p>
                        <p className="text-xs text-stone-400 mt-1">Déposez la fiche technique (.PDF)</p>
                        <input type="file" accept=".pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)} className="hidden" />
                        <span className="inline-block mt-3 text-xs font-medium text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">Parcourir</span>
                      </label>
                    )}
                  </div>

                  {/* Fiche technique texte */}
                  <div>
                    <label className="text-xs font-semibold text-stone-500 mb-1.5 block">Spécifications techniques</label>
                    <textarea value={form.fiche_technique} onChange={e => setForm({ ...form, fiche_technique: e.target.value })}
                      placeholder="Type motorisation, dimensions gaine, vitesse, nombre étages..." rows={4}
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all resize-none" />
                  </div>
                </div>
              )}
            </div>

            {/* Boutons */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-8 py-4 border-t border-stone-100 bg-white pb-safe">
              {step > 1 ? (
                <button type="button" onClick={() => setStep(step - 1)}
                  className="flex items-center justify-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-700 px-4 py-3 rounded-xl min-w-[100px]">
                  <ChevronLeft size={18} /> Retour
                </button>
              ) : <div className="min-w-[100px]" />}
              {step < 3 ? (
                <button type="button" onClick={() => setStep(step + 1)}
                  disabled={(step === 1 && (!form.nom_projet || !form.latitude || !form.longitude))}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-stone-800 text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-stone-900 disabled:opacity-40 transition-all shadow-lg">
                  Suivant <ChevronRight size={18} />
                </button>
              ) : (
                <button type="button" onClick={handleCreer} disabled={creant}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-3 rounded-xl text-sm font-semibold hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20">
                  {creant ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  Créer le Chantier
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: MODIFIER ═══ */}
      {editChantier && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setEditChantier(null); }}>
          <div className="relative bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-8 py-5 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                  <Building2 size={18} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-800">Modifier le Chantier</h3>
                  <p className="text-xs text-stone-400">{editChantier.ref}</p>
                </div>
              </div>
              <button onClick={() => setEditChantier(null)} className="text-stone-300 hover:text-stone-500"><X size={20} /></button>
            </div>
            <div className="p-8 space-y-4">
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">Nom du chantier</label>
                <input value={editForm.nom} onChange={e => setEditForm({ ...editForm, nom: e.target.value })}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Client</label>
                  <input value={editForm.client_nom} onChange={e => setEditForm({ ...editForm, client_nom: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Complexité</label>
                  <select value={editForm.complexite} onChange={e => setEditForm({ ...editForm, complexite: e.target.value })}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all">
                    <option value="FACILE">FACILE</option>
                    <option value="MOYENNE">MOYENNE</option>
                    <option value="DIFFICILE">DIFFICILE</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Latitude</label>
                  <input value={editForm.latitude} onChange={e => setEditForm({ ...editForm, latitude: e.target.value })}
                    type="number" step="any" className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 mb-1 block">Longitude</label>
                  <input value={editForm.longitude} onChange={e => setEditForm({ ...editForm, longitude: e.target.value })}
                    type="number" step="any" className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">📏 Zone de travail (m)</label>
                <input value={editForm.rayonGeofencing} onChange={e => setEditForm({ ...editForm, rayonGeofencing: parseInt(e.target.value) || 50 })}
                  type="number" min="10" max="500" className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 mb-1 block">📅 Date limite (Échéance)</label>
                <input value={editForm.date_echeance} onChange={e => setEditForm({ ...editForm, date_echeance: e.target.value })}
                  type="datetime-local"
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-sm text-stone-700 outline-none focus:border-indigo-400 transition-all" />
                <p className="text-[10px] text-stone-400 mt-1">L'équipe doit terminer avant cette date</p>
              </div>

              {/* ═══ ÉQUIPE ASSIGNÉE ═══ */}
              <div className="border-t border-stone-100 pt-4 mt-2">
                <label className="text-xs font-semibold text-stone-500 mb-1.5 flex items-center gap-1.5">
                  <Users size={12} /> Équipe assignée
                </label>
                {editChantier.equipe_actuelle && editChantier.equipe_actuelle !== 'Aucune équipe' && editChantier.equipe_actuelle !== 'Aucune' ? (
                  (() => {
                    const missionStatut = (editChantier as any).mission_statut;
                    const canReassign = missionStatut === 'en_attente' || missionStatut === 'en_route' || !missionStatut;
                    if (canReassign) {
                      return (
                        <>
                          <TeamSearchBar
                            equipes={equipes}
                            selectedId={editForm.equipe_id}
                            onSelect={(id) => setEditForm({ ...editForm, equipe_id: id })}
                            placeholder="Rechercher une équipe par nom, type, chef..."
                          />
                          <p className="text-[10px] text-stone-400 mt-1.5">💡 Travail pas encore commencé — vous pouvez changer l'équipe.</p>
                        </>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                        <CircleDot size={14} className="text-emerald-600" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-800">{editChantier.equipe_actuelle}</p>
                          <p className="text-[10px] text-emerald-600">
                            {missionStatut === 'en_cours' ? '🔧 Travail en cours — modification impossible.' :
                             missionStatut === 'en_pause' ? '⏸ En pause — modification impossible.' :
                             'L\'équipe est sur site — modification impossible.'}
                          </p>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <TeamSearchBar
                      equipes={equipes}
                      selectedId={editForm.equipe_id}
                      onSelect={(id) => setEditForm({ ...editForm, equipe_id: id })}
                      placeholder="Rechercher une équipe à assigner..."
                    />
                    <p className="text-[10px] text-stone-400 mt-1.5">Aucune équipe assignée — recherchez et sélectionnez une équipe.</p>
                  </>
                )}
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setEditChantier(null)}
                  className="flex-1 bg-stone-100 text-stone-500 py-3 rounded-xl text-sm font-semibold hover:bg-stone-200 transition-all">Annuler</button>
                <button onClick={handleSauvegarder} disabled={saving}
                  className="flex-1 bg-indigo-500 text-white py-3 rounded-xl text-sm font-semibold hover:bg-indigo-600 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />} Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: DÉTAIL + ROADMAP ═══ */}
      {detailChantier && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDetailChantier(null); }}>
          <div className="relative bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-600 text-white shrink-0">
              <div>
                <h3 className="font-bold text-lg">{detailChantier.chantier?.nom_chantier}</h3>
                <p className="text-white/70 text-xs font-mono">{detailChantier.chantier?.reference_commande_erp}</p>
              </div>
              <div className="flex items-center gap-3">
                {detailChantier.chantier?.date_echeance && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 text-xs font-semibold">
                    <Clock size={12} />
                    Échéance: {new Date(detailChantier.chantier.date_echeance).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                )}
                <button onClick={() => setDetailChantier(null)} className="p-2 hover:bg-white/10 rounded-xl"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase font-semibold mb-1">Client</p>
                  <p className="text-sm font-medium text-stone-700">{detailChantier.chantier?.client_nom || '—'}</p>
                </div>
                <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase font-semibold mb-1">Complexité</p>
                  <p className={`text-sm font-bold ${detailChantier.chantier?.complexite === 'DIFFICILE' ? 'text-rose-600' : detailChantier.chantier?.complexite === 'FACILE' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {detailChantier.chantier?.complexite || '—'}
                  </p>
                </div>
                <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase font-semibold mb-1">Adresse</p>
                  <p className="text-sm font-medium text-stone-700">{detailChantier.chantier?.adresse || '—'}</p>
                </div>
                <div className="bg-stone-50 rounded-2xl p-3.5 border border-stone-100">
                  <p className="text-[10px] text-stone-400 uppercase font-semibold mb-1">Coordonnées</p>
                  <p className="text-sm font-medium text-stone-700 font-mono">{detailChantier.chantier?.lat?.toFixed(5)}, {detailChantier.chantier?.lng?.toFixed(5)}</p>
                </div>
              </div>

              <h4 className="font-bold text-stone-800 mb-4 flex items-center gap-2">
                <MapPin size={16} className="text-indigo-500" /> Roadmap des Phases
              </h4>
              {detailLoading ? (
                <div className="flex justify-center py-8"><Loader2 size={28} className="animate-spin text-indigo-500" /></div>
              ) : detailChantier.missions?.length === 0 ? (
                <p className="text-center text-stone-400 py-8 text-sm">Aucune mission assignée à ce chantier.</p>
              ) : (
                <div className="space-y-4">
                  {detailChantier.missions.map((m: any, idx: number) => (
                    <div key={m.id} className="relative pl-8">
                      {idx < detailChantier.missions.length - 1 && (
                        <div className="absolute left-[11px] top-7 bottom-[-8px] w-0.5 bg-stone-200" />
                      )}
                      <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full flex items-center justify-center border-2 ${m.statut === 'termine' ? 'bg-emerald-500 border-emerald-500' : m.statut === 'en_cours' ? 'bg-indigo-500 border-indigo-500' : m.statut === 'bloque' ? 'bg-rose-500 border-rose-500' : 'bg-white border-stone-300'}`}>
                        {m.statut === 'termine' && <CheckCircle size={12} className="text-white" />}
                      </div>
                      <div className={`bg-stone-50 rounded-2xl border p-4 ${m.statut === 'en_cours' ? 'border-indigo-200 bg-indigo-50/30' : m.statut === 'bloque' ? 'border-rose-200 bg-rose-50/30' : m.statut === 'termine' ? 'border-emerald-200 bg-emerald-50/30' : 'border-stone-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold ${m.phase === 'mecanique' ? 'bg-blue-100 text-blue-700' : m.phase === 'electrique' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {m.phase === 'mecanique' ? '🔧 Mécanique' : m.phase === 'electrique' ? '⚡ Électrique' : '🛡️ Vérification'}
                            </span>
                            {m.equipe_nom && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">👥 {m.equipe_nom}</span>}
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.statut === 'termine' ? 'bg-emerald-50 text-emerald-600' : m.statut === 'en_cours' ? 'bg-indigo-50 text-indigo-600' : m.statut === 'bloque' ? 'bg-rose-50 text-rose-600' : 'bg-stone-100 text-stone-500'}`}>
                            {m.statut === 'termine' ? 'Terminée' : m.statut === 'en_cours' ? 'En cours' : m.statut === 'bloque' ? 'Bloquée' : 'En attente'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${m.statut === 'termine' ? 'bg-emerald-400' : m.statut === 'bloque' ? 'bg-rose-400' : 'bg-indigo-400'}`} style={{ width: `${m.progression || 0}%` }} />
                          </div>
                          <span className="text-xs font-bold text-stone-500">{m.progression || 0}%</span>
                        </div>
                        {m.statut === 'en_cours' && m.etapeActuelle && (
                          <div className="mt-2.5 bg-white rounded-xl border border-indigo-100 p-2.5">
                            <div className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 mt-1 rounded-full bg-indigo-400 flex-shrink-0" />
                              <div className="text-[11px]">
                                {m.etapePrecedente && <p className="text-stone-400">Précédent: <span className="text-emerald-600 line-through">{m.etapePrecedente}</span></p>}
                                <p className="text-stone-400 font-medium mt-0.5">Étape en cours:</p>
                                <p className="text-stone-700 font-semibold">{m.etapeActuelle}{m.sousTacheActuelle && <span className="text-indigo-500"> ({m.sousTacheActuelle})</span>}</p>
                                {m.etapeSuivante && <p className="text-stone-400 mt-0.5">Suivant: <span className="text-stone-600">{m.etapeSuivante}</span></p>}
                              </div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-stone-400">
                          {m.date_debut && <span>Début: {m.date_debut}</span>}
                          {m.date_fin && <span>Fin: {m.date_fin}</span>}
                          {m.date_echeance && <span className="font-semibold text-amber-500">📅 Échéance: {m.date_echeance}</span>}
                          {m.retard_jours !== null && m.retard_jours > 0 && (
                            <span className="text-rose-500 font-bold">⏱ +{m.retard_jours}j retard</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(detailChantier.chantier?.dxf_url || detailChantier.chantier?.pdf_url) && (
                <div className="mt-6">
                  <h4 className="font-bold text-stone-800 mb-3 flex items-center gap-2">
                    <FileText size={16} className="text-indigo-500" /> Documents
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detailChantier.chantier?.dxf_url && (
                      <a href={`https://onsite.sarl-rmasc.com${detailChantier.chantier.dxf_url}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-4 py-2.5 rounded-xl transition-all">
                        <FileText size={14} /> Plan CAD
                      </a>
                    )}
                    {detailChantier.chantier?.pdf_url && (
                      <a href={`https://onsite.sarl-rmasc.com${detailChantier.chantier.pdf_url}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 px-4 py-2.5 rounded-xl transition-all">
                        <FileText size={14} /> Fiche Technique
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
