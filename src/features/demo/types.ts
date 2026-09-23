/**
 * Local-only types for the public interactive demo (Milestone 2). This
 * feature never imports from the real widget/inbox/leads features and
 * never calls Supabase — see src/features/demo/scenarios.ts for the
 * isolation rationale.
 */

export type KnowledgeBaseEntry = {
  id: string;
  topic: string;
  /** Exact wording shown on the suggested-question chip for this entry. */
  sampleQuestion: string;
  /** Lowercase keywords/phrases that make a typed message match this entry. */
  keywords: string[];
  answer: string;
};

export type DemoBusiness = {
  id: string;
  categoryLabel: string;
  name: string;
  initials: string;
  greeting: string;
  tone: string;
  responseLength: string;
  handoffPolicy: string;
  knowledgeBase: KnowledgeBaseEntry[];
  /** ids into knowledgeBase — the two chips shown alongside "Talk to a person". */
  chipQuestionIds: [string, string];
  /** A guaranteed-unmatched example question, surfaced as a hint for visitors and used by tests to exercise the no-match state deterministically. */
  noMatchExample: string;
};

export type MatchResult =
  | { kind: 'answer'; entry: KnowledgeBaseEntry }
  | { kind: 'handoff' }
  | { kind: 'no-match' };

export type DemoMessage =
  | { id: string; kind: 'visitor'; text: string; status: 'sending' | 'sent' | 'failed' }
  | { id: string; kind: 'receptionist'; text: string; sourceTopic?: string }
  | { id: string; kind: 'no-match-prompt'; text: string; resolved: boolean }
  | { id: string; kind: 'handoff-banner' }
  | { id: string; kind: 'lead-form' }
  | { id: string; kind: 'lead-captured'; name: string; email: string };

export type DemoPhase = 'selector' | 'chat' | 'handoff-outcome';

export type DemoState = {
  phase: DemoPhase;
  selectedBusinessId: string | null;
  messages: DemoMessage[];
  /** The visitor message currently awaiting a scripted reply — its presence drives the typing indicator. */
  pending: { messageId: string; text: string } | null;
  leadCaptured: boolean;
  handoffOccurred: boolean;
  answeredTopics: string[];
  lastVisitorQuestion: string;
};
