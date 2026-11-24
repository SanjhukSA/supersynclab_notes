import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  useLLMSettings,
  useTestConnection,
  useUpdateLLMSettings,
} from "./useSettings";
import { CornerFlourish } from "@/components/editorial/CornerFlourish";
import { OrnamentalDivider } from "@/components/editorial/OrnamentalDivider";
import type { LLMProvider, TestConnectionResult } from "@/types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ProviderOption {
  id: LLMProvider;
  name: string;
  badge: string;
  defaultModel: string;
  models: { id: string; label: string; desc: string }[];
  keyPlaceholder: string;
  keyUrl: string;
  urlLabel: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "Free Tier Available",
    defaultModel: "gemini-1.5-flash-latest",
    models: [
      {
        id: "gemini-1.5-flash-latest",
        label: "Gemini 1.5 Flash (Latest)",
        desc: "Fast, cost-effective multimodal reasoning (Recommended)",
      },
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        desc: "Next-gen ultra fast multimodal model with real-time speed",
      },
      {
        id: "gemini-1.5-pro-latest",
        label: "Gemini 1.5 Pro (Latest)",
        desc: "Complex academic reasoning, long-context notes, and derivations",
      },
      {
        id: "gemini-1.5-flash-002",
        label: "Gemini 1.5 Flash (002)",
        desc: "High stability pinned production release",
      },
    ],
    keyPlaceholder: "AIzaSy...",
    keyUrl: "https://aistudio.google.com/app/apikey",
    urlLabel: "Get Gemini API Key from Google AI Studio",
  },
  {
    id: "openai",
    name: "OpenAI (ChatGPT)",
    badge: "GPT-4o Models",
    defaultModel: "gpt-4o-mini",
    models: [
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        desc: "Fast, highly intelligent, budget-friendly (Recommended)",
      },
      {
        id: "gpt-4o",
        label: "GPT-4o",
        desc: "Flagship multi-modal high-intelligence model",
      },
    ],
    keyPlaceholder: "sk-proj-...",
    keyUrl: "https://platform.openai.com/api-keys",
    urlLabel: "Get OpenAI API Key from OpenAI Platform",
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    badge: "Claude 3.5 Models",
    defaultModel: "claude-3-5-haiku-20241022",
    models: [
      {
        id: "claude-3-5-haiku-20241022",
        label: "Claude 3.5 Haiku",
        desc: "Ultra-fast, concise, and articulate (Recommended)",
      },
      {
        id: "claude-3-5-sonnet-20241022",
        label: "Claude 3.5 Sonnet",
        desc: "Premier analytical reasoning, prose, and formula clarity",
      },
    ],
    keyPlaceholder: "sk-ant-...",
    keyUrl: "https://console.anthropic.com/settings/keys",
    urlLabel: "Get Anthropic API Key from Anthropic Console",
  },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { data: serverSettings } = useLLMSettings();
  const updateSettingsMutation = useUpdateLLMSettings();
  const testConnectionMutation = useTestConnection();

  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>("gemini");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-1.5-flash-latest");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  // Sync state when modal opens or server settings load
  useEffect(() => {
    if (isOpen) {
      const activeP = (localStorage.getItem("supernotes_llm_provider") ||
        serverSettings?.active_provider ||
        "gemini") as LLMProvider;
      let activeM =
        localStorage.getItem("supernotes_llm_model") ||
        serverSettings?.active_model ||
        PROVIDERS.find((p) => p.id === activeP)?.defaultModel ||
        "gemini-1.5-flash-latest";

      // Automatically migrate deprecated alias
      if (activeM === "gemini-1.5-flash") {
        activeM = "gemini-1.5-flash-latest";
      }

      const savedKey = localStorage.getItem("supernotes_llm_key") || "";

      setSelectedProvider(activeP);
      setSelectedModel(activeM);
      setApiKeyInput(savedKey);
      setTestResult(null);
      setSaveSuccess(false);
    }
  }, [isOpen, serverSettings]);

  if (!isOpen) return null;

  const currentProviderConfig =
    PROVIDERS.find((p) => p.id === selectedProvider) || PROVIDERS[0]!;

  const handleProviderChange = (pId: LLMProvider) => {
    setSelectedProvider(pId);
    const target = PROVIDERS.find((p) => p.id === pId);
    setSelectedModel(target?.defaultModel || "");
    // Check if a key was previously saved for this provider in localStorage
    const saved = localStorage.getItem("supernotes_llm_key") || "";
    // If the saved key doesn't match this provider's prefix format, clear input for new entry
    if (pId === "openai" && !saved.startsWith("sk-")) {
      setApiKeyInput("");
    } else if (pId === "anthropic" && !saved.startsWith("sk-ant")) {
      setApiKeyInput("");
    }
    setTestResult(null);
  };

  const handleSave = async () => {
    try {
      await updateSettingsMutation.mutateAsync({
        provider: selectedProvider,
        model: selectedModel,
        apiKey: apiKeyInput.trim() || undefined,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to save settings:", err);
    }
  };

  const handleTestConnection = async () => {
    if (!apiKeyInput.trim()) {
      alert("Please enter an API key to test connection.");
      return;
    }
    setTestResult(null);
    try {
      const res = await testConnectionMutation.mutateAsync({
        provider: selectedProvider,
        apiKey: apiKeyInput.trim(),
        model: selectedModel,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        provider: selectedProvider,
        error: err instanceof Error ? err.message : "Connection failed",
      });
    }
  };

  const handleResetToDefault = async () => {
    if (confirm("Reset to default server settings (Google Gemini)?")) {
      await updateSettingsMutation.mutateAsync({
        provider: "gemini",
        model: "gemini-1.5-flash-latest",
        apiKey: "RESET",
      });
      setSelectedProvider("gemini");
      setSelectedModel("gemini-1.5-flash-latest");
      setApiKeyInput("");
      setTestResult(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border border-border bg-bg-surface p-6 shadow-2xl transition-all max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <CornerFlourish size={14} />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-text-primary">
                Settings
              </h3>
              <p className="text-xs text-text-muted">
                Configure your API keys for ChatGPT, Claude, or Google Gemini.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg-raised hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-5 space-y-5">
          {/* Provider Selection Grid */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
              Select AI Provider
            </label>
            <div className="grid grid-cols-3 gap-3">
              {PROVIDERS.map((p) => {
                const isSelected = selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id)}
                    className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer shadow-2xs ${
                      isSelected
                        ? "border-accent-primary bg-accent-primary/10 text-text-primary ring-1 ring-accent-primary"
                        : "border-border bg-bg-base/60 text-text-muted hover:border-accent-primary/50 hover:text-text-primary"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="font-serif text-sm font-bold text-text-primary">
                        {p.name}
                      </span>
                      {isSelected && (
                        <Check className="h-4 w-4 text-accent-primary" />
                      )}
                    </div>
                    <span className="mt-1 text-[10px] font-mono rounded bg-bg-raised/80 px-1.5 py-0.5 text-text-muted border border-border">
                      {p.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <OrnamentalDivider variant="diamond" className="my-1 opacity-40" />

          {/* Model Selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
              Target Model
            </label>
            <div className="grid gap-2">
              {currentProviderConfig.models.map((m) => {
                const isSelected = selectedModel === m.id;
                return (
                  <label
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={`flex items-center justify-between p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "border-accent-primary/60 bg-accent-primary/5 text-text-primary"
                        : "border-border bg-bg-base/40 text-text-secondary hover:border-border/80"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{m.label}</span>
                      <span className="text-[11px] text-text-muted mt-0.5">{m.desc}</span>
                    </div>
                    <input
                      type="radio"
                      name="model-select"
                      checked={isSelected}
                      onChange={() => setSelectedModel(m.id)}
                      className="accent-accent-primary h-4 w-4"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* API Key Input */}
          <div className="rounded-xl border border-border bg-bg-base/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent-highlight" />
                <span>{currentProviderConfig.name} API Key</span>
              </label>

              <a
                href={currentProviderConfig.keyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-accent-primary hover:underline inline-flex items-center gap-1"
              >
                <span>{currentProviderConfig.urlLabel}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="relative flex items-center">
              <input
                type={showKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={`Paste your ${currentProviderConfig.name} key (${currentProviderConfig.keyPlaceholder})`}
                className="w-full rounded-lg border border-border bg-bg-surface px-3 py-2 pr-20 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-accent-primary focus:outline-none"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                  title={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <p className="text-[11px] leading-relaxed text-text-muted">
              Keys are encrypted in transit and stored locally or attached to your profile.
              Leaving this empty uses the server default key (if configured in .env).
            </p>

            {/* Test Connection Probe Button & Status */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!apiKeyInput.trim() || testConnectionMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-raised px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover disabled:opacity-40 transition-colors cursor-pointer"
              >
                {testConnectionMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Testing...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5 text-accent-primary" />
                    <span>Test Connection</span>
                  </>
                )}
              </button>

              {testResult && (
                <div
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs ${
                    testResult.success
                      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30"
                      : "bg-crimson/10 text-crimson dark:text-rose-300 border border-crimson/30"
                  }`}
                >
                  {testResult.success ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{testResult.message || "Connected successfully!"}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 text-crimson shrink-0" />
                      <span className="truncate max-w-xs">{testResult.error || "Connection failed."}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset to Server Default</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border bg-bg-raised px-4 py-2 text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-primary px-4 py-2 text-xs font-semibold text-white shadow-xs hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
