import type { AgentType } from "@/api";
import { agentMeta } from "@/lib/agents";

interface AgentAvatarProps {
  agent: AgentType;
  size?: number;
}

/** Circular avatar showing an agent's icon over its signature gradient. */
export function AgentAvatar({ agent, size = 40 }: AgentAvatarProps) {
  const meta = agentMeta(agent);
  const Icon = meta.icon;
  return (
    <span
      className="d-inline-grid flex-shrink-0"
      style={{
        width: size,
        height: size,
        placeItems: "center",
        borderRadius: size / 2.6,
        color: "#fff",
        background: `linear-gradient(135deg, ${meta.gradient[0]}, ${meta.gradient[1]})`,
      }}
      aria-hidden="true"
    >
      <Icon size={size * 0.5} />
    </span>
  );
}
