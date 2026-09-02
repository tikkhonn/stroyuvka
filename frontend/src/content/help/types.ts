export interface HelpStep {
  title: string;
  body: string;
  tip?: string;
}

export interface HelpSection {
  title: string;
  text: string;
}

export interface GlossaryItem {
  term: string;
  definition: string;
}

export interface FaqItem {
  question: string;
  answer: string;
  roles?: string[];
}

export interface HelpContent {
  roleLabel: string;
  about: HelpSection[];
  workflowTitle: string;
  steps: HelpStep[];
  glossary: GlossaryItem[];
  faq: FaqItem[];
  adminNote?: string;
}
