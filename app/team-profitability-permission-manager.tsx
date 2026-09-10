"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type TeamMember = {
  id: number;
  email: string;
  name: string;
  jobTitle: string | null;
  role: string;
  permissions: string[];
  active: boolean;
};

type TeamResponse = {
  team?: TeamMember[];
  currentUserId?: number | null;
  error?: string;
};

const permission = "service_profitability";

function findTeamTarget() {
  const content = document.querySelector<HTMLElement>(".main .content");
  const title = content?.querySelector(".title-row h1");
  if (!content || !/equipe e permissões/i.test(title?.textContent ?? "")) return null;
  return content;
}

export function TeamProfitabilityPermissionManager() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/team", { cache: "no-store" });
      const data = (await response.json()) as TeamResponse;
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar a equipe.");
      setTeam(data.team ?? []);
      setCurrentUserId(data.currentUserId ?? null);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível carregar a equipe.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const syncTarget = () => setTarget(findTeamTarget());
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target) return;
    void load();
  }, [target, load]);

  const currentMember = useMemo(
    () => team.find((member) => member.id === currentUserId) ?? null,
    [team, currentUserId],
  );
  const canManage = currentMember?.role === "admin";

  const toggle = async (member: TeamMember, enabled: boolean) => {
    if (!canManage || member.role === "admin") return;
    const permissions = enabled
      ? [...new Set([...member.permissions, permission])]
      : member.permissions.filter((item) => item !== permission);
    setSavingId(member.id);
    setMessage("");
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: member.id,
          name: member.name,
          jobTitle: member.jobTitle ?? "",
          role: member.role,
          permissions,
          active: member.active,
        }),
      });
      const data = (await response.json()) as { member?: TeamMember; error?: string };
      if (!response.ok || !data.member)
        throw new Error(data.error || "Não foi possível alterar a permissão.");
      setTeam((current) =>
        current.map((item) => (item.id === data.member!.id ? data.member! : item)),
      );
      setMessage(`Permissão de ${member.name} atualizada.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Não foi possível alterar a permissão.");
    } finally {
      setSavingId(null);
    }
  };

  if (!target) return null;

  return createPortal(
    <section className="profitability-permission-card" aria-label="Permissão de rentabilidade das OS">
      <header>
        <div>
          <span>ACESSO FINANCEIRO SENSÍVEL</span>
          <h2>Rentabilidade das OS</h2>
          <p>
            Defina quem pode visualizar receitas, custos, margem em R$ e margem percentual dos chamados e ordens de serviço.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar equipe"}
        </button>
      </header>

      <div className="profitability-permission-note">
        A autorização é validada também no servidor. Ocultar a tela não é a única proteção: sem esta permissão, a API financeira recusa o acesso.
      </div>

      <div className="profitability-permission-list">
        {team.map((member) => {
          const admin = member.role === "admin";
          const enabled = admin || member.permissions.includes(permission);
          return (
            <label className={!member.active ? "inactive" : ""} key={member.id}>
              <div className="profitability-permission-person">
                <strong>{member.name}</strong>
                <span>{member.jobTitle || member.email}</span>
              </div>
              <div className="profitability-permission-control">
                {admin && <small>Administrador · acesso total</small>}
                {!member.active && <small>Usuário inativo</small>}
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={!canManage || admin || savingId === member.id}
                  onChange={(event) => void toggle(member, event.target.checked)}
                  aria-label={`Rentabilidade das OS para ${member.name}`}
                />
                <span>{savingId === member.id ? "Salvando…" : enabled ? "Permitido" : "Bloqueado"}</span>
              </div>
            </label>
          );
        })}
        {!loading && team.length === 0 && <p className="profitability-permission-empty">Nenhum usuário encontrado.</p>}
      </div>

      {!canManage && currentMember && (
        <p className="profitability-permission-warning">Somente administradores podem alterar esta permissão.</p>
      )}
      {message && <p className="profitability-permission-message">{message}</p>}
    </section>,
    target,
  );
}
