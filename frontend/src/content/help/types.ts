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

export interface HelpGuideChapter {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  tips?: string[];
}

export interface HelpContent {
  roleLabel: string;
  about: HelpSection[];
  workflowTitle: string;
  steps: HelpStep[];
  glossary: GlossaryItem[];
  faq: FaqItem[];
  adminNote?: string;
  detailedGuide?: HelpGuideChapter[];
}
