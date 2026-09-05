import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardList,
  Filter,
  MapPinned,
  TrendingUp,
  UsersRound,
} from "lucide-react";

type SurveyRow = Record<string, string>;

type DistributionItem = {
  name: string;
  value: number;
};

type BarrierItem = {
  key: string;
  name: string;
  average: number;
  responses: number;
};

type ProposalRow = {
  proposal_id: string;
  title: string;
  policy_area: string;
  description: string;
  addressed_problems: string[];
  citizen_demand: string;
  source_type: string;
  supporting_response_ids: number[];
  support_count: number;
  sentiment_context: string;
  priority: string;
  priority_justification: string;
};

type ProposalTier = {
  priority: string;
  proposals: ProposalRow[];
  count: number;
};

type ProposalsData = {
  metadata: {
    source: string | null;
    totalProposals: number;
    totalSupport: number;
  };
  rows: ProposalRow[];
  summary: {
    byPriority: DistributionItem[];
    byPolicyArea: DistributionItem[];
    bySourceType: DistributionItem[];
    topSupported: ProposalRow[];
    tiers: ProposalTier[];
  };
};

type DashboardData = {
  metadata: {
    generatedAt: string;
    totalResponses: number;
    sources: string[];
    barrierScale: string;
  };
  rows: SurveyRow[];
  summary: {
    barriers: BarrierItem[];
    topTerms: DistributionItem[];
    quotes: Record<string, string[]>;
  };
  proposals?: ProposalsData;
};

const COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#16a34a", "#ea580c", "#dc2626", "#4f46e5"];

const BARRIER_LABELS: Record<string, string> = {
  experience_barrier: "Falta de experiencia",
  job_scarcity_barrier: "Escasez de ofertas",
  low_salary_barrier: "Salarios insuficientes",
  temporary_contract_barrier: "Contratos temporales",
  opportunity_scarcity_barrier: "Falta de oportunidades",
  internship_access_barrier: "Acceso a practicas",
  discrimination_barrier: "Discriminacion",
  migration_barrier: "Necesidad de migrar",
  public_transport_barrier: "Transporte publico",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
  unclassified: "Sin clasificar",
};

const TEXT_COLUMNS = [
  "main_job_search_barriers",
  "advice_to_young_people",
  "proposed_public_measure",
];

const STOPWORDS = new Set([
  "actual",
  "alguna",
  "alguien",
  "ante",
  "anos",
  "cada",
  "como",
  "con",
  "desde",
  "donde",
  "empresas",
  "entre",
  "esta",
  "este",
  "esto",
  "fuera",
  "hacer",
  "hasta",
  "joven",
  "jovenes",
  "laboral",
  "los",
  "mas",
  "para",
  "pero",
  "por",
  "que",
  "sin",
  "sus",
  "una",
  "unos",
]);

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function uniqueValues(rows: SurveyRow[], key: string) {
  return Array.from(new Set(rows.map((row) => clean(row[key])).filter(Boolean))).sort();
}

function distribution(rows: SurveyRow[], key: string): DistributionItem[] {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    const value = clean(row[key]) || "Sin dato";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function parseNumber(value: unknown) {
  const parsed = Number.parseFloat(clean(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatLabel(value: string) {
  return clean(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatPriority(value: string) {
  return PRIORITY_LABELS[value] ?? formatLabel(value);
}

function countBy<T>(items: T[], getKey: (item: T) => string): DistributionItem[] {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const key = clean(getKey(item)) || "Sin dato";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

function normalizeProblems(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }
  return clean(value)
    .replaceAll("[", "")
    .replaceAll("]", "")
    .replaceAll("'", "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeProposalRow(rawProposal: Partial<Record<keyof ProposalRow, unknown>>): ProposalRow {
  const supportingIds = Array.isArray(rawProposal.supporting_response_ids)
    ? rawProposal.supporting_response_ids.map((item) => Number(item)).filter(Number.isFinite)
    : [];
  const supportCount = Number(rawProposal.support_count);

  return {
    proposal_id: clean(rawProposal.proposal_id),
    title: clean(rawProposal.title),
    policy_area: clean(rawProposal.policy_area),
    description: clean(rawProposal.description),
    addressed_problems: normalizeProblems(rawProposal.addressed_problems),
    citizen_demand: clean(rawProposal.citizen_demand),
    source_type: clean(rawProposal.source_type),
    supporting_response_ids: supportingIds,
    support_count: Number.isFinite(supportCount) ? supportCount : supportingIds.length,
    sentiment_context: clean(rawProposal.sentiment_context),
    priority: clean(rawProposal.priority).toLowerCase() || "unclassified",
    priority_justification: clean(rawProposal.priority_justification),
  };
}

function buildProposalTiers(rows: ProposalRow[]): ProposalTier[] {
  return ["high", "medium", "low", "unclassified"]
    .map((priority) => {
      const proposals = rows.filter((proposal) => proposal.priority === priority);
      return { priority, proposals, count: proposals.length };
    })
    .filter((tier) => tier.count > 0);
}

function normalizeProposals(proposals?: ProposalsData): ProposalsData {
  const rows = Array.isArray(proposals?.rows)
    ? proposals.rows.map((proposal) => normalizeProposalRow(proposal))
    : [];
  const topSupported = [...rows].sort((a, b) => b.support_count - a.support_count).slice(0, 5);

  return {
    metadata: {
      source: proposals?.metadata?.source ?? null,
      totalProposals: proposals?.metadata?.totalProposals ?? rows.length,
      totalSupport:
        proposals?.metadata?.totalSupport ?? rows.reduce((sum, row) => sum + row.support_count, 0),
    },
    rows,
    summary: {
      byPriority: countBy(rows, (proposal) => proposal.priority),
      byPolicyArea: countBy(rows, (proposal) => proposal.policy_area),
      bySourceType: countBy(rows, (proposal) => proposal.source_type),
      topSupported,
      tiers: buildProposalTiers(rows),
    },
  };
}

function averageBarriers(rows: SurveyRow[]): BarrierItem[] {
  return Object.entries(BARRIER_LABELS)
    .map(([key, name]) => {
      const values = rows
        .map((row) => parseNumber(row[key]))
        .filter((value): value is number => value !== null);
      const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return {
        key,
        name,
        average: Number(average.toFixed(2)),
        responses: values.length,
      };
    })
    .sort((a, b) => b.average - a.average);
}

function quoteExamples(rows: SurveyRow[]) {
  return TEXT_COLUMNS.flatMap((column) =>
    rows
      .map((row) => clean(row[column]))
      .filter(Boolean)
      .slice(0, 3)
      .map((text) => ({ column, text })),
  ).slice(0, 8);
}

function normalizeWord(word: string) {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace("ñ", "n");
}

function topTerms(rows: SurveyRow[]): DistributionItem[] {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    TEXT_COLUMNS.forEach((column) => {
      const words = clean(row[column]).match(/[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{4,}/g) ?? [];
      words.forEach((word) => {
        const normalized = normalizeWord(word);
        if (!STOPWORDS.has(normalized)) {
          acc[normalized] = (acc[normalized] ?? 0) + 1;
        }
      });
    });
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 30);
}

function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/dashboard-data.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("No se pudo cargar el archivo de datos del dashboard.");
        }
        return response.json() as Promise<DashboardData>;
      })
      .then(setData)
      .catch((fetchError: Error) => setError(fetchError.message));
  }, []);

  return { data, error };
}

function KpiCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="kpi-card">
      <div className="kpi-icon">{icon}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="card chart-card">
      <div className="section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

function ProposalDashboard({ proposals }: { proposals: ProposalsData }) {
  if (!proposals.rows.length) {
    return null;
  }

  const highPriorityCount = proposals.rows.filter((proposal) => proposal.priority === "high").length;
  const topProposal = proposals.summary.topSupported[0];
  const primaryArea = proposals.summary.byPolicyArea[0];

  return (
    <section className="proposal-section">
      <div className="section-heading proposal-heading">
        <div>
          <p className="eyebrow dark">Fase 4 · Propuestas</p>
          <h2>Propuestas publicas priorizadas</h2>
          <p>
            Vista especifica para leer las medidas generadas a partir de las respuestas ciudadanas,
            su nivel de prioridad y el numero de respuestas que las respaldan.
          </p>
        </div>
        <span className="source-pill">{proposals.metadata.source}</span>
      </div>

      <div className="proposal-kpis">
        <KpiCard
          icon={<ClipboardList size={22} />}
          label="Propuestas detectadas"
          value={String(proposals.metadata.totalProposals)}
          detail="medidas estructuradas en fase 4"
        />
        <KpiCard
          icon={<UsersRound size={22} />}
          label="Apoyos agregados"
          value={String(proposals.metadata.totalSupport)}
          detail="respuestas vinculadas a propuestas"
        />
        <KpiCard
          icon={<BadgeCheck size={22} />}
          label="Alta prioridad"
          value={String(highPriorityCount)}
          detail="propuestas marcadas como urgentes"
        />
        <KpiCard
          icon={<MapPinned size={22} />}
          label="Area mas repetida"
          value={primaryArea ? formatLabel(primaryArea.name) : "Sin dato"}
          detail={primaryArea ? `${primaryArea.value} propuestas` : "sin clasificacion"}
        />
      </div>

      <div className="proposal-grid">
        <ChartCard
          title="Ranking por apoyo ciudadano"
          description="Numero de respuestas que respaldan cada propuesta."
        >
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={proposals.summary.topSupported} layout="vertical" margin={{ left: 16, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis dataKey="proposal_id" type="category" width={56} />
              <Tooltip formatter={(value) => [`${value} respuestas`, "Apoyo"]} />
              <Bar dataKey="support_count" radius={[0, 8, 8, 0]} fill="#16a34a" />
            </BarChart>
          </ResponsiveContainer>
          {topProposal ? (
            <div className="top-proposal">
              <span>Mas apoyada</span>
              <strong>{topProposal.title}</strong>
              <p>{topProposal.citizen_demand}</p>
            </div>
          ) : null}
        </ChartCard>

        <ChartCard
          title="Prioridad y area politica"
          description="Distribucion de propuestas segun urgencia y ambito de intervencion."
        >
          <div className="proposal-charts">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={proposals.summary.byPriority} dataKey="value" nameKey="name" outerRadius={74} label>
                  {proposals.summary.byPriority.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} propuestas`, formatPriority(String(name))]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="area-list">
              {proposals.summary.byPolicyArea.map((area) => (
                <div key={area.name}>
                  <span>{formatLabel(area.name)}</span>
                  <strong>{area.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="tier-list">
        {proposals.summary.tiers.map((tier) => (
          <section className={`tier-card priority-${tier.priority}`} key={tier.priority}>
            <div className="tier-header">
              <div>
                <span>Prioridad</span>
                <h3>{formatPriority(tier.priority)}</h3>
              </div>
              <strong>{tier.count}</strong>
            </div>
            <div className="proposal-cards">
              {tier.proposals.map((proposal) => (
                <article className="proposal-card" key={proposal.proposal_id}>
                  <div className="proposal-card-header">
                    <span>{proposal.proposal_id}</span>
                    <strong>{proposal.support_count} apoyos</strong>
                  </div>
                  <h4>{proposal.title}</h4>
                  <p>{proposal.description}</p>
                  <div className="proposal-tags">
                    <span>{formatLabel(proposal.policy_area)}</span>
                    <span>{formatLabel(proposal.source_type)}</span>
                  </div>
                  <div className="proposal-field">
                    <strong>Demanda ciudadana</strong>
                    <p>{proposal.citizen_demand}</p>
                  </div>
                  <div className="proposal-field">
                    <strong>Justificacion de prioridad</strong>
                    <p>{proposal.priority_justification}</p>
                  </div>
                  <div className="problem-tags">
                    {proposal.addressed_problems.slice(0, 5).map((problem) => (
                      <span key={problem}>{formatLabel(problem)}</span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function App() {
  const { data, error } = useDashboardData();
  const [phase, setPhase] = useState("");
  const [ageGroup, setAgeGroup] = useState("Todos");
  const [education, setEducation] = useState("Todos");
  const [employment, setEmployment] = useState("Todos");

  const rows = data?.rows ?? [];
  const phases = useMemo(() => uniqueValues(rows, "phase"), [rows]);
  const selectedPhase = phases.includes(phase) ? phase : (phases[0] ?? "");
  const ageGroupOptions = useMemo(() => uniqueValues(rows, "age_group"), [rows]);
  const educationLevels = useMemo(() => uniqueValues(rows, "education_level"), [rows]);
  const employmentStatuses = useMemo(() => uniqueValues(rows, "employment_status"), [rows]);

  useEffect(() => {
    if (phases.length > 0 && !phases.includes(phase)) {
      setPhase(phases[0]);
    }
  }, [phase, phases]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const phaseMatch = row.phase === selectedPhase;
        const ageMatch = ageGroup === "Todos" || row.age_group === ageGroup;
        const educationMatch = education === "Todos" || row.education_level === education;
        const employmentMatch = employment === "Todos" || row.employment_status === employment;
        return phaseMatch && ageMatch && educationMatch && employmentMatch;
      }),
    [ageGroup, education, employment, rows, selectedPhase],
  );

  const barriers = useMemo(() => averageBarriers(filteredRows), [filteredRows]);
  const ageGroups = useMemo(() => distribution(filteredRows, "age_group"), [filteredRows]);
  const difficulty = useMemo(() => distribution(filteredRows, "first_job_difficulty"), [filteredRows]);
  const employmentDistribution = useMemo(
    () => distribution(filteredRows, "employment_status"),
    [filteredRows],
  );
  const mobility = useMemo(() => distribution(filteredRows, "mobility_intention"), [filteredRows]);
  const quotes = useMemo(() => quoteExamples(filteredRows), [filteredRows]);
  const frequentTerms = useMemo(() => topTerms(filteredRows), [filteredRows]);
  const proposals = useMemo(() => normalizeProposals(data?.proposals), [data?.proposals]);

  if (error) {
    return (
      <main className="page">
        <section className="empty-state">
          <h1>No se pudieron cargar los datos</h1>
          <p>{error}</p>
          <p>Ejecuta <code>npm run prepare:data</code> desde la carpeta <code>dashboard</code>.</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="page">
        <section className="empty-state">
          <h1>Cargando dashboard...</h1>
          <p>Preparando los resultados de las encuestas.</p>
        </section>
      </main>
    );
  }

  const topBarrier = barriers[0];
  const mobilityYes =
    mobility.find((item) => item.name.toLowerCase().startsWith("si"))?.value ??
    mobility.find((item) => item.name.toLowerCase().startsWith("sí"))?.value ??
    0;

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">TFM · Encuestas por fases</p>
          <h1>Dashboard de incorporacion juvenil al mercado laboral</h1>
          <p className="hero-copy">
            Interfaz visual para explorar perfiles, barreras, movilidad y propuestas recogidas en
            las encuestas. Los filtros actualizan todos los graficos y lecturas de la pagina.
          </p>
        </div>
        <div className="hero-meta">
          <span>{data.metadata.totalResponses} respuestas totales</span>
          <span>{data.metadata.sources.join(", ")}</span>
          <span>{data.metadata.barrierScale}</span>
        </div>
      </section>

      <section className="filters card">
        <div className="filter-title">
          <Filter size={20} />
          <div>
            <h2>Filtros</h2>
            <p>Selecciona una fase o segmento para analizar los resultados.</p>
          </div>
        </div>
        <label>
          Fase
          <select value={selectedPhase} onChange={(event) => setPhase(event.target.value)}>
            {phases.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Edad
          <select value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)}>
            <option>Todos</option>
            {ageGroupOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Estudios
          <select value={education} onChange={(event) => setEducation(event.target.value)}>
            <option>Todos</option>
            {educationLevels.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Situacion laboral
          <select value={employment} onChange={(event) => setEmployment(event.target.value)}>
            <option>Todos</option>
            {employmentStatuses.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="kpi-grid">
        <KpiCard
          icon={<UsersRound size={22} />}
          label="Respuestas filtradas"
          value={String(filteredRows.length)}
          detail={`sobre ${rows.length} respuestas disponibles`}
        />
        <KpiCard
          icon={<TrendingUp size={22} />}
          label="Barrera principal"
          value={topBarrier?.name ?? "Sin dato"}
          detail={topBarrier ? `media ${topBarrier.average}/5` : "sin respuestas numericas"}
        />
        <KpiCard
          icon={<MapPinned size={22} />}
          label="Intencion de movilidad"
          value={String(mobilityYes)}
          detail="personas que han pensado mudarse"
        />
        <KpiCard
          icon={<BriefcaseBusiness size={22} />}
          label="Fases cargadas"
          value={String(phases.length)}
          detail="fuentes de encuesta integradas"
        />
      </section>

      <ProposalDashboard proposals={proposals} />

      <section className="dashboard-grid">
        <ChartCard
          title="Barreras mejor valoradas"
          description="Media de dificultad declarada por las personas encuestadas."
        >
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={barriers} layout="vertical" margin={{ left: 16, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 5]} />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip />
              <Bar dataKey="average" radius={[0, 8, 8, 0]} fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Dificultad del primer empleo"
          description="Percepcion subjetiva al finalizar los estudios principales."
        >
          <ResponsiveContainer width="100%" height={330}>
            <PieChart>
              <Pie data={difficulty} dataKey="value" nameKey="name" outerRadius={105} label>
                {difficulty.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Perfil laboral"
          description="Situacion laboral de las personas incluidas en el segmento seleccionado."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={employmentDistribution}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#7c3aed" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Grupos de edad"
          description="Agrupacion aproximada calculada a partir del ano de nacimiento."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageGroups}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill="#0891b2" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </section>

      <section className="insights-grid">
        <div className="card">
          <div className="section-heading">
            <h2>Terminos frecuentes</h2>
            <p>Lectura rapida de conceptos repetidos en respuestas abiertas.</p>
          </div>
          <div className="tag-cloud">
            {frequentTerms.slice(0, 18).map((term) => (
              <span key={term.name}>
                {term.name} <strong>{term.value}</strong>
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-heading">
            <h2>Respuestas abiertas</h2>
            <p>Ejemplos cualitativos del segmento seleccionado.</p>
          </div>
          <div className="quote-list">
            {quotes.length ? (
              quotes.map((quote, index) => (
                <blockquote key={`${quote.column}-${index}`}>{quote.text}</blockquote>
              ))
            ) : (
              <p className="muted">No hay respuestas abiertas para este filtro.</p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
