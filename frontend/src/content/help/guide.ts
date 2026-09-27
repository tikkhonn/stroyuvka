import type { HelpGuideChapter } from "./types";
import { DPK_DETAILED_GUIDE } from "./guide-dpk";
import { DPF_DETAILED_GUIDE } from "./guide-dpf";
import { DPA_DETAILED_GUIDE } from "./guide-dpa";

export function getDetailedHelpGuide(role: string): HelpGuideChapter[] | undefined {
  switch (role) {
    case "dpk":
      return DPK_DETAILED_GUIDE;
    case "dpf":
      return DPF_DETAILED_GUIDE;
    case "dpa":
      return DPA_DETAILED_GUIDE;
    default:
      return undefined;
  }
}
