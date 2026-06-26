import { useState, useEffect, useRef } from 'react';
import { SignInButton } from '@clerk/react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

/* ============================================================
   DATA
   ============================================================ */
const VERIS = {
  agents: [
    { id: 'plan',   name: '计划智能体', en: 'Planner' },
    { id: 'web',    name: '网络调研',   en: 'Web Research' },
    { id: 'fin',    name: '金融数据',   en: 'Financial Data' },
    { id: 'critic', name: '质量自检',   en: 'Quality Critic' },
    { id: 'macro',  name: '宏观分析',   en: 'Macro Analyst' },
    { id: 'equity', name: '个股基本面', en: 'Equity Analyst' },
    { id: 'risk',   name: '风险评估',   en: 'Risk Analyst' },
    { id: 'report', name: '报告生成',   en: 'Report Writer' },
  ],
  examples: [
    { tag: 'MACRO',  text: '美联储降息对科技股的影响' },
    { tag: 'NVDA',   text: 'NVDA 2025 年前景展望' },
    { tag: 'RISK',   text: '中概股在当前宏观环境下的风险敞口' },
    { tag: 'CRYPTO', text: '比特币现货 ETF 对市场结构的改变' },
  ],
  features: [
    { id: 'hitl',  ic: 'shield', num: '01', title: '人机协作 · HITL',
      body: 'AI 先产出结构化研究计划，你修改、补充或批准后才执行——研究方向始终可控。',
      tags: ['审批计划', '可编辑', '方向可控'] },
    { id: 'cite',  ic: 'link',   num: '02', title: '引用溯源',
      body: '每一个观点都附带可点击的来源链接，溯源到原始网页，可逐条独立验证。',
      tags: ['来源链接', '可追溯', '可验证'] },
    { id: 'live',  ic: 'pulse',  num: '03', title: '实时可视化',
      body: 'SSE 流式传输实时呈现研究全程——看到 AI 正在搜索什么、分析什么、进展到哪一步。',
      tags: ['SSE 流式', '过程透明', '中间结果'] },
    { id: 'multi', ic: 'nodes',  num: '04', title: '多智能体协作',
      body: '8 个专业化 Agent 各司其职，组成层次化流水线协同，而非单模型一次性作答。' },
    { id: 'route', ic: 'route',  num: '05', title: '智能路由分析',
      body: '自动判断主题属于宏观、个股还是混合类型，动态组合对应的分析模块。' },
    { id: 'tools', ic: 'tools',  num: '06', title: '金融专业工具',
      body: '内置行情查询、美联储利率概率、FOMC 声明对比、宏观经济数据等专业数据源。' },
  ],
  flow: [
    { k: 'STEP 01', t: '输入主题', d: '输入研究问题，或一键选择示例主题。', ic: 'search' },
    { k: 'STEP 02', t: '审批计划', d: 'AI 生成 5 点研究计划，你可修改或批准。', ic: 'shield' },
    { k: 'STEP 03', t: '实时研究', d: '自动搜索网络、抓取金融数据、反复自检。', ic: 'pulse' },
    { k: 'STEP 04', t: '专项分析', d: '按主题路由到宏观 / 个股 / 风险分析模块。', ic: 'route' },
    { k: 'STEP 05', t: '输出报告', d: '生成带完整引用来源的专业报告，可导出。', ic: 'doc' },
  ],
  demoFeats: [
    { ic: 'search', t: '网络调研', d: '检索权威财经媒体与一手资料' },
    { ic: 'data',   t: '金融数据', d: 'yfinance 行情 · FRED 宏观 · FedWatch 概率' },
    { ic: 'critic', t: '质量自检', d: '反复评估证据充分度与逻辑一致性' },
    { ic: 'link',   t: '引用装订', d: '为每个论点装订可点击的来源' },
  ],
  stats: [
    { v: 8,   u: '',   l: '专业化 AI Agent' },
    { v: 100, u: '%',  l: '观点附引用来源' },
    { v: 5,   u: '步', l: '可控研究流程' },
    { v: 40,  u: '+',  l: '内置金融数据维度' },
  ],
  tech: ['Google ADK', 'Gemini 2.5 Pro', 'Multi-Agent', 'React', 'TypeScript',
         'FastAPI', 'SSE Streaming', 'Docker', 'yfinance', 'Tailwind CSS', 'FRED', 'CME FedWatch'],
  report: {
    title: '美联储降息对科技股的影响',
    meta: 'GENERATED · 2,840 字 · 14 条引用来源 · 宏观政策分析',
  },
} as const;

/* ============================================================
   ICONS
   ============================================================ */
type IconName = 'search'|'shield'|'link'|'pulse'|'nodes'|'route'|'tools'|'data'|'doc'|'arrow'|'critic'|'macro'|'report';

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  search:  <><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>,
  shield:  <><path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
  link:    <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></>,
  pulse:   <><path d="M2 12h4l3 8 4-16 3 8h6"/></>,
  nodes:   <><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M7.6 7.6 11 15m6-6.4L13 15"/></>,
  route:   <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 6h6a4 4 0 0 1 4 4v6"/><path d="m13 9-3-3 3-3"/></>,
  tools:   <><path d="M14.5 5.5a3.5 3.5 0 0 0-5 4.7L4 15.7 8.3 20l5.5-5.5a3.5 3.5 0 0 0 4.7-5l-2.4 2.4-2.1-2.1 2.5-2.3Z"/></>,
  data:    <><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/></>,
  doc:     <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></>,
  arrow:   <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  critic:  <><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 2"/></>,
  macro:   <><path d="M3 18 9 9l4 4 8-10"/><path d="M16 3h5v5"/></>,
  report:  <><path d="M5 4h14v16l-7-3-7 3Z"/><path d="M9 9h6M9 13h4"/></>,
};

function Icon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  const paths = ICON_PATHS[name as IconName];
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths ?? ICON_PATHS.doc}
    </svg>
  );
}

/* ============================================================
   LOGO MARK
   ============================================================ */
function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 40 40">
      <circle className="l-ring" cx="20" cy="20" r="16"/>
      <line className="l-edge" x1="20" y1="20" x2="20" y2="6"/>
      <line className="l-edge" x1="20" y1="20" x2="32" y2="27"/>
      <line className="l-edge" x1="20" y1="20" x2="8" y2="27"/>
      <circle className="l-node" cx="20" cy="6" r="2.6"/>
      <circle className="l-node" cx="32" cy="27" r="2.6"/>
      <circle className="l-node" cx="8" cy="27" r="2.6"/>
      <circle className="l-core" cx="20" cy="20" r="3.6"/>
    </svg>
  );
}

/* ============================================================
   EFFECTS: Particle Canvas — subtle
   ============================================================ */
interface Particle {
  x: number; y: number; vx: number; vy: number; r: number; o: number;
}

function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -999, y: -999 });
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.scale(dpr, dpr);
    };
    resize();

    const COUNT = 60;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;
    const CONNECT_DIST = 130;
    const MOUSE_DIST = 180;

    if (particlesRef.current.length === 0) {
      for (let i = 0; i < COUNT; i++) {
        particlesRef.current.push({
          x: Math.random() * W(),
          y: Math.random() * H(),
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.2 + 0.4,
          o: Math.random() * 0.3 + 0.06,
        });
      }
    }

    const onMouse = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMouse);

    const draw = () => {
      const w = W(), h = H();
      ctx.clearRect(0, 0, w, h);
      const ps = particlesRef.current;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      for (const p of ps) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        const dmx = p.x - mx, dmy = p.y - my;
        const dm = Math.sqrt(dmx * dmx + dmy * dmy);
        if (dm < MOUSE_DIST && dm > 0) {
          const force = (MOUSE_DIST - dm) / MOUSE_DIST * 0.014;
          p.vx += (dmx / dm) * force;
          p.vy += (dmy / dm) * force;
        }

        p.vx *= 0.999;
        p.vy *= 0.999;
      }

      // connections — thinner, subtler
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].x - ps[j].x, dy = ps[i].y - ps[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < CONNECT_DIST) {
            const alpha = (1 - d / CONNECT_DIST) * 0.10;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
            ctx.lineWidth = 0.4;
            ctx.moveTo(ps[i].x, ps[i].y);
            ctx.lineTo(ps[j].x, ps[j].y);
            ctx.stroke();
          }
        }
      }

      for (const p of ps) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.o})`;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particle-canvas" />;
}

/* ============================================================
   HOOKS
   ============================================================ */
function useTyping(text: string, speed = 55) {
  const [out, setOut] = useState('');
  useEffect(() => {
    setOut(''); let i = 0;
    const id = setInterval(() => {
      i++; setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return out;
}

function useCountUp(target: number, dur = 2000): [number, React.RefObject<HTMLDivElement | null>] {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((ents) => {
      if (ents[0].isIntersecting) {
        io.disconnect();
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min((t - t0) / dur, 1);
          const e = 1 - Math.pow(1 - p, 4);
          setVal(Math.round(target * e));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [target, dur]);
  return [val, ref];
}

/* ============================================================
   AGENT GRAPH
   ============================================================ */
const AG_CX = 280, AG_CY = 260, AG_RX = 200, AG_RY = 204, AG_R = 30;
const AG_ORDER = ['plan','web','fin','critic','macro','equity','risk','report'] as const;
const AG_ICON: Record<string, string> = {
  plan:'doc', web:'search', fin:'data', critic:'critic',
  macro:'macro', equity:'pulse', risk:'shield', report:'report',
};
const AG_STATUS: Record<string, string> = {
  plan:'制定研究计划', web:'检索权威来源', fin:'抓取行情数据', critic:'评估证据质量',
  macro:'分析宏观政策', equity:'拆解个股基本面', risk:'量化风险敞口', report:'撰写带引用报告',
};

function agPos(i: number) {
  const a = (-90 + i * 45) * Math.PI / 180;
  return { x: AG_CX + AG_RX * Math.cos(a), y: AG_CY + AG_RY * Math.sin(a), a };
}

function AGNodeIcon({ name, x, y }: { name: string; x: number; y: number }) {
  return (
    <g className="l-ag-icon" transform={`translate(${x - 9}, ${y - 9}) scale(0.75)`}
       strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name as IconName]}
    </g>
  );
}

function AgentGraph() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % AG_ORDER.length), 1800);
    return () => clearInterval(id);
  }, []);
  const actId = AG_ORDER[active];
  const actMeta = VERIS.agents.find(a => a.id === actId)!;
  const ap = agPos(active);

  return (
    <div className="l-agent-graph">
      <svg viewBox="0 0 560 540">
        <defs>
          <radialGradient id="centerGlow">
            <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>

        <circle cx={AG_CX} cy={AG_CY} r="130" fill="url(#centerGlow)" />

        {AG_ORDER.map((id, i) => {
          const p = agPos(i);
          return <line key={'e'+id} className="l-ag-edge" x1={AG_CX} y1={AG_CY} x2={p.x} y2={p.y} />;
        })}
        {AG_ORDER.map((id, i) => {
          const p = agPos(i), q = agPos((i+1) % AG_ORDER.length);
          return <line key={'r'+id} className="l-ag-edge" x1={p.x} y1={p.y} x2={q.x} y2={q.y} style={{ opacity: 0.25 }} />;
        })}
        <line className="l-ag-flow" x1={AG_CX} y1={AG_CY} x2={ap.x} y2={ap.y} />

        <circle cx={AG_CX} cy={AG_CY} r="34" fill="var(--bg)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        <circle className="l-ag-center-core" cx={AG_CX} cy={AG_CY} r="5">
          <animate attributeName="r" values="5;7;5" dur="2.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;1" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <text x={AG_CX} y={AG_CY+56} textAnchor="middle" className="l-ag-label" fill="var(--text-quaternary)">
          Orchestrator
        </text>

        {AG_ORDER.map((id, i) => {
          const p = agPos(i);
          const lx = AG_CX + (AG_RX+46) * Math.cos(p.a);
          const ly = AG_CY + (AG_RY+46) * Math.sin(p.a);
          const meta = VERIS.agents.find(a => a.id === id)!;
          const anchor = Math.abs(Math.cos(p.a)) < 0.3 ? 'middle' : (Math.cos(p.a) > 0 ? 'start' : 'end');
          return (
            <g key={id} className={`l-ag-node-g${i === active ? ' active' : ''}`}>
              <circle className="l-ag-node-ring" cx={p.x} cy={p.y} r={AG_R} />
              <circle className="l-ag-node" cx={p.x} cy={p.y} r={AG_R} />
              <AGNodeIcon name={AG_ICON[id]} x={p.x} y={p.y} />
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" className="l-ag-label">
                {meta.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="l-ag-status">
        <span className="l-faint">运行中</span>&nbsp;<b>{actMeta.en}</b>&nbsp;· {AG_STATUS[actId]}
      </div>
    </div>
  );
}

/* ============================================================
   SUB-COMPONENTS
   ============================================================ */
function SearchBox({ placeholder, big, onGo }: { placeholder?: string; big?: boolean; onGo?: (q: string) => void }) {
  const [val, setVal] = useState('');
  const handleGo = () => { if (onGo) onGo(val); };
  return (
    <div className="l-searchbox" style={big ? { padding: '10px 10px 10px 22px' } : undefined}>
      <Icon name="search" className="l-sb-icon" />
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleGo()}
        placeholder={placeholder ?? '输入一个研究主题，例如：美联储降息对科技股的影响'}
      />
      <button className="l-sb-go" aria-label="开始研究" onClick={handleGo}><Icon name="arrow" /></button>
    </div>
  );
}

function ExampleChips({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="l-chips">
      {VERIS.examples.map((e, i) => (
        <button className="l-chip" key={i} onClick={() => onSelect(e.text)}>
          <span className="l-chip-tag">{e.tag}</span>{e.text}
        </button>
      ))}
    </div>
  );
}

/* ============================================================
   NAV
   ============================================================ */
function LNav() {
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', onScroll); onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`l-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="l-container l-nav-inner">
        <a className="l-brand">
          <LogoMark />
          <span className="l-brand-name">Veris<small>维睿</small></span>
        </a>
        <div className="l-nav-links">
          <a href="#features">能力</a>
          <a href="#flow">流程</a>
          <a href="#demo">演示</a>
          <a href="#tech">技术</a>
        </div>
        <div className="l-nav-cta">
          <SignInButton mode="modal">
            <button className="l-btn l-btn-ghost" style={{ padding: '9px 18px', fontSize: 13 }}>
              登录
            </button>
          </SignInButton>
          <button className="l-btn l-btn-primary" style={{ padding: '9px 20px', fontSize: 13 }}
                  onClick={() => navigate('/app')}>免费开始</button>
        </div>
      </div>
    </nav>
  );
}

/* ============================================================
   HERO
   ============================================================ */
function HeroA({ onNavigate }: { onNavigate: (q?: string) => void }) {
  const subjects = ['投资主题', '宏观政策', '个股前景', '风险敞口'];
  const [si, setSi] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSi(s => (s + 1) % subjects.length), 2600);
    return () => clearInterval(id);
  }, [subjects.length]);
  const typed = useTyping(subjects[si], 90);

  return (
    <header className="l-hero">
      <div className="l-container">
        <div className="l-hero-grid">
          <div>
            <div className="l-hero-eyebrow-row l-reveal">
              <span className="l-hero-eyebrow">AI 投资研究助手</span>
              <span className="l-pill-live">
                <span className="l-dot"></span>8 Agents · 实时流式
              </span>
            </div>
            <h1 className="l-display l-display-xl l-reveal" data-d="1">
              把一个<span className="l-typed">{typed}</span>
              <span className="l-cursor"></span><br />
              变成一份可溯源的<br />研究报告
            </h1>
            <p className="l-subtitle l-reveal" data-d="2">
              输入研究问题，8 个专业化 AI Agent 协同完成从计划、调研、分析到成稿的全流程——
              每个观点都附带可点击的引用来源。
            </p>
            <div className="l-reveal" data-d="3" style={{ maxWidth: 500, marginBottom: 18 }}>
              <SearchBox onGo={(q) => onNavigate(q)} />
            </div>
            <div className="l-reveal" data-d="4">
              <ExampleChips onSelect={(q) => onNavigate(q)} />
            </div>
          </div>
          <div className="l-reveal" data-d="2">
            <AgentGraph />
          </div>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   FEATURES
   ============================================================ */
function FeatureCard({ c, delay }: { c: typeof VERIS.features[number]; delay: string }) {
  return (
    <article className={`l-feat-card l-reveal`} data-d={delay}>
      <span className="l-feat-num">{c.num}</span>
      <div className="l-feat-icon-wrap"><Icon name={c.ic} /></div>
      <h3>{c.title}</h3>
      <p>{c.body}</p>
      {'tags' in c && c.tags && (
        <div className="l-feat-tags">
          {(c.tags as readonly string[]).map((t, k) => <span className="l-feat-tag" key={k}>{t}</span>)}
        </div>
      )}
    </article>
  );
}

function LFeatures() {
  return (
    <section className="l-section" id="features">
      <div className="l-container">
        <div className="l-section-head l-reveal">
          <span className="l-eyebrow">为什么可信</span>
          <h2 className="l-heading l-heading-lg">和「一键生成、不知对错」<br />的工具划清界限</h2>
          <p>Veris 把可控性与可验证性放在第一位——你审批方向，AI 给出来源，过程全程可见。</p>
        </div>
        <div className="l-feat-grid">
          {VERIS.features.map((c, i) => (
            <FeatureCard key={c.id} c={c} delay={String((i % 3) + 1)} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FLOW
   ============================================================ */
function LFlow() {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(-1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((ents) => {
      if (ents[0].isIntersecting) {
        io.disconnect();
        let i = 0; setOn(0);
        const id = setInterval(() => { i++; if (i > 4) { clearInterval(id); return; } setOn(i); }, 700);
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const fillPct = on < 0 ? 0 : (on / (VERIS.flow.length - 1)) * 100;

  return (
    <section className="l-section" id="flow">
      <div className="l-container" ref={ref}>
        <div className="l-section-head center l-reveal">
          <span className="l-eyebrow">核心流程</span>
          <h2 className="l-heading l-heading-lg">五步，从一个问题到一份报告</h2>
          <p>Human-in-the-Loop 设计：你始终掌握研究方向。</p>
        </div>
        <div className="l-flow-wrap">
          <div className="l-flow-track">
            <div className="l-flow-fill" style={{ width: fillPct + '%' }}></div>
          </div>
          <div className="l-flow-steps">
            {VERIS.flow.map((s, i) => (
              <div className={`l-flow-step${on >= i ? ' on' : ''}`} key={i}>
                <span className="l-flow-key">{s.k}</span>
                <div className="l-flow-badge">
                  {on >= i ? <Icon name={s.ic} /> : (i + 1)}
                </div>
                <h4>{s.t}</h4>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   LIVE DEMO
   ============================================================ */
function StatItem({ s }: { s: { v: number; u: string; l: string } }) {
  const [val, ref] = useCountUp(s.v, 2000);
  return (
    <div className="l-stat" ref={ref}>
      <div className="l-stat-val">{val}<span className="l-stat-unit">{s.u}</span></div>
      <div className="l-stat-label">{s.l}</div>
    </div>
  );
}

function LLiveDemo() {
  const [act, setAct] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAct(a => (a + 1) % VERIS.demoFeats.length), 1600);
    return () => clearInterval(id);
  }, []);
  const r = VERIS.report;

  return (
    <section className="l-section" id="demo">
      <div className="l-container">
        <div className="l-section-head l-reveal">
          <span className="l-eyebrow">实时研究演示</span>
          <h2 className="l-heading l-heading-lg">看着 AI 一边研究，一边给出来源</h2>
          <p>整个过程通过 SSE 流式传输实时呈现，最终成稿的每个论点都装订了可点击的引用。</p>
        </div>
        <div className="l-demo-grid">
          <div className="l-demo-features l-reveal">
            {VERIS.demoFeats.map((d, i) => (
              <div className={`l-demo-feat${i === act ? ' active' : ''}`} key={i}>
                <span className="l-df-icon"><Icon name={d.ic} /></span>
                <div><h4>{d.t}</h4><p>{d.d}</p></div>
              </div>
            ))}
          </div>
          <div className="l-demo-report l-reveal" data-d="1">
            <div className="l-dr-bar">
              <Icon name="doc" style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
              <span className="l-dr-filename">research-report.md</span>
              <span className="l-dr-status">● 已完成</span>
            </div>
            <div className="l-dr-body">
              <h5>{r.title}</h5>
              <div className="l-dr-meta">{r.meta}</div>
              <p className="l-dr-para">
                历史数据显示，在宽松周期启动后的 12 个月内，成长型科技股相对大盘的超额收益显著
                <sup><a>1</a></sup>。利率敏感度更高的软件与半导体板块，对降息预期的反应尤为前置<sup><a>2</a></sup>。
              </p>
              <p className="l-dr-para">
                然而，CME FedWatch 当前隐含的降息路径已部分计入估值<sup><a>3</a></sup>，
                需警惕「利好兑现」后的回调风险<sup><a>4</a></sup>。
              </p>
              <div className="l-dr-skeleton" style={{ width: '92%' }}></div>
              <div className="l-dr-skeleton" style={{ width: '76%' }}></div>
            </div>
          </div>
        </div>
        <div className="l-stats">
          {VERIS.stats.map((s, i) => <StatItem s={s} key={i} />)}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   TECH STACK
   ============================================================ */
function LTechStack() {
  const doubled = [...VERIS.tech, ...VERIS.tech];
  return (
    <section className="l-tech" id="tech">
      <div className="l-divider" />
      <div className="l-tech-head" style={{ paddingTop: 80 }}>
        <span className="l-eyebrow" style={{ display: 'inline-flex', marginBottom: 18 }}>生产级工程</span>
        <p className="l-muted" style={{ fontSize: 16 }}>
          API 认证 · 请求限流 · 结构化日志 · Docker 容器化 · CI/CD · 会话持久化
        </p>
      </div>
      <div className="l-marquee">
        <div className="l-marquee-track">
          {doubled.map((t, i) => (
            <span className="l-tech-chip" key={i}><span className="l-tech-dot"></span>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   CTA
   ============================================================ */
function LCTA({ onNavigate }: { onNavigate: (q?: string) => void }) {
  return (
    <section className="l-cta">
      <div className="l-container">
        <div className="l-cta-inner l-reveal">
          <span className="l-eyebrow">开始你的研究</span>
          <h2>把下一个投资问题<br />交给 8 个 Agent</h2>
          <p>免费开始，一分钟得到第一份带引用来源的研究报告草案。</p>
          <div className="l-cta-search">
            <SearchBox big placeholder="输入一个研究主题…" onGo={(q) => onNavigate(q)} />
          </div>
          <p className="l-no-cc">无需信用卡 · 你审批计划后才开始执行</p>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FOOTER
   ============================================================ */
function LFooter() {
  const cols = [
    { h: '产品', items: ['能力概览', '实时演示', '示例报告', '定价'] },
    { h: '资源', items: ['文档', 'API 参考', '更新日志', '状态'] },
    { h: '公司', items: ['关于', '博客', '隐私', '条款'] },
  ];
  return (
    <footer className="l-footer">
      <div className="l-container">
        <div className="l-footer-grid">
          <div className="l-footer-about">
            <a className="l-brand">
              <LogoMark />
              <span className="l-brand-name">Veris<small>维睿</small></span>
            </a>
            <p>面向投资者与研究员的 AI 研究平台——可控、可溯源、实时可见。</p>
          </div>
          {cols.map((c, i) => (
            <div key={i}>
              <h6>{c.h}</h6>
              {c.items.map((it, k) => <a key={k}>{it}</a>)}
            </div>
          ))}
        </div>
        <div className="l-footer-bot">
          <span>© 2026 Veris · 维睿研究</span>
          <span>Powered by Google ADK · Gemini 2.5 Pro</span>
        </div>
      </div>
    </footer>
  );
}

/* ============================================================
   PAGE ROOT
   ============================================================ */
export default function LandingPage() {
  const navigate = useNavigate();

  const goToApp = (query?: string) => {
    navigate('/app', query ? { state: { query } } : undefined);
  };

  useEffect(() => {
    const vh = () => window.innerHeight || document.documentElement.clientHeight;
    const reveal = () => {
      document.querySelectorAll('.l-reveal:not(.in)').forEach(el => {
        if (el.getBoundingClientRect().top < vh() + 120) el.classList.add('in');
      });
    };
    reveal();
    const timers = [80, 400, 1000].map(ms => setTimeout(reveal, ms));
    window.addEventListener('scroll', reveal, { passive: true });
    window.addEventListener('resize', reveal);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('scroll', reveal);
      window.removeEventListener('resize', reveal);
    };
  }, []);

  return (
    <div className="landing-root">
      <div className="l-grid-bg" />
      <ParticleCanvas />
      <LNav />
      <HeroA onNavigate={goToApp} />
      <LFeatures />
      <LFlow />
      <LLiveDemo />
      <LTechStack />
      <LCTA onNavigate={goToApp} />
      <LFooter />
    </div>
  );
}
