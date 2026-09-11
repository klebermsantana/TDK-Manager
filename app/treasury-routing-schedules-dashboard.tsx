"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ScheduleType = "vacation" | "day_off" | "reduced_hours" | "temporary_unavailability";
type UserRow = { id: number; name: string; email: string; role: string };
type Schedule = {
  id: number;
  userId: number;
  scheduleType: ScheduleType;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  coverageUserId: number | null;
  notes: string | null;
  active: boolean;
  userName: string;
  userEmail: string;
  coverageName: string | null;
  coverageEmail: string | null;
  status: "current" | "upcoming" | "past" | "cancelled";
  affectingNow: boolean;
  createdBy: string;
  updatedBy: string | null;
  updatedAt: string;
};
type AuditRow = { id: number; scheduleId: number | null; userId: number; action: string; performedBy: string; createdAt: string };
type Payload = {
  currentUser: { email: string };
  today: string;
  users: UserRow[];
  schedules: Schedule[];
  audit: AuditRow[];
  summary: { totalActive: number; affectingNow: number; upcoming: number; withCoverage: number; reducedHours: number };
};

const typeLabel: Record<ScheduleType, string> = {
  vacation: "Férias",
  day_off: "Folga",
  reduced_hours: "Horário reduzido",
  temporary_unavailability: "Indisponibilidade temporária",
};
const statusLabel = { current: "Período atual", upcoming: "Próxima", past: "Encerrada", cancelled: "Cancelada" } as const;
const roleLabel: Record<string, string> = { admin: "Administrador", manager: "Gestor", seller: "Comercial", finance: "Financeiro", viewer: "Consulta" };
const dateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
const dateTimeLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function TreasuryRoutingSchedulesDashboard() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [userId, setUserId] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("vacation");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("16:00");
  const [coverageUserId, setCoverageUserId] = useState("");
  const [notes, setNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);

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
      const response = await fetch("/api/treasury-routing-schedules", { cache: "no-store" });
      if (response.status === 403) {
        setAuthorized(false);
        setPayload(null);
        return;
      }
      const result = await response.json().catch(() => ({})) as Payload & { error?: string };
      if (!response.ok) {
        if (!silent) setMessage(result.error ?? "Não foi possível carregar as escalas da Tesouraria.");
        return;
      }
      setPayload(result);
      setAuthorized(true);
      setMessage("");
      setUserId((current) => current || String(result.users[0]?.id ?? ""));
      setStartDate((current) => current || result.today);
      setEndDate((current) => current || result.today);
    } catch {
      if (!silent) setMessage("Não foi possível carregar as escalas da Tesouraria.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { if (target && authorized === null) void refresh(true); }, [target, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);
  useEffect(() => {
    if (!target || authorized === false) return;
    const timer = window.setInterval(() => void refresh(true), 60000);
    return () => window.clearInterval(timer);
  }, [target, authorized]);

  const orderedSchedules = useMemo(() => [...(payload?.schedules ?? [])].sort((a, b) => {
    const rank = (row: Schedule) => row.affectingNow ? 0 : row.status === "upcoming" ? 1 : row.status === "current" ? 2 : row.status === "past" ? 3 : 4;
    return rank(a) - rank(b) || a.startDate.localeCompare(b.startDate) || a.userName.localeCompare(b.userName);
  }), [payload]);

  function resetForm() {
    setEditingId(null);
    setUserId(String(payload?.users[0]?.id ?? ""));
    setScheduleType("vacation");
    setStartDate(payload?.today ?? "");
    setEndDate(payload?.today ?? "");
    setStartTime("09:00");
    setEndTime("16:00");
    setCoverageUserId("");
    setNotes("");
  }

  function edit(row: Schedule) {
    setEditingId(row.id);
    setUserId(String(row.userId));
    setScheduleType(row.scheduleType);
    setStartDate(row.startDate);
    setEndDate(row.endDate);
    setStartTime(row.startTime ?? "09:00");
    setEndTime(row.endTime ?? "16:00");
    setCoverageUserId(row.coverageUserId ? String(row.coverageUserId) : "");
    setNotes(row.notes ?? "");
  }

  async function save() {
    if (!userId || !startDate || !endDate) return;
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-routing-schedules", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingId ? { id: editingId } : {}),
          userId: Number(userId),
          scheduleType,
          startDate,
          endDate,
          startTime: scheduleType === "reduced_hours" ? startTime : null,
          endTime: scheduleType === "reduced_hours" ? endTime : null,
          coverageUserId: coverageUserId ? Number(coverageUserId) : null,
          notes,
          active: true,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível salvar a escala.");
        return;
      }
      setMessage(editingId ? "Escala atualizada." : "Escala programada criada.");
      resetForm();
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  async function cancel(row: Schedule) {
    setSaving(true);
    try {
      const response = await fetch("/api/treasury-routing-schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          userId: row.userId,
          scheduleType: row.scheduleType,
          startDate: row.startDate,
          endDate: row.endDate,
          startTime: row.startTime,
          endTime: row.endTime,
          coverageUserId: row.coverageUserId,
          notes: row.notes,
          active: false,
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Não foi possível cancelar a escala.");
        return;
      }
      setMessage("Escala cancelada e preservada no histórico.");
      if (editingId === row.id) resetForm();
      await refresh(true);
    } finally {
      setSaving(false);
    }
  }

  if (!target || authorized === false) return null;
  const summary = payload?.summary;
  const tone = summary?.affectingNow ? "warning" : "clear";
  const selectedUserId = Number(userId || 0);

  return <>
    {createPortal(
      <button type="button" className={`treasury-schedules-trigger ${tone}`} onClick={() => setOpen(true)} disabled={authorized === null}>
        <span>ESCALAS</span>
        <strong>{summary?.affectingNow ?? "—"}</strong>
        <small>{summary?.affectingNow ? "afetando disponibilidade agora" : summary?.upcoming ? `${summary.upcoming} próxima(s)` : "sem ausência ativa"}</small>
      </button>,
      target,
    )}

    {open ? <div className="treasury-schedules-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="treasury-schedules-dashboard" role="dialog" aria-modal="true" aria-label="Escalas e ausências programadas da Tesouraria">
        <header className="treasury-schedules-header">
          <div>
            <small>TESOURARIA · ESCALAS</small>
            <h2>Escalas e ausências programadas</h2>
            <p>Programe férias, folgas, indisponibilidades e horários reduzidos. A disponibilidade efetiva é aplicada automaticamente ao roteamento usando o horário de São Paulo.</p>
          </div>
          <div className="treasury-schedules-actions"><button type="button" onClick={() => void refresh()} disabled={loading}>{loading ? "Atualizando…" : "Atualizar"}</button><button type="button" className="close" onClick={() => setOpen(false)}>Fechar</button></div>
        </header>

        {message ? <div className="treasury-schedules-message">{message}</div> : null}

        <div className="treasury-schedules-kpis">
          <article><span>Programações ativas</span><strong>{summary?.totalActive ?? 0}</strong><small>atuais + futuras</small></article>
          <article className={summary?.affectingNow ? "warning" : "good"}><span>Afetando agora</span><strong>{summary?.affectingNow ?? 0}</strong><small>alterando disponibilidade efetiva</small></article>
          <article><span>Próximas</span><strong>{summary?.upcoming ?? 0}</strong><small>períodos ainda não iniciados</small></article>
          <article><span>Com cobertura</span><strong>{summary?.withCoverage ?? 0}</strong><small>substituto temporário definido</small></article>
          <article><span>Horário reduzido</span><strong>{summary?.reducedHours ?? 0}</strong><small>capacidade parcial programada</small></article>
        </div>

        <div className="treasury-schedules-grid">
          <section className="treasury-schedules-card editor-card">
            <header><div><small>{editingId ? "EDITANDO" : "NOVA PROGRAMAÇÃO"}</small><h3>{editingId ? `Escala #${editingId}` : "Cadastrar escala"}</h3></div>{editingId ? <button type="button" onClick={resetForm}>Nova</button> : null}</header>
            <div className="schedules-form">
              <label><span>Responsável</span><select value={userId} onChange={(event) => { setUserId(event.target.value); if (coverageUserId === event.target.value) setCoverageUserId(""); }}>{(payload?.users ?? []).map((user) => <option key={user.id} value={user.id}>{user.name} · {roleLabel[user.role] ?? user.role}</option>)}</select></label>
              <label><span>Tipo</span><select value={scheduleType} onChange={(event) => setScheduleType(event.target.value as ScheduleType)}><option value="vacation">Férias</option><option value="day_off">Folga</option><option value="reduced_hours">Horário reduzido</option><option value="temporary_unavailability">Indisponibilidade temporária</option></select></label>
              <div className="schedules-two"><label><span>Início</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label><span>Fim</span><input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
              {scheduleType === "reduced_hours" ? <div className="schedules-two"><label><span>Disponível a partir de</span><input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label><span>Disponível até</span><input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div> : null}
              <label><span>Cobertura temporária</span><select value={coverageUserId} onChange={(event) => setCoverageUserId(event.target.value)}><option value="">Sem cobertura definida</option>{(payload?.users ?? []).filter((user) => user.id !== selectedUserId).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select><small>A cobertura só será usada automaticamente se estiver disponível e habilitada na competência exigida.</small></label>
              <label><span>Observações</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Ex.: férias programadas, expediente das 09h às 16h, cobertura combinada..." /></label>
              <div className="schedules-rule-note"><strong>Como funciona</strong><p>Férias, folga e indisponibilidade retiram a pessoa do roteamento durante o período. Horário reduzido deixa a pessoa como <b>Limitada</b> dentro da janela informada e <b>Indisponível</b> fora dela.</p></div>
              <button type="button" className="save" onClick={() => void save()} disabled={saving || !userId || !startDate || !endDate}>{saving ? "Salvando…" : editingId ? "Salvar alterações" : "Programar escala"}</button>
            </div>
          </section>

          <section className="treasury-schedules-card list-card">
            <header><div><small>CALENDÁRIO OPERACIONAL</small><h3>Programações</h3></div><strong>{orderedSchedules.length} registro(s)</strong></header>
            <div className="schedules-list">
              {orderedSchedules.length ? orderedSchedules.map((row) => <article key={row.id} className={`${row.status} ${row.affectingNow ? "affecting" : ""}`}>
                <div className="schedules-list-main">
                  <div className="schedules-badges"><span>{typeLabel[row.scheduleType]}</span><b>{row.affectingNow ? "Afetando agora" : statusLabel[row.status]}</b></div>
                  <strong>{row.userName}</strong><small>{row.userEmail}</small>
                  <p>{dateLabel(row.startDate)} → {dateLabel(row.endDate)}{row.scheduleType === "reduced_hours" ? ` · ${row.startTime}–${row.endTime}` : ""}</p>
                  {row.coverageName ? <p className="coverage">Cobertura: <b>{row.coverageName}</b>{row.coverageEmail ? ` · ${row.coverageEmail}` : ""}</p> : null}
                  {row.notes ? <p>{row.notes}</p> : null}
                </div>
                <div className="schedules-list-actions"><button type="button" onClick={() => edit(row)} disabled={!row.active}>Editar</button>{row.active && row.status !== "past" ? <button type="button" className="cancel" onClick={() => void cancel(row)} disabled={saving}>Cancelar</button> : null}</div>
              </article>) : <div className="schedules-empty"><strong>Nenhuma escala programada.</strong><p>Cadastre a primeira programação ao lado.</p></div>}
            </div>
          </section>
        </div>

        <section className="treasury-schedules-card audit-card">
          <header><div><small>AUDITORIA</small><h3>Histórico de alterações</h3></div><button type="button" onClick={() => setShowHistory((value) => !value)}>{showHistory ? "Ocultar" : "Mostrar"}</button></header>
          {showHistory ? <div className="schedules-audit">{(payload?.audit ?? []).slice(0, 40).map((row) => <article key={row.id}><strong>{row.action === "schedule_created" ? "Escala criada" : row.action === "schedule_cancelled" ? "Escala cancelada" : "Escala atualizada"}</strong><span>#{row.scheduleId ?? "—"}</span><span>{row.performedBy}</span><time>{dateTimeLabel(row.createdAt)}</time></article>)}</div> : null}
        </section>

        <footer className="treasury-schedules-footer">A escala altera somente a <b>disponibilidade efetiva</b>; competências e disponibilidade-base permanecem intactas. Programações encerradas deixam de afetar o roteamento automaticamente e continuam disponíveis para auditoria.</footer>
      </section>
    </div> : null}
  </>;
}
