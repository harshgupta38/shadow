import { useEffect, useState } from "react";
import { CpuFill } from "react-bootstrap-icons";
import { api } from "@/api";
import type {
  AIBehaviorSettings,
  AIPersonality,
  AIProvider,
  AIResponseLength,
} from "@/api/settings";
import { MOCK_AI_PROVIDERS } from "@/pages/settings/settings.mock";
import { Card, FieldRow, SegmentedControl } from "@/pages/settings/SettingsShared";
import "@/pages/settings/AIBehaviorCard/AIBehaviorCard.scss";

const RESPONSE_LENGTH_OPTIONS: { value: AIResponseLength; label: string }[] = [
  { value: "short",        label: "Short"    },
  { value: "balanced",     label: "Balanced" },
  { value: "detailed",     label: "Detailed" },
  { value: "very_detailed", label: "In-depth" },
];

const PERSONALITY_OPTIONS: { value: AIPersonality; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly",     label: "Friendly"     },
  { value: "coach",        label: "Coach"        },
  { value: "teacher",      label: "Teacher"      },
  { value: "mentor",       label: "Mentor"       },
  { value: "minimal",      label: "Minimal"      },
];

export function AIBehaviorCard({
  data,
  isDirty,
  onUpdate,
}: {
  data: AIBehaviorSettings;
  isDirty: boolean;
  onUpdate: (d: AIBehaviorSettings) => void;
}) {
  const [providers, setProviders] = useState<AIProvider[]>([]);

  useEffect(() => {
    api.settings
      .getProviders()
      .then(setProviders)
      .catch(() => setProviders(MOCK_AI_PROVIDERS));
  }, []);

  function set<K extends keyof AIBehaviorSettings>(key: K, value: AIBehaviorSettings[K]) {
    onUpdate({ ...data, [key]: value });
  }

  const activeProvider = providers.find((p) => p.key === data.ai_provider);
  const models = activeProvider?.models ?? [];

  function handleProviderChange(providerKey: string) {
    const provider = providers.find((p) => p.key === providerKey);
    onUpdate({
      ...data,
      ai_provider: providerKey,
      ai_default_model: provider?.models[0]?.key ?? "",
    });
  }

  return (
    <Card
      className="ai-behavior-card"
      icon={<CpuFill size={16} />}
      title="AI Behavior"
      desc="Control how Shadow's AI responds and communicates with you."
      isDirty={isDirty}
    >
      <div className="st-toggle-group mt-0">
        <span className="st-group-label">Response Style</span>

        <div className="st-block-field st-block-field--no-border pt-0">
          <span className="st-field-label">Response length</span>
          <SegmentedControl
            options={RESPONSE_LENGTH_OPTIONS}
            value={data.ai_response_length}
            onChange={(v) => set("ai_response_length", v)}
          />
        </div>

        <FieldRow label="Personality" hint="Tone and style of AI replies">
          <select
            className="form-select form-select-sm st-select"
            value={data.ai_personality}
            onChange={(e) => set("ai_personality", e.target.value as AIPersonality)}
            aria-label="AI personality"
          >
            {PERSONALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>

      <div className="st-toggle-group mt-1">
        <span className="st-group-label">Model</span>

        <FieldRow label="Provider" hint="AI service powering your responses" className="pt-1" noBorder>
          <select
            className="form-select form-select-sm st-select"
            value={data.ai_provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            aria-label="AI provider"
            disabled={providers.length === 0}
          >
            {providers.length === 0 && (
              <option value={data.ai_provider}>{data.ai_provider}</option>
            )}
            {providers.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </FieldRow>

        <FieldRow label="Model" hint="Specific model used for all responses" className="pb-0">
          <select
            className="form-select form-select-sm st-select"
            value={data.ai_default_model}
            onChange={(e) => set("ai_default_model", e.target.value)}
            aria-label="AI model"
            disabled={models.length === 0}
          >
            {models.length === 0 && (
              <option value={data.ai_default_model}>{data.ai_default_model}</option>
            )}
            {models.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
        </FieldRow>
      </div>
    </Card>
  );
}
