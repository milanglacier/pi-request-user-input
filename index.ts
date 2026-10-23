import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerRequestUserInputTool } from "./src/request-user-input";
import { registerRequestUserInputToggle } from "./src/toggle";

export default function (pi: ExtensionAPI): void {
	registerRequestUserInputTool(pi);
	registerRequestUserInputToggle(pi);
}
