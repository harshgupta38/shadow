import { useEffect, useRef, useState } from "react";
import { CheckCircleFill, CpuFill, Eye, EyeSlash, Floppy } from "react-bootstrap-icons";
import { api } from "@/api";
import type { AIBehaviorSettings, AIPersonality, AIProvider, AIResponseLength } from "@/api";
import { Card, FieldRow, SegmentedControl, ToggleRow } from "@/pages/settings/SettingsShared";
import "@/pages/settings/AIBehaviorCard/AIBehaviorCard.scss";

const RESPONSE_LENGTH_OPTIONS: { value: AIResponseLength; label: string }[] = [
  { value: "short",         label: "Short"    },
  { value: "balanced",      label: "Balanced" },
  { value: "detailed",      label: "Detailed" },
  { value: "very_detailed", label: "In-depth" },
];

type CostLevel = "low" | "medium" | "high" | "highest";

const RESPONSE_LENGTH_HINTS: Record<AIResponseLength, { level: CostLevel; label: string; desc: string }> = {
  short:        { level: "low",     label: "Short",     desc: "Fewest tokens per reply — fastest and cheapest. Best for quick questions and simple tasks." },
  balanced:     { level: "medium",  label: "Balanced",  desc: "Moderate token usage — a good fit for most everyday tasks and conversations." },
  detailed:     { level: "high",    label: "Detailed",  desc: "Longer replies use noticeably more tokens. Better for explanations and step-by-step guidance." },
  very_detailed:{ level: "highest", label: "In-depth", desc: "Maximum response length — most tokens per message. Reserve for deep analysis or complex research." },
};

const COST_LEVEL_CLASS: Record<CostLevel, string> = {
  low:     "rl-hint--low",
  medium:  "rl-hint--medium",
  high:    "rl-hint--high",
  highest: "rl-hint--highest",
};

const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  openai:  "gpt-5-mini",
  gemini:  "gemini-2.5-flash",
  claude:  "claude-sonnet-4-5",
  ollama:  "qwen3:8b",
};

const PERSONALITY_OPTIONS: { value: AIPersonality; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "friendly",     label: "Friendly"     },
  { value: "coach",        label: "Coach"        },
  { value: "teacher",      label: "Teacher"      },
  { value: "mentor",       label: "Mentor"       },
  { value: "minimal",      label: "Minimal"      },
];

// Fade duration must match CSS transition in AIBehaviorCard.scss
const TICK_VISIBLE_MS = 5000;
const TICK_FADE_MS    = 600;

type HealthState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export function AIBehaviorCard({
  data,
  isDirty,
  onUpdate,
  onSaveApiKey,
  onClearApiKey,
}: {
  data: AIBehaviorSettings;
  isDirty: boolean;
  onUpdate: (d: AIBehaviorSettings) => void;
  onSaveApiKey: () => Promise<void>;
  onClearApiKey: () => Promise<void>;
}) {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [health, setHealth] = useState<HealthState>({ status: "idle" });
  const [tickFading, setTickFading] = useState(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkIdRef = useRef(0);

  const [keyHealth, setKeyHealth] = useState<HealthState>({ status: "idle" });
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    api.settings.getProviders().then(setProviders).catch(() => {});
  }, []);

  // Debounced health check whenever provider or model changes.
  useEffect(() => {
    if (!data.ai_provider || !data.ai_default_model) return;

    const id = ++checkIdRef.current;
    setHealth({ status: "checking" });
    if (timerRef.current)   clearTimeout(timerRef.current);
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

    timerRef.current = setTimeout(() => {
      api.settings
        .checkProviderHealth(data.ai_provider, data.ai_default_model)
        .then((res) => {
          if (checkIdRef.current !== id) return;
          if (res.healthy) {
            setTickFading(false);
            setHealth({ status: "ok", message: res.message });
            // Start fade after TICK_VISIBLE_MS, then transition to idle.
            fadeTimerRef.current = setTimeout(() => {
              setTickFading(true);
              fadeTimerRef.current = setTimeout(
                () => setHealth({ status: "idle" }),
                TICK_FADE_MS,
              );
            }, TICK_VISIBLE_MS);
          } else {
            setHealth({ status: "error", message: res.message });
          }
        })
        .catch((err: unknown) => {
          if (checkIdRef.current !== id) return;
          setHealth({
            status: "error",
            message: err instanceof Error ? err.message : "Connection check failed.",
          });
        });
    }, 600);

    return () => {
      if (timerRef.current)   clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [data.ai_provider, data.ai_default_model]);

  function set<K extends keyof AIBehaviorSettings>(key: K, value: AIBehaviorSettings[K]) {
    onUpdate({ ...data, [key]: value });
  }

  const activeProvider = providers.find((p) => p.key === data.ai_provider);
  const models = activeProvider?.models ?? [];

  async function handleSaveKey() {
    if (!data.custom_api_key.trim()) return;
    setKeyHealth({ status: "checking" });
    try {
      const res = await api.settings.testCustomApiKey(data.ai_provider, data.ai_default_model, data.custom_api_key.trim());
      if (!res.healthy) {
        setKeyHealth({ status: "error", message: res.message });
        return;
      }
      await onSaveApiKey();
      setKeyHealth({ status: "idle" });
    } catch {
      setKeyHealth({ status: "error", message: "Could not save. Please try again." });
    }
  }

  function handleProviderChange(providerKey: string) {
    const provider = providers.find((p) => p.key === providerKey);
    const preferred = PROVIDER_DEFAULT_MODEL[providerKey];
    const modelExists = provider?.models.some((m) => m.key === preferred);
    setKeyHealth({ status: "idle" });
    onUpdate({
      ...data,
      ai_provider: providerKey,
      ai_default_model: modelExists ? preferred : (provider?.models[0]?.key ?? ""),
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
          {(() => {
            const hint = RESPONSE_LENGTH_HINTS[data.ai_response_length];
            return (
              <p className={`rl-hint ${COST_LEVEL_CLASS[hint.level]}`}>
                <span className="rl-hint__badge me-2">{hint.label}</span>
                <span className="rl-hint__desc">{hint.desc}</span>
              </p>
            );
          })()}
        </div>

        <FieldRow label="Personality" hint="Tone and style of AI replies" className="pb-0">
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

      <div className="st-toggle-group">
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

        <FieldRow
          label="Model"
          hint={
            health.status === "error"
              ? <span className="st-health-error">{health.message}</span>
              : "Specific model used for all responses"
          }
          className="pb-0"
        >
          <div className="st-model-wrap">
            {health.status === "checking" && (
              <span className="st-model-spinner" aria-hidden="true" />
            )}
            {health.status === "ok" && (
              <CheckCircleFill
                className={`st-model-tick${tickFading ? " st-model-tick--fading" : ""}`}
                aria-hidden="true"
                size={16}
              />
            )}
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
          </div>
        </FieldRow>
      </div>

      <div className="st-toggle-group">
        <span className="st-group-label">Advanced</span>

        <div className="st-memory-block">
          <ToggleRow
            label="Use my own API key"
            description={`Provide your own ${activeProvider?.name ?? data.ai_provider} API key instead of the shared one.`}
            checked={data.custom_api_key_enabled}
            onChange={(v) => {
              set("custom_api_key_enabled", v);
              setKeyHealth({ status: "idle" });
              if (!v) void onClearApiKey();
            }}
          />

          {data.custom_api_key_enabled && (
            <div className="st-custom-key-block">
              <div className="st-custom-key-input-wrap">
                <div className="st-custom-key-input-inner">
                  <input
                    type={showKey ? "text" : "password"}
                    className="form-control form-control-sm st-custom-key-input"
                    placeholder={
                      data.custom_api_key_saved && !data.custom_api_key
                        ? "Key saved — paste a new one to replace"
                        : `Paste your ${activeProvider?.name ?? data.ai_provider} API key…`
                    }
                    value={data.custom_api_key}
                    onChange={(e) => {
                      set("custom_api_key", e.target.value);
                      setKeyHealth({ status: "idle" });
                    }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="st-custom-key-eye"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                  >
                    {showKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {(data.custom_api_key.trim() || keyHealth.status === "checking") && (
                  <button
                    type="button"
                    className="st-custom-key-test"
                    onClick={() => void handleSaveKey()}
                    disabled={keyHealth.status === "checking"}
                    aria-label="Save API key"
                    title="Test and save API key"
                  >
                    {keyHealth.status === "checking" ? (
                      <span className="st-custom-key-spinner" role="status" aria-label="Saving">
                        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                      </span>
                    ) : (
                      <Floppy size={14} />
                    )}
                  </button>
                )}
              </div>

              {keyHealth.status === "error" && (
                <div className="st-custom-key-footer">
                  <span className="st-health-error st-custom-key-msg">{keyHealth.message}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
