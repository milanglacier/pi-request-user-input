import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerRequestUserInputTool } from "./src/request-user-input";

export default function (pi: ExtensionAPI): void {
	registerRequestUserInputTool(pi);
}
