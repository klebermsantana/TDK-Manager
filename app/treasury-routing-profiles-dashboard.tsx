"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Domain = "cash" | "critical_tasks" | "reconciliation" | "closing";
type Availability = "available" | "limited" | "unavailable";
type Profile = {
  id: number;
  name: string;
  email: string;
  role: string;
  availability: Availability;
  availabilityUntil: string | null;
  notes: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  skills: Record<Domain, number>;
};
type Payload = {
  currentUser: { email: string };
  profiles: Profile[];
  summary: { total: number; available: number; limited: number; unavailable: number; specialists: number };
};

const domains: Domain[] = ["cash", "critical_tasks", "reconciliation", "closing"];
const domainLabel: Record<Domain, string> = {
  cash: "Caixa",
  critical_tasks: "Pendências críticas",
  reconciliation: "Conciliação",
  closing: "Fechamento",
};
const levelLabel: Record<number, string> = { 0: "Sem competência", 1: "Apoio", 2: "Habilitado", 3: "Especialista" };
const availabilityLabel: Record<Availability, string> = { available: "Disponível", limited: "Limitado", unavailable: "Indisponível" };
const roleLabel: Record<string, string> = { admin: "Administrador", manager: "Gestor", seller: "Comercial", finance: "Financeiro", viewer: "Consulta" };

export function TreasuryRoutingProfilesDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [availability, setAvailability] = useState<Availability>("available");
  const [availabilityUntil, setAvailabilityUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [skills, setSkills] = useState<Record<Domain, number>>({ cash: 2, critical_tasks: 2, reconciliation: 2, closing: 2 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const locate = () => setTarget(document.querySelector<HTMLElement>(".receivable-metrics"));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/treasury-routing-profiles", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar competências da Tesouraria.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
      setSelectedId((current) => current && result.profiles.some((row) => row.id === current) ? current : result.profiles[0]?.id ?? null);
    } catch {
      if (!silent) setMessage("Não foi possível carregar competências da Tesouraria.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  const selected = useMemo(() => payload?.profiles.find((row) => row.id === selectedId) ?? null, [payload, selectedId]);
  useEffect(() => {
    if (!selected) return;
    setAvailability(selected.availability);
    setAvailabilityUntil(selected.availabilityUntil ?? "");
    setNotes(selected.notes ?? "");
    setSkills({ ...selected.skills });
  }, [selected?.id, selected?.updatedAt]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-routing-profiles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selected.id,
          availability,
          availabilityUntil: availability === "available" ? null : availabilityUntil || null,
          notes,
          skills,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível salvar o perfil de roteamento.");
        return;
      }
      setMessage("Competências e disponibilidade atualizadas.");
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const attention = Boolean(summary?.unavailable || summary?.limited);

  return <>
    {createPortal(
      <button type="button" className={`treasury-routing-trigger ${attention ? "warning" : "clear"}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>COMPETÊNCIAS</span>
        <strong>{summary?.available ?? "—"}/{summary?.total ?? "—"}</strong>
        <small>{summary?.unavailable ? `${summary.unavailable} indisponível(is)` : summary?.limited ? `${summary.limited} limitado(s)` : "equipe disponível"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-routing-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-routing-dashboard" role="dialog" aria-modal="true" aria-label="Competências e disponibilidade da Tesouraria">
        <header className="treasury-routing-header">
          <div>
            <small>TESOURARIA · ROTEAMENTO</small>
            <h2>Competências e disponibilidade</h2>
            <p>Define quem pode receber Caixa, Conciliação, Fechamento e Pendências críticas. Sugestões automáticas priorizam disponibilidade, competência e depois carga/SLA.</p>
          </div>
          <div className="treasury-routing-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="treasury-routing-message">{message}</div> : null}

        <div className="treasury-routing-kpis">
          <article><span>Equipe habilitada</span><strong>{summary?.total ?? 0}</strong><small>usuários com acesso à Tesouraria</small></article>
          <article className="good"><span>Disponíveis</span><strong>{summary?.available ?? 0}</strong><small>prioridade no roteamento</small></article>
          <article className={summary?.limited ? "warning" : "good"}><span>Limitados</span><strong>{summary?.limited ?? 0}</strong><small>capacidade reduzida</small></article>
          <article className={summary?.unavailable ? "danger" : "good"}><span>Indisponíveis</span><strong>{summary?.unavailable ?? 0}</strong><small>fora das sugestões automáticas</small></article>
          <article><span>Especialidades</span><strong>{summary?.specialists ?? 0}</strong><small>competências nível Especialista</small></article>
        </div>

        <div className="treasury-routing-grid">
          <section className="treasury-routing-card team-card">
            <header><div><small>EQUIPE</small><h3>Matriz de roteamento</h3></div></header>
            <div className="routing-team-list">
              {(payload?.profiles ?? []).map((profile) => <button type="button" key={profile.id} className={`${profile.availability} ${selectedId === profile.id ? "selected" : ""}`} onClick={() => setSelectedId(profile.id)}>
                <div><strong>{profile.name}</strong><small>{profile.email} · {roleLabel[profile.role] ?? profile.role}</small></div>
                <b>{availabilityLabel[profile.availability]}</b>
                <div className="routing-skill-dots">{domains.map((domain) => <span key={domain} title={`${domainLabel[domain]}: ${levelLabel[profile.skills[domain]]}`}><i>{domainLabel[domain]}</i><em>{profile.skills[domain]}</em></span>)}</div>
              </button>)}
            </div>
          </section>

          <section className="treasury-routing-card editor-card">
            <header><div><small>PERFIL SELECIONADO</small><h3>{selected?.name ?? "Selecione um responsável"}</h3></div>{selected ? <strong>{selected.email}</strong> : null}</header>
            {selected ? <div className="routing-editor">
              <div className="routing-availability-row">
                <label><span>Disponibilidade</span><select value={availability} onChange={(event) => setAvailability(event.target.value as Availability)}><option value="available">Disponível</option><option value="limited">Limitado</option><option value="unavailable">Indisponível</option></select></label>
                <label><span>Até</span><input type="date" value={availabilityUntil} disabled={availability === "available"} onChange={(event) => setAvailabilityUntil(event.target.value)} /></label>
              </div>
              <div className="routing-skills">
                {domains.map((domain) => <label key={domain}><span>{domainLabel[domain]}</span><select value={skills[domain]} onChange={(event) => setSkills((current) => ({ ...current, [domain]: Number(event.target.value) }))}><option value={0}>0 · Sem competência</option><option value={1}>1 · Apoio</option><option value={2}>2 · Habilitado</option><option value={3}>3 · Especialista</option></select><small>{levelLabel[skills[domain]]}</small></label>)}
              </div>
              <label className="routing-notes"><span>Observações de disponibilidade / escala</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Ex.: férias, meio período, atuação prioritária..." /></label>
              <div className="routing-save"><p>Nível 0 retira a pessoa das sugestões para aquela competência. Indisponível retira de todas as sugestões. Limitado continua elegível, mas com capacidade reduzida.</p><button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Salvando…" : "Salvar perfil"}</button></div>
            </div> : <div className="routing-empty">Selecione uma pessoa para editar.</div>}
          </section>
        </div>

        <footer className="treasury-routing-footer">Os perfis começam como <b>Disponível + Habilitado (nível 2)</b> em todas as competências para preservar o comportamento atual. A partir daqui, a matriz pode ser refinada sem interromper o roteamento existente.</footer>
      </section>
    </div> : null}
  </>;
}
