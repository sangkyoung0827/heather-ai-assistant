export type HeatherTone = "soft" | "analytical" | "direct";
export type HeatherAIMode = "local_only" | "local_model" | "cloud_allowed";
export type TeachingType =
  | "directive"
  | "preference"
  | "example"
  | "correction"
  | "skill"
  | "boundary_rule";

export type GenerativeToolId =
  | "conversation"
  | "draft_writer"
  | "project_planner"
  | "relationship_analyst"
  | "decision_comparator"
  | "prompt_designer"
  | "image_prompt"
  | "automation_planner";

export type AutomationTriggerType =
  | "manual"
  | "voice"
  | "double_clap"
  | "schedule";

export type AutomationActionType =
  | "open_url"
  | "open_app"
  | "speak"
  | "focus_app"
  | "capture_screen"
  | "clipboard_read"
  | "clipboard_write";

export type MemoryType =
  | "user_profile"
  | "project_context"
  | "relationship_analysis"
  | "writing_preference"
  | "decision_rule"
  | "recurring_task"
  | "important_fact";

export type ProjectStatus = "idea" | "active" | "paused" | "blocked" | "done";
export type ProjectPriority = "low" | "medium" | "high" | "urgent";

export type ConversationRole = "system" | "user" | "assistant";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
  source?: "text" | "voice";
}

export interface Conversation {
  id: string;
  title: string;
  messages: ConversationMessage[];
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
}

export interface ProjectRecord {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  related_people: string[];
  key_links: string[];
  notes: string[];
  decisions: string[];
  next_actions: string[];
  created_at: string;
  updated_at: string;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  content: string;
  source: string;
  confidence: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  archived: boolean;
}

export interface TeachingRecord {
  id: string;
  type: TeachingType;
  title: string;
  content: string;
  source: string;
  confidence: number;
  tags: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GenerativeTool {
  id: GenerativeToolId;
  name: string;
  description: string;
  keywords: string[];
  outputContract: string[];
}

export interface GenerativeRun {
  id: string;
  toolId: GenerativeToolId;
  input: string;
  output: string;
  teachingIds: string[];
  created_at: string;
}

export interface AutomationTrigger {
  type: AutomationTriggerType;
  label: string;
  phrase?: string;
  schedule?: string;
}

export interface AutomationAction {
  id: string;
  type: AutomationActionType;
  label: string;
  value: string;
  enabled: boolean;
  desktopOnly: boolean;
  requiresConfirmation: boolean;
}

export interface AutomationRecipe {
  id: string;
  title: string;
  description: string;
  trigger: AutomationTrigger;
  welcomeMessage: string;
  actions: AutomationAction[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AutomationExecutionStep {
  actionId: string;
  label: string;
  type: AutomationActionType;
  status: "ready" | "webExecutable" | "desktopOnly" | "needsConfirmation" | "disabled";
  reason: string;
}

export interface AutomationPlan {
  recipeId: string;
  title: string;
  triggerLabel: string;
  summary: string;
  steps: AutomationExecutionStep[];
}

export interface HeatherSettings {
  tone: HeatherTone;
  aiMode: HeatherAIMode;
  allowPaidApiCalls: boolean;
  monthlyApiCallLimit: number;
  apiCallsThisMonth: number;
  apiUsageMonth: string;
  cacheResponses: boolean;
  voiceOutputEnabled: boolean;
  voiceName: string;
  memoryEnabled: boolean;
  projectMemoryEnabled: boolean;
  confirmRiskyActions: boolean;
}

export interface ProjectSummary {
  projectPurpose: string;
  currentProgress: string;
  keyPeople: string;
  keyDecisions: string;
  problems: string;
  nextActions: string;
  risks: string;
  heatherJudgment: string;
}

export interface PersonOrgAnalysis {
  visibleBehavior: string;
  actualStructure: string;
  possibleMotives: string;
  userRole: string;
  authorityResponsibilityBalance: string;
  riskSignals: string;
  responseStrategy: string;
}

export interface Briefing {
  todayTasks: string[];
  conversationFollowUps: string[];
  activeProjects: string[];
  importantItems: string[];
  heatherPriority: string;
}

export interface PlatformCapability {
  key: string;
  label: string;
  status: "available" | "desktopOnly" | "notSupported";
  description: string;
}

export interface SafetyRisk {
  level: "low" | "medium" | "high";
  requiresConfirmation: boolean;
  reason: string;
}

export interface ChatRequestPayload {
  message: string;
  conversation?: Conversation;
  settings: HeatherSettings;
  memories: MemoryRecord[];
  projects: ProjectRecord[];
  teachings?: TeachingRecord[];
  automationRecipes?: AutomationRecipe[];
}

export interface ChatResponsePayload {
  message: string;
  title: string;
  risk: SafetyRisk;
  selectedTool?: GenerativeToolId;
  appliedTeachingIds?: string[];
  memorySuggestion?: Omit<MemoryRecord, "id" | "created_at" | "updated_at" | "archived">;
}
