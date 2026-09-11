"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Skill = { id: number; skillCode: string; level: number; notes: string | null };
type Region = { id: number; label: string; matchText: string; coverageMode: string; notes: string | null };
type Certificate = { id: number; certificateType: string; documentNumber: string | null; issuedAt: string | null; expiresAt: string | null; validityStatus: string; notes: string | null };
type Absence = { id: number; absenceType: string; startsAt: string; endsAt: string; reason: string | null };
type Profile = {
  technicianId: number; availability: string; availabilityUntil: string | null; baseCity: string | null; baseState: string | null;
  serviceRadiusKm: number; regionMode: string; workDays: string; workStart: string; workEnd: string; ownVehicle: boolean;
  vehicleType: string | null; vehiclePlate: string | null; operationalNotes: string | null;
};
type Technician = {
  id: number; name: string; relationshipType: string; financialMode: string; active: boolean;
  operationalProfile: Profile; skills: Skill[]; regions: Region[]; certificates: Certificate[]; absences: Absence[];
};
type CatalogPayload = {
  technicians: Technician[];
  skillCatalog: Array<{ code: string; label: string }>;
  certificateCatalog: string[];
  summary: { total: number; unavailable: number; withoutSkills: number; expiredCertificates: number; expiringCertificates: number };
};
type ServiceCall = { id: number; number: string; companyName: string; location: string | null; serviceType: string; status: string; subject: string; scheduledAt: string | null };
type RecommendationCandidate = {
  technicianId: number; technicianName: string; relationshipType: string; financialMode: string; eligible: boolean; score: number;
  primarySkillLabel: string; skillLevel: number; availability: string; regionMatch: boolean; sameDayLoad: number; openLoad: number;
  cost: number; costConfigured: boolean; ownVehicle: boolean; vehicleType: string | null; baseCity: string | null; baseState: string | null;
  blockers: string[]; reasons: string[];
};
type RecommendationPayload = {
  call: ServiceCall;
  requirements: { requiredSkills: Array<{ code: string; label: string }>; primarySkill: string; requiredCertificates: string[]; targetDate: string; targetTime: string | null };
  recommendation: RecommendationCandidate | null;
  confidence: string;
  scoreGap: number;
  candidates: RecommendationCandidate[];
  methodology: { weights: Record<string, number>; note: string };
};

const relationshipLabels: Record<string, string> = { employee_clt: "Próprio CLT", employee_pj: "Próprio PJ", freelancer: "Freelancer / parceiro", partner_company: "Empresa parceira" };
const availabilityLabels: Record<string, string> = { available: "Disponível", limited: "Limitado", unavailable: "Indisponível" };
const levelLabels: Record<number, string> = { 1: "Apoio", 2: "Habilitado", 3: "Especialista" };
const absenceLabels: Record<string, string> = { vacation: "Férias", day_off: "Folga", training: "Treinamento", occupied: "Outro atendimento", unavailable: "Indisponível", other: "Outro" };
const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)) : "—";
const dateTimeLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

function readCallNumber(element: HTMLElement | null) {
  return element?.textContent?.match(/TDK-\d{6}/)?.[0] ?? null;
}

function parseWorkDays(raw: string) {
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed.map(Number) : [1, 2, 3, 4, 5]; } catch { return [1, 2, 3, 4, 5]; }
}

export function ServiceTechnicianOperationalDashboard() {
  const [summaryTarget, setSummaryTarget] = useState<HTMLElement | null>(null);
  const [sheetTarget, setSheetTarget] = useState<HTMLElement | null>(null);
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [catalog, setCatalog] = useState<CatalogPayload>({ technicians: [], skillCatalog: [], certificateCatalog: [], summary: { total: 0, unavailable: 0, withoutSkills: 0, expiredCertificates: 0, expiringCertificates: 0 } });
  const [calls, setCalls] = useState<ServiceCall[]>([]);
  const [selectedTechnicianId, setSelectedTechnicianId] = useState<number | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationPayload | null>(null);
  const [profileForm, setProfileForm] = useState({ availability: "available", availabilityUntil: "", baseCity: "", baseState: "SP", serviceRadiusKm: "50", regionMode: "preferred", workDays: [1,2,3,4,5] as number[], workStart: "08:00", workEnd: "18:00", ownVehicle: false, vehicleType: "", vehiclePlate: "", operationalNotes: "" });
  const [skillForm, setSkillForm] = useState({ skillCode: "field_service", level: "2", notes: "" });
  const [regionForm, setRegionForm] = useState({ label: "", matchText: "", coverageMode: "preferred", notes: "" });
  const [certificateForm, setCertificateForm] = useState({ certificateType: "NR35", documentNumber: "", issuedAt: "", expiresAt: "", notes: "" });
  const [absenceForm, setAbsenceForm] = useState({ absenceType: "unavailable", startsAt: "", endsAt: "", reason: "" });

  useEffect(() => {
    const locate = () => {
      setSummaryTarget(document.querySelector<HTMLElement>(".service-call-summary"));
      setSheetTarget(document.querySelector<HTMLElement>(".service-call-sheet .opportunity-sheet-body"));
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  async function refresh(silent = false) {
    if (!silent) setLoading(true);
    try {
      const [operationalResponse, callsResponse] = await Promise.all([
        fetch("/api/service-technician-operational", { cache: "no-store" }),
        fetch("/api/service-calls", { cache: "no-store" }),
      ]);
      if (operationalResponse.status === 403) { setAuthorized(false); return; }
      const [operationalData, callsData] = await Promise.all([operationalResponse.json(), callsResponse.json()]);
      if (!operationalResponse.ok) throw new Error(operationalData.error ?? "Não foi possível carregar perfis técnicos.");
      setCatalog(operationalData);
      setCalls(callsData.calls ?? []);
      setAuthorized(true);
      if (!selectedTechnicianId && operationalData.technicians?.length) setSelectedTechnicianId(operationalData.technicians[0].id);
      if (!silent) setMessage("");
    } catch (error) { if (!silent) setMessage(error instanceof Error ? error.message : "Falha ao carregar perfis técnicos."); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => { if (summaryTarget && authorized === null) void refresh(true); }, [summaryTarget, authorized]);
  useEffect(() => { if (open) void refresh(); }, [open]);

  const selected = catalog.technicians.find((item) => item.id === selectedTechnicianId) ?? null;
  useEffect(() => {
    if (!selected) return;
    const profile = selected.operationalProfile;
    setProfileForm({
      availability: profile.availability, availabilityUntil: profile.availabilityUntil ?? "", baseCity: profile.baseCity ?? "", baseState: profile.baseState ?? "SP",
      serviceRadiusKm: String(profile.serviceRadiusKm ?? 50), regionMode: profile.regionMode ?? "preferred", workDays: parseWorkDays(profile.workDays),
      workStart: profile.workStart ?? "08:00", workEnd: profile.workEnd ?? "18:00", ownVehicle: Boolean(profile.ownVehicle), vehicleType: profile.vehicleType ?? "",
      vehiclePlate: profile.vehiclePlate ?? "", operationalNotes: profile.operationalNotes ?? "",
    });
  }, [selectedTechnicianId, selected?.operationalProfile.updatedAt]);

  const sheetCall = useMemo(() => {
    const number = readCallNumber(sheetTarget);
    return number ? calls.find((call) => call.number === number) ?? null : null;
  }, [sheetTarget, calls]);

  async function api(url: string, method: string, body: Record<string, unknown>) {
    setLoading(true); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação.");
      await refresh(true);
      return data;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha na operação."); throw error; }
    finally { setLoading(false); }
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    try { await api("/api/service-technician-operational", "PATCH", { action: "profile", technicianId: selected.id, ...profileForm }); setMessage("Perfil operacional atualizado."); } catch {}
  }
  async function addSkill(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    try { await api("/api/service-technician-operational", "POST", { action: "skill", technicianId: selected.id, ...skillForm }); setMessage("Competência salva."); } catch {}
  }
  async function addRegion(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    try { await api("/api/service-technician-operational", "POST", { action: "region", technicianId: selected.id, ...regionForm }); setRegionForm({ label: "", matchText: "", coverageMode: "preferred", notes: "" }); setMessage("Região adicionada."); } catch {}
  }
  async function addCertificate(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    try { await api("/api/service-technician-operational", "POST", { action: "certificate", technicianId: selected.id, ...certificateForm }); setCertificateForm({ certificateType: "NR35", documentNumber: "", issuedAt: "", expiresAt: "", notes: "" }); setMessage("Documento adicionado."); } catch {}
  }
  async function addAbsence(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return;
    try { await api("/api/service-technician-operational", "POST", { action: "absence", technicianId: selected.id, ...absenceForm }); setAbsenceForm({ absenceType: "unavailable", startsAt: "", endsAt: "", reason: "" }); setMessage("Indisponibilidade registrada."); } catch {}
  }
  async function remove(action: string, id: number) {
    if (!selected) return;
    try { await api("/api/service-technician-operational", "PATCH", { action, technicianId: selected.id, id }); } catch {}
  }

  async function loadRecommendation() {
    if (!sheetCall) return;
    setRecommendOpen(true); setRecommendation(null); setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/service-technician-recommendations?serviceCallId=${sheetCall.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível recomendar técnicos.");
      setRecommendation(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao recomendar técnicos."); }
    finally { setLoading(false); }
  }

  async function assignCandidate(candidate: RecommendationCandidate) {
    if (!recommendation) return;
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/service-call-technicians", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceCallId: recommendation.call.id, technicianId: candidate.technicianId, role: "primary", notes: `Atribuído a partir da recomendação operacional · score ${candidate.score}` }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível atribuir o técnico.");
      setMessage(`${candidate.technicianName} definido como técnico principal da OS.`);
      await refresh(true);
      await loadRecommendation();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao atribuir técnico."); }
    finally { setLoading(false); }
  }

  const summaryButton = summaryTarget && authorized !== false ? createPortal(
    <button type="button" className="tech-operational-trigger" onClick={() => setOpen(true)}>PERFIS TÉCNICOS</button>, summaryTarget,
  ) : null;
  const recommendButton = sheetTarget && sheetCall && authorized !== false ? createPortal(
    <div className="tech-operational-sheet-action"><button type="button" className="tech-recommend-trigger" onClick={() => void loadRecommendation()}>SUGERIR TÉCNICO</button></div>, sheetTarget,
  ) : null;

  return <>
    {summaryButton}{recommendButton}
    {open && createPortal(<div className="tech-operational-overlay" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="tech-operational-modal">
        <header><div><small>SERVIÇOS · OPERAÇÃO</small><h2>Perfis operacionais dos técnicos</h2><p>Competência, cobertura, jornada, documentos e disponibilidade usados na distribuição de chamados.</p></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
        <div className="tech-operational-kpis"><span><b>{catalog.summary.total}</b> Técnicos ativos</span><span><b>{catalog.summary.withoutSkills}</b> Sem competências</span><span><b>{catalog.summary.unavailable}</b> Indisponíveis</span><span><b>{catalog.summary.expiringCertificates}</b> Docs a vencer</span><span className={catalog.summary.expiredCertificates ? "danger" : ""}><b>{catalog.summary.expiredCertificates}</b> Docs vencidos</span></div>
        {message && <div className="tech-operational-message">{message}</div>}
        <div className="tech-operational-body">
          <aside>{catalog.technicians.map((tech) => <button key={tech.id} type="button" className={selectedTechnicianId === tech.id ? "active" : ""} onClick={() => setSelectedTechnicianId(tech.id)}><b>{tech.name}</b><span>{relationshipLabels[tech.relationshipType] ?? tech.relationshipType}</span><small>{availabilityLabels[tech.operationalProfile.availability] ?? tech.operationalProfile.availability} · {tech.skills.length} competência(s)</small></button>)}</aside>
          <main>{selected ? <>
            <div className="tech-operational-title"><div><h3>{selected.name}</h3><p>{relationshipLabels[selected.relationshipType] ?? selected.relationshipType}</p></div></div>
            <form className="tech-operational-card" onSubmit={saveProfile}><h4>Disponibilidade, base e jornada</h4><div className="tech-operational-grid">
              <label>Status<select value={profileForm.availability} onChange={(e) => setProfileForm((p) => ({ ...p, availability: e.target.value }))}><option value="available">Disponível</option><option value="limited">Limitado</option><option value="unavailable">Indisponível</option></select></label>
              <label>Até<input type="date" value={profileForm.availabilityUntil} onChange={(e) => setProfileForm((p) => ({ ...p, availabilityUntil: e.target.value }))}/></label>
              <label>Cidade base<input value={profileForm.baseCity} onChange={(e) => setProfileForm((p) => ({ ...p, baseCity: e.target.value }))} placeholder="São Paulo"/></label>
              <label>UF<input value={profileForm.baseState} maxLength={2} onChange={(e) => setProfileForm((p) => ({ ...p, baseState: e.target.value.toUpperCase() }))}/></label>
              <label>Raio indicativo (km)<input type="number" min="0" value={profileForm.serviceRadiusKm} onChange={(e) => setProfileForm((p) => ({ ...p, serviceRadiusKm: e.target.value }))}/></label>
              <label>Regiões por padrão<select value={profileForm.regionMode} onChange={(e) => setProfileForm((p) => ({ ...p, regionMode: e.target.value }))}><option value="preferred">Preferenciais</option><option value="required">Obrigatórias</option></select></label>
              <label>Início<input type="time" value={profileForm.workStart} onChange={(e) => setProfileForm((p) => ({ ...p, workStart: e.target.value }))}/></label>
              <label>Fim<input type="time" value={profileForm.workEnd} onChange={(e) => setProfileForm((p) => ({ ...p, workEnd: e.target.value }))}/></label>
            </div><div className="tech-workdays">{[[1,"Seg"],[2,"Ter"],[3,"Qua"],[4,"Qui"],[5,"Sex"],[6,"Sáb"],[0,"Dom"]].map(([day,label]) => <label key={day}><input type="checkbox" checked={profileForm.workDays.includes(Number(day))} onChange={(e) => setProfileForm((p) => ({ ...p, workDays: e.target.checked ? [...p.workDays, Number(day)] : p.workDays.filter((item) => item !== Number(day)) }))}/>{label}</label>)}</div>
            <div className="tech-operational-grid"><label className="check"><input type="checkbox" checked={profileForm.ownVehicle} onChange={(e) => setProfileForm((p) => ({ ...p, ownVehicle: e.target.checked }))}/> Veículo próprio</label><label>Tipo do veículo<input value={profileForm.vehicleType} onChange={(e) => setProfileForm((p) => ({ ...p, vehicleType: e.target.value }))}/></label><label>Placa<input value={profileForm.vehiclePlate} onChange={(e) => setProfileForm((p) => ({ ...p, vehiclePlate: e.target.value.toUpperCase() }))}/></label></div>
            <label>Observações operacionais<textarea value={profileForm.operationalNotes} onChange={(e) => setProfileForm((p) => ({ ...p, operationalNotes: e.target.value }))}/></label><button className="primary" disabled={loading}>Salvar perfil operacional</button></form>

            <div className="tech-operational-columns"><section className="tech-operational-card"><h4>Competências</h4><form className="inline-form" onSubmit={addSkill}><select value={skillForm.skillCode} onChange={(e) => setSkillForm((p) => ({ ...p, skillCode: e.target.value }))}>{catalog.skillCatalog.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select><select value={skillForm.level} onChange={(e) => setSkillForm((p) => ({ ...p, level: e.target.value }))}><option value="1">Apoio</option><option value="2">Habilitado</option><option value="3">Especialista</option></select><button>Adicionar / atualizar</button></form><div className="tag-list">{selected.skills.map((skill) => <span key={skill.id}><b>{catalog.skillCatalog.find((item) => item.code === skill.skillCode)?.label ?? skill.skillCode}</b> · {levelLabels[skill.level]} <button type="button" onClick={() => void remove("remove_skill", skill.id)}>×</button></span>)}</div></section>
            <section className="tech-operational-card"><h4>Regiões atendidas</h4><form className="stack-form" onSubmit={addRegion}><input required placeholder="Nome: ABC Paulista" value={regionForm.label} onChange={(e) => setRegionForm((p) => ({ ...p, label: e.target.value }))}/><input required placeholder="Texto para localizar: Santo André / ABC" value={regionForm.matchText} onChange={(e) => setRegionForm((p) => ({ ...p, matchText: e.target.value }))}/><select value={regionForm.coverageMode} onChange={(e) => setRegionForm((p) => ({ ...p, coverageMode: e.target.value }))}><option value="preferred">Preferencial</option><option value="required">Obrigatória</option></select><button>Adicionar região</button></form><div className="list-rows">{selected.regions.map((region) => <div key={region.id}><b>{region.label}</b><span>{region.coverageMode === "required" ? "Obrigatória" : "Preferencial"} · corresponde a “{region.matchText}”</span><button type="button" onClick={() => void remove("remove_region", region.id)}>Remover</button></div>)}</div></section></div>

            <div className="tech-operational-columns"><section className="tech-operational-card"><h4>Documentos e certificados</h4><form className="stack-form" onSubmit={addCertificate}><select value={certificateForm.certificateType} onChange={(e) => setCertificateForm((p) => ({ ...p, certificateType: e.target.value }))}>{catalog.certificateCatalog.map((item) => <option key={item}>{item}</option>)}</select><input placeholder="Número / registro" value={certificateForm.documentNumber} onChange={(e) => setCertificateForm((p) => ({ ...p, documentNumber: e.target.value }))}/><div className="two"><label>Emissão<input type="date" value={certificateForm.issuedAt} onChange={(e) => setCertificateForm((p) => ({ ...p, issuedAt: e.target.value }))}/></label><label>Vencimento<input type="date" value={certificateForm.expiresAt} onChange={(e) => setCertificateForm((p) => ({ ...p, expiresAt: e.target.value }))}/></label></div><button>Adicionar documento</button></form><div className="list-rows">{selected.certificates.map((certificate) => <div key={certificate.id} className={certificate.validityStatus === "expired" ? "danger" : certificate.validityStatus === "expiring" ? "warning" : ""}><b>{certificate.certificateType}</b><span>{certificate.expiresAt ? `Vence ${dateLabel(certificate.expiresAt)}` : "Sem vencimento"} · {certificate.validityStatus === "expired" ? "Vencido" : certificate.validityStatus === "expiring" ? "Vence em até 30 dias" : "Válido"}</span><button type="button" onClick={() => void remove("remove_certificate", certificate.id)}>Remover</button></div>)}</div></section>
            <section className="tech-operational-card"><h4>Indisponibilidades programadas</h4><form className="stack-form" onSubmit={addAbsence}><select value={absenceForm.absenceType} onChange={(e) => setAbsenceForm((p) => ({ ...p, absenceType: e.target.value }))}>{Object.entries(absenceLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><div className="two"><label>Início<input required type="datetime-local" value={absenceForm.startsAt} onChange={(e) => setAbsenceForm((p) => ({ ...p, startsAt: e.target.value }))}/></label><label>Fim<input required type="datetime-local" value={absenceForm.endsAt} onChange={(e) => setAbsenceForm((p) => ({ ...p, endsAt: e.target.value }))}/></label></div><input placeholder="Motivo / observação" value={absenceForm.reason} onChange={(e) => setAbsenceForm((p) => ({ ...p, reason: e.target.value }))}/><button>Registrar indisponibilidade</button></form><div className="list-rows">{selected.absences.map((absence) => <div key={absence.id}><b>{absenceLabels[absence.absenceType] ?? absence.absenceType}</b><span>{dateTimeLabel(absence.startsAt)} → {dateTimeLabel(absence.endsAt)}{absence.reason ? ` · ${absence.reason}` : ""}</span><button type="button" onClick={() => void remove("cancel_absence", absence.id)}>Cancelar</button></div>)}</div></section></div>
          </> : <p>Selecione um técnico.</p>}</main>
        </div>
      </section>
    </div>, document.body)}

    {recommendOpen && createPortal(<div className="tech-operational-overlay" onMouseDown={(event) => event.target === event.currentTarget && setRecommendOpen(false)}><section className="tech-recommend-modal"><header><div><small>DISTRIBUIÇÃO INTELIGENTE</small><h2>Sugestão de técnico</h2><p>{recommendation ? `${recommendation.call.number} · ${recommendation.call.companyName} · ${recommendation.call.location ?? "sem local"}` : "Calculando aderência operacional e custo..."}</p></div><button type="button" onClick={() => setRecommendOpen(false)}>×</button></header>{message && <div className="tech-operational-message">{message}</div>}{loading && !recommendation ? <div className="tech-recommend-loading">Analisando técnicos...</div> : recommendation ? <>
      <div className="tech-requirements"><span><b>Competência principal</b>{recommendation.requirements.requiredSkills.map((item) => item.label).join(" + ")}</span><span><b>Data</b>{dateLabel(recommendation.requirements.targetDate)}{recommendation.requirements.targetTime ? ` · ${recommendation.requirements.targetTime}` : ""}</span><span><b>Documentos exigidos</b>{recommendation.requirements.requiredCertificates.join(", ") || "Nenhum requisito especial detectado"}</span><span><b>Confiança</b>{recommendation.confidence === "high" ? "Alta" : recommendation.confidence === "medium" ? "Moderada" : recommendation.confidence === "low" ? "Baixa" : "Sem candidato elegível"}</span></div>
      {recommendation.recommendation && <div className="tech-recommend-hero"><div><small>RECOMENDAÇÃO PRINCIPAL</small><h3>{recommendation.recommendation.technicianName}</h3><p>{recommendation.recommendation.primarySkillLabel} · {levelLabels[recommendation.recommendation.skillLevel]} · score {recommendation.recommendation.score}</p></div><div><b>{recommendation.recommendation.costConfigured ? money(recommendation.recommendation.cost) : "Custo não configurado"}</b><button type="button" disabled={loading} onClick={() => void assignCandidate(recommendation.recommendation!)}>Definir como principal</button></div></div>}
      <div className="tech-candidate-list">{recommendation.candidates.map((candidate, index) => <article key={candidate.technicianId} className={!candidate.eligible ? "blocked" : index === 0 ? "best" : ""}><div className="rank">#{index + 1}</div><div className="candidate-main"><h4>{candidate.technicianName}<span>{candidate.score}</span></h4><p>{candidate.primarySkillLabel}: <b>{candidate.skillLevel ? levelLabels[candidate.skillLevel] : "Não cadastrado"}</b> · {availabilityLabels[candidate.availability] ?? candidate.availability} · {candidate.sameDayLoad} atendimento(s) no dia</p><small>{candidate.baseCity || candidate.baseState ? `Base: ${[candidate.baseCity,candidate.baseState].filter(Boolean).join("/")} · ` : ""}{candidate.ownVehicle ? `Veículo próprio${candidate.vehicleType ? ` (${candidate.vehicleType})` : ""}` : "Sem veículo próprio cadastrado"}</small><div className="candidate-reasons">{candidate.blockers.map((item) => <span className="blocker" key={item}>{item}</span>)}{candidate.reasons.slice(0,5).map((item) => <span key={item}>{item}</span>)}</div></div><div className="candidate-side"><b>{candidate.costConfigured ? money(candidate.cost) : "Sem custo"}</b><span>{candidate.regionMatch ? "Região aderente" : "Região neutra / fora da preferência"}</span>{candidate.eligible ? <button type="button" disabled={loading} onClick={() => void assignCandidate(candidate)}>Atribuir</button> : <em>Não elegível</em>}</div></article>)}</div>
      <footer><b>Metodologia:</b> competência 45 · disponibilidade 15 · região 15 · custo 15 · carga 10. {recommendation.methodology.note}</footer>
    </> : null}</section></div>, document.body)}
  </>;
}
