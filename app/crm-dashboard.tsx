"use client";

import { useMemo, useState } from "react";
import { Bell, BriefcaseBusiness, Building2, CalendarClock, ChevronDown, CircleDollarSign, Contact, LayoutDashboard, Menu, MoreHorizontal, Plus, Search, Settings, Target, TrendingUp, Users, X, Zap, CheckCircle2, Clock3, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

type Opportunity = { id:number; title:string; company:string; value:number; owner:string; initials:string; due:string; stage:string; temperature:"hot"|"warm"|"cold" };
const stages = [
  { id:"novo", label:"Novo lead", color:"#38bdf8" }, { id:"qualificacao", label:"Qualificação", color:"#818cf8" },
  { id:"proposta", label:"Proposta enviada", color:"#f59e0b" }, { id:"negociacao", label:"Negociação", color:"#a78bfa" },
  { id:"ganho", label:"Venda ganha", color:"#22c55e" },
];
const seed:Opportunity[] = [
  {id:1,title:"Renovação da rede Wi‑Fi",company:"Hotel Paulista",value:78500,owner:"Marcos",initials:"MP",due:"10 set",stage:"novo",temperature:"hot"},
  {id:2,title:"Projeto CFTV corporativo",company:"Grupo Horizonte",value:46200,owner:"Ana",initials:"AC",due:"12 set",stage:"novo",temperature:"warm"},
  {id:3,title:"Cabeamento estruturado",company:"Clínica Vita",value:32800,owner:"Marcos",initials:"MP",due:"08 set",stage:"qualificacao",temperature:"hot"},
  {id:4,title:"Implantação de fibra óptica",company:"Logística Prime",value:124900,owner:"Kleber",initials:"KS",due:"15 set",stage:"qualificacao",temperature:"warm"},
  {id:5,title:"Modernização do Data Center",company:"Banco Regional",value:218000,owner:"Kleber",initials:"KS",due:"18 set",stage:"proposta",temperature:"hot"},
  {id:6,title:"Contrato Field Service",company:"Rede Mais",value:96500,owner:"Ana",initials:"AC",due:"20 set",stage:"proposta",temperature:"warm"},
  {id:7,title:"Cibersegurança gerenciada",company:"Indústria Delta",value:156000,owner:"Marcos",initials:"MP",due:"14 set",stage:"negociacao",temperature:"hot"},
  {id:8,title:"Monitoramento IoT",company:"Facilities One",value:67200,owner:"Ana",initials:"AC",due:"05 set",stage:"ganho",temperature:"warm"},
];
const money=(v:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(v);

export default function CrmDashboard({user}:{user:{name:string;email:string}}){
  const [view,setView]=useState<"dashboard"|"pipeline">("pipeline"); const [items,setItems]=useState(seed); const [query,setQuery]=useState("");
  const [menuOpen,setMenuOpen]=useState(false); const [dialogOpen,setDialogOpen]=useState(false); const [dragId,setDragId]=useState<number|null>(null);
  const [form,setForm]=useState({title:"",company:"",value:""});
  const filtered=useMemo(()=>items.filter(i=>`${i.title} ${i.company}`.toLowerCase().includes(query.toLowerCase())),[items,query]);
  const pipeline=items.filter(i=>i.stage!=="ganho").reduce((a,b)=>a+b.value,0), won=items.filter(i=>i.stage==="ganho").reduce((a,b)=>a+b.value,0);
  function move(stage:string){if(dragId)setItems(v=>v.map(i=>i.id===dragId?{...i,stage}:i));setDragId(null)}
  function addOpportunity(e:React.FormEvent){e.preventDefault();if(!form.title.trim()||!form.company.trim())return;setItems(v=>[{id:Date.now(),title:form.title,company:form.company,value:Number(form.value)||0,owner:"Kleber",initials:"KS",due:"Hoje",stage:"novo",temperature:"warm"},...v]);setForm({title:"",company:"",value:""});setDialogOpen(false)}
  return <div className="app-shell">
    <aside className={menuOpen?"sidebar open":"sidebar"}>
      <div className="brand"><img className="brand-logo" src="/tdk-logo-oficial.png" alt="TDK — Soluções que Transformam"/><div className="product-name"><strong>Manager</strong><span>Gestão inteligente</span></div><button className="close-mobile" onClick={()=>setMenuOpen(false)} aria-label="Fechar menu"><X/></button></div>
      <nav><p>VISÃO GERAL</p><button className={view==="dashboard"?"active":""} onClick={()=>{setView("dashboard");setMenuOpen(false)}}><LayoutDashboard/> Dashboard</button><p>COMERCIAL</p><button className={view==="pipeline"?"active":""} onClick={()=>{setView("pipeline");setMenuOpen(false)}}><BriefcaseBusiness/> Oportunidades <span className="nav-count">{items.length}</span></button><button><Building2/> Empresas</button><button><Contact/> Contatos</button><button><CalendarClock/> Atividades</button><button><Target/> Metas</button><p>GESTÃO</p><button><CircleDollarSign/> Propostas</button><button><Users/> Equipe e permissões</button><button><TrendingUp/> Relatórios</button></nav>
      <div className="sidebar-footer"><button><Settings/> Configurações</button><div className="user"><span>KS</span><div><strong>{user.name}</strong><small>Administrador</small></div><ChevronDown/></div></div>
    </aside>
    <main className="main"><header><button className="menu-mobile" onClick={()=>setMenuOpen(true)} aria-label="Abrir menu"><Menu/></button><div className="global-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar clientes e oportunidades..."/></div><button className="icon-button" aria-label="Notificações"><Bell/><i/></button><div className="header-date"><span>Visão comercial</span><strong>Setembro de 2026</strong></div></header>
      <div className="content"><section className="title-row"><div><span className="eyebrow">CRM • VISÃO COMERCIAL</span><h1>{view==="pipeline"?"Funil de vendas":"Dashboard comercial"}</h1><p>{view==="pipeline"?"Acompanhe cada oportunidade até o fechamento.":"Resultados e ritmo da equipe em um só lugar."}</p></div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogTrigger render={<Button className="new-button"><Plus/> Nova oportunidade</Button>}/><DialogContent className="dialog"><DialogHeader><DialogTitle>Nova oportunidade</DialogTitle></DialogHeader><form onSubmit={addOpportunity} className="form"><div><Label>Oportunidade</Label><Input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex.: Projeto de rede Wi‑Fi"/></div><div><Label>Empresa</Label><Input value={form.company} onChange={e=>setForm({...form,company:e.target.value})} placeholder="Nome do cliente"/></div><div><Label>Valor estimado</Label><Input type="number" value={form.value} onChange={e=>setForm({...form,value:e.target.value})} placeholder="0,00"/></div><Button type="submit">Cadastrar oportunidade</Button></form></DialogContent></Dialog>
      </section>
      <section className="metrics"><Metric icon={<BriefcaseBusiness/>} tone="blue" label="Pipeline aberto" value={money(pipeline)} note="12,4% no mês" positive/><Metric icon={<CheckCircle2/>} tone="green" label="Vendas no mês" value={money(won)} note="Meta: R$ 180 mil"/><Metric icon={<Target/>} tone="amber" label="Conversão" value="28,6%" note="3,2 pontos" positive/><Metric icon={<Clock3/>} tone="purple" label="Ciclo médio" value="24 dias" note="– 4 dias no período"/></section>
      {view==="dashboard"?<Dashboard items={items}/>:<><section className="toolbar"><div className="view-tabs"><button className="selected">Kanban</button><button>Lista</button></div><div className="filters"><button>Todos os vendedores <ChevronDown/></button><button>Este mês <ChevronDown/></button><button aria-label="Mais filtros"><MoreHorizontal/></button></div></section><section className="kanban">{stages.map(stage=>{const cards=filtered.filter(i=>i.stage===stage.id);return <div className="column" key={stage.id} onDragOver={e=>e.preventDefault()} onDrop={()=>move(stage.id)}><div className="column-head"><div><i style={{background:stage.color}}/><strong>{stage.label}</strong><span>{cards.length}</span></div><button aria-label="Adicionar"><Plus/></button></div><p className="column-total">{money(cards.reduce((a,b)=>a+b.value,0))}</p><div className="cards">{cards.map(card=><article draggable onDragStart={()=>setDragId(card.id)} key={card.id} className="deal-card"><div className="card-top"><span className={`temperature ${card.temperature}`}><Zap/>{card.temperature==="hot"?"Alta":card.temperature==="warm"?"Média":"Baixa"}</span><button aria-label="Opções"><MoreHorizontal/></button></div><h3>{card.title}</h3><p><Building2/>{card.company}</p><strong className="deal-value">{money(card.value)}</strong><div className="card-foot"><span className="avatar">{card.initials}</span><span className="due"><CalendarClock/>{card.due}</span></div></article>)}</div><button className="add-card" onClick={()=>setDialogOpen(true)}><Plus/> Adicionar oportunidade</button></div>})}</section></>}
      </div></main>
  </div>
}
function Metric({icon,tone,label,value,note,positive=false}:{icon:React.ReactNode;tone:string;label:string;value:string;note:string;positive?:boolean}){return <article><div className={`metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small className={positive?"positive":""}>{positive&&<ArrowUpRight/>}{note}</small></div></article>}
function Dashboard({items}:{items:Opportunity[]}){const owners=["Kleber","Ana","Marcos"].map(name=>({name,value:items.filter(i=>i.owner===name).reduce((a,b)=>a+b.value,0)}));return <div className="dashboard-grid"><article className="panel chart-panel"><div className="panel-head"><div><span>PREVISÃO DE RECEITA</span><h2>Desempenho comercial</h2></div><button>Últimos 6 meses <ChevronDown/></button></div><div className="bars">{[42,55,48,68,61,82].map((h,i)=><div key={i}><span style={{height:`${h}%`}}/><small>{["Abr","Mai","Jun","Jul","Ago","Set"][i]}</small></div>)}</div></article><article className="panel team-panel"><div className="panel-head"><div><span>EQUIPE</span><h2>Pipeline por vendedor</h2></div></div>{owners.map((o,i)=><div className="seller" key={o.name}><span className={`seller-avatar a${i}`}>{o.name.slice(0,2).toUpperCase()}</span><div><strong>{o.name}</strong><Progress value={Math.min(o.value/3000,100)}/></div><b>{money(o.value)}</b></div>)}</article><article className="panel wide"><div className="panel-head"><div><span>ATENÇÃO</span><h2>Próximas ações</h2></div></div><div className="actions"><div><Clock3/><span><strong>3 oportunidades sem atividade</strong><small>Há mais de 7 dias sem contato</small></span><button>Ver agora</button></div><div><CalendarClock/><span><strong>5 retornos programados</strong><small>Para hoje e amanhã</small></span><button>Ver agenda</button></div></div></article></div>}
