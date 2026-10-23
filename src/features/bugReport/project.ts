// Which mod sends the bug reports. MG-mod changes this one line: its id is
// "mg-mod", its name "Arie's Mod (Full)".

import type { BugReportProject } from "../../lib/bugReport/types";

export const BUG_REPORT_PROJECT = { id: "aries-mod", name: "Arie's Mod" } as const satisfies { id: BugReportProject; name: string };
