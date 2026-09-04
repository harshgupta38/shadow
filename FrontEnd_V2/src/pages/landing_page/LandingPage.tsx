import { Link, Navigate } from "react-router-dom";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BarChart,
  CalendarCheck,
  Check2Circle,
  Compass,
  Flag,
  type Icon,
  Lightbulb,
  Stars,
} from "react-bootstrap-icons";
import {
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Brand } from "@/components/ui/Brand/Brand";
import { ThemeToggle } from "@/components/ui/ThemeToggle/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { ROUTES } from "@/routes/RoutePaths";

import "@/pages/landing_page/LandingPage.scss";

type LandingFlowVariant = "goal" | "milestone" | "habit" | "coach";

interface LandingFlowNodeData extends Record<string, unknown> {
  className: string;
  variant: LandingFlowVariant;
  icon: Icon;
  title: string;
  text: string;
}

type LandingFlowNode = Node<LandingFlowNodeData, "landingNode">;

const FLOW_NODE_CONTENT = [
  {
    className: "landing-node-goal",
    variant: "goal",
    icon: Flag,
    title: "Define your goal",
    text: "Career shift by next year",
  },
  {
    className: "landing-node-milestone",
    variant: "milestone",
    icon: Compass,
    title: "Milestone map",
    text: "Portfolio ready in 8 weeks",
  },
  {
    className: "landing-node-habit",
    variant: "habit",
    icon: CalendarCheck,
    title: "Daily action",
    text: "2 focused tasks for today",
  },
  {
    className: "landing-node-coach",
    variant: "coach",
    icon: Stars,
    title: "AI coach",
    text: "Adjusting tomorrow plan",
  },
] as const satisfies ReadonlyArray<LandingFlowNodeData>;

const INITIAL_FLOW_NODES: LandingFlowNode[] = [
  {
    id: "goal",
    type: "landingNode",
    position: { x: 28, y: 30 },
    data: FLOW_NODE_CONTENT[0],
  },
  {
    id: "milestone",
    type: "landingNode",
    position: { x: 282, y: 132 },
    data: FLOW_NODE_CONTENT[1],
  },
  {
    id: "habit",
    type: "landingNode",
    position: { x: 28, y: 238 },
    data: FLOW_NODE_CONTENT[2],
  },
  {
    id: "coach",
    type: "landingNode",
    position: { x: 282, y: 338 },
    data: FLOW_NODE_CONTENT[3],
  },
];

const INITIAL_FLOW_EDGES: Edge[] = [
  {
    id: "goal-milestone",
    source: "goal",
    sourceHandle: "source-right",
    target: "milestone",
    targetHandle: "target-left",
    animated: true,
    className: "landing-flow-edge",
    type: "smoothstep",
  },
  {
    id: "milestone-habit",
    source: "milestone",
    sourceHandle: "source-bottom",
    target: "habit",
    targetHandle: "target-top",
    animated: true,
    className: "landing-flow-edge",
    type: "smoothstep",
  },
  {
    id: "habit-coach",
    source: "habit",
    sourceHandle: "source-right",
    target: "coach",
    targetHandle: "target-left",
    animated: true,
    className: "landing-flow-edge",
    type: "smoothstep",
  },
];

function LandingFlowNodeComponent({ data }: NodeProps<LandingFlowNode>) {
  const Icon = data.icon;

  return (
    <article className={`landing-flow-node ${data.className}`}>
      {data.variant === "goal" && (
        <Handle type="source" id="source-right" position={Position.Right} className="landing-node-handle" />
      )}

      {data.variant === "milestone" && (
        <>
          <Handle type="target" id="target-left" position={Position.Left} className="landing-node-handle" />
          <Handle type="source" id="source-bottom" position={Position.Bottom} className="landing-node-handle" />
        </>
      )}

      {data.variant === "habit" && (
        <>
          <Handle type="target" id="target-top" position={Position.Top} className="landing-node-handle" />
          <Handle type="source" id="source-right" position={Position.Right} className="landing-node-handle" />
        </>
      )}

      {data.variant === "coach" && (
        <Handle type="target" id="target-left" position={Position.Left} className="landing-node-handle" />
      )}

      <span className="landing-flow-icon">
        <Icon size={17} />
      </span>
      <div>
        <p className="landing-flow-title">{data.title}</p>
        <p className="landing-flow-text">{data.text}</p>
      </div>
    </article>
  );
}

const landingNodeTypes: NodeTypes = {
  landingNode: LandingFlowNodeComponent,
};

const flowCanvasStyle: CSSProperties = { width: "100%", height: "100%" };

const STEPS = [
  {
    icon: Lightbulb,
    title: "Find the right goal",
    text: "If your direction is unclear, the assistant helps you discover goals for life, work, and relationships.",
  },
  {
    icon: Compass,
    title: "Break it into milestones",
    text: "Turn one big target into practical milestones with clear timelines and measurable outcomes.",
  },
  {
    icon: BarChart,
    title: "Execute and improve daily",
    text: "Your daily planner generates tasks, tracks completion, and the AI coach guides your next move every week.",
  },
] as const;

const METRICS = [
  {
    icon: Flag,
    value: "Goal Clarity",
    text: "Discover the right direction with guided AI prompts.",
  },
  {
    icon: CalendarCheck,
    value: "Daily Focus",
    text: "Turn milestones into practical tasks you can complete today.",
  },
  {
    icon: BarChart,
    value: "Momentum",
    text: "Track progress weekly and keep moving without losing consistency.",
  },
] as const;

export function LandingPage() {
  const { status, isAuthenticated } = useAuth();
  const [nodes, , onNodesChange] = useNodesState<LandingFlowNode>(INITIAL_FLOW_NODES);
  const [edges, , onEdgesChange] = useEdgesState<Edge>(INITIAL_FLOW_EDGES);

  if (status === "loading")
    return null;

  if (isAuthenticated)
    return <Navigate to={ROUTES.DASHBOARD} replace />;

  return (
    <div className="landing-shell">
      <header className="landing-topbar">
        <Brand size="md" />
        <div className="landing-topbar-actions">
          <ThemeToggle />
          {/* <Link to={ROUTES.LOGIN} className="btn btn-outline-secondary btn-sm">
            Sign in
          </Link>
          <Link to={ROUTES.REGISTER} className="btn btn-brand btn-sm">
            Create account
          </Link> */}
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-copy reveal-up">
            <h1 className="landing-title">
              Turn goals into progress,
              <br />
              <span className="landing-title-accent">one day at a time.</span>
            </h1>
            <p className="landing-subtitle">
              Shadow helps you choose a goal, break it into milestones, and stay consistent with daily actions.
              Your AI coach adapts your next steps as you progress.
            </p>
            <div className="landing-hero-actions">
              <Link to={ROUTES.REGISTER} className="btn btn-brand btn-lg landing-hero-btn">
                Start my goal <ArrowRight size={18} className="ms-1" />
              </Link>
              <Link to={ROUTES.LOGIN} className="btn btn-outline-secondary btn-lg landing-hero-btn">
                I have an account
              </Link>
            </div>
            <div className="landing-proof">
              <span>
                <Check2Circle size={16} /> Goal discovery
              </span>
              <span>
                <Check2Circle size={16} /> Milestone planning
              </span>
              <span>
                <Check2Circle size={16} /> Daily AI coaching
              </span>
            </div>
          </div>

          <div className="landing-flow-wrap reveal-up-delay">
            <div className="landing-flow-grid" aria-hidden="true" />
            <div className="landing-flow-canvas" role="img" aria-label="Goal execution flow from planning to daily coaching">
              <ReactFlow
                style={flowCanvasStyle}
                className="landing-reactflow"
                nodes={nodes}
                edges={edges}
                nodeTypes={landingNodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodesConnectable={false}
                elementsSelectable={false}
                fitView
                fitViewOptions={{ padding: 0.08, minZoom: 0.92, maxZoom: 1 }}
                minZoom={0.75}
                maxZoom={1.25}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                proOptions={{ hideAttribution: true }}
              >
                {/* <Background variant={BackgroundVariant.Dots} gap={20} size={1.45} color="rgba(234, 236, 239, 0.52)" /> */}
              </ReactFlow>
            </div>
          </div>
        </section>

        <section className="landing-steps">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title} className="landing-step-card reveal-up" style={{ animationDelay: `${index * 120}ms` }}>
                <span className="landing-step-num" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="landing-step-icon">
                  <Icon size={20} />
                </span>
                <h2>{step.title}</h2>
                <p>{step.text}</p>
              </article>
            );
          })}
        </section>

        <section className="landing-cta reveal-up">
          <h2>Ready to turn your goal into <span className="landing-cta-accent">daily wins?</span></h2>
          <p>
            Start with one goal. Shadow builds your milestones, daily actions, and weekly guidance so you keep moving with clarity.
          </p>
          <div className="landing-cta-actions">
            <Link to={ROUTES.REGISTER} className="btn btn-brand btn-lg landing-cta-btn-primary">
              Create my plan <ArrowRight size={17} className="ms-1" />
            </Link>
            <Link to={ROUTES.LOGIN} className="btn landing-cta-btn-secondary btn-lg">
              View dashboard
            </Link>
          </div>
        </section>

        <section className="landing-metrics reveal-up">
          {METRICS.map((metric) => {
            const Icon = metric.icon;
            return (
              <article key={metric.value} className="landing-metric-item">
                <span className="landing-metric-icon">
                  <Icon size={18} />
                </span>
                <h3>{metric.value}</h3>
                <p>{metric.text}</p>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
}
