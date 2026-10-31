export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  maxInputTokens: number | null;
  maxOutputTokens: number | null;
  inputPrice: string;
  outputPrice: string;
  freeTier: true;
  thinkingLevels: string[];
  category: string;
  featured: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  model?: string;
}

export const THINKING_LABELS: Record<string, string> = {
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function thinkingDefault(model: ModelInfo | undefined): string {
  if (!model?.thinkingLevels.length) return "";
  if (model.thinkingLevels.includes("medium")) return "medium";
  return model.thinkingLevels[0];
}
