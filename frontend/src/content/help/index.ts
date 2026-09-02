import { ABOUT_SYSTEM, ADMIN_NOTE } from "./common";
import { DPK_STEPS } from "./dpk";
import { DPF_STEPS } from "./dpf";
import { DPA_STEPS } from "./dpa";
import { FAQ } from "./faq";
import { GLOSSARY } from "./glossary";
import type { FaqItem, HelpContent } from "./types";

function faqForRole(role: string): FaqItem[] {
  return FAQ.filter(
    (item) => !item.roles || item.roles.includes(role)
  );
}

export function getHelpContent(role: string, shell: string): HelpContent {
  if (shell === "admin") {
    return {
      roleLabel: "Администратор",
      about: ABOUT_SYSTEM,
      workflowTitle: "",
      steps: [],
      glossary: GLOSSARY,
      faq: faqForRole("admin"),
      adminNote: ADMIN_NOTE,
    };
  }

  switch (role) {
    case "dpk":
      return {
        roleLabel: "Дежурный по курсу (ДПК)",
        about: ABOUT_SYSTEM,
        workflowTitle: "Ваш рабочий день",
        steps: DPK_STEPS,
        glossary: GLOSSARY,
        faq: faqForRole("dpk"),
      };
    case "dpf":
      return {
        roleLabel: "Дежурный по факультету (ДПФ)",
        about: ABOUT_SYSTEM,
        workflowTitle: "Ваш рабочий день",
        steps: DPF_STEPS,
        glossary: GLOSSARY,
        faq: faqForRole("dpf"),
      };
    case "dpa":
      return {
        roleLabel: "Дежурный по академии (ДПА)",
        about: ABOUT_SYSTEM,
        workflowTitle: "Ваш рабочий день",
        steps: DPA_STEPS,
        glossary: GLOSSARY,
        faq: faqForRole("dpa"),
      };
    default:
      return {
        roleLabel: "Пользователь",
        about: ABOUT_SYSTEM,
        workflowTitle: "",
        steps: [],
        glossary: GLOSSARY,
        faq: FAQ,
      };
  }
}

export type { HelpContent, HelpStep, HelpSection, GlossaryItem, FaqItem } from "./types";
