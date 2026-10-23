import { InMemoryCredentialStore, InMemoryModelsStore } from "@earendil-works/pi-ai";
import {
	createAgentSession,
	discoverAndLoadExtensions,
	ModelRuntime,
	SessionManager,
	SettingsManager,
	type ExtensionError,
	type ExtensionUIContext,
	type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

import { createContext } from "./context.js";

export interface ExtensionHarnessOptions {
	cwd: string;
	agentDir: string;
	flag?: string;
	tools?: string[];
	projectTrusted?: boolean;
}

export async function createExtensionHarness(options: ExtensionHarnessOptions) {
	const { cwd, agentDir } = options;
	const entrypoint = fileURLToPath(new URL("../index.ts", import.meta.url));
	const extensionsResult = await discoverAndLoadExtensions([entrypoint], cwd, agentDir);
	if (extensionsResult.errors.length > 0) {
		throw new Error(JSON.stringify(extensionsResult.errors));
	}

	// Supply only this extension and empty resources, without user or ancestor discovery.
	const resourceLoader: ResourceLoader = {
		getExtensions: () => extensionsResult,
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => undefined,
		getSystemPromptSource: () => undefined,
		getAppendSystemPrompt: () => [],
		getAppendSystemPromptSources: () => [],
		extendResources() {},
		reload: async () => {},
	};
	const modelRuntime = await ModelRuntime.create({
		credentials: new InMemoryCredentialStore(),
		modelsStore: new InMemoryModelsStore(),
		modelsPath: null,
		allowModelNetwork: false,
		refreshOnCreate: false,
	});
	const settingsManager = SettingsManager.inMemory(
		{ defaultTools: ["read", "bash"], cacheWarming: "off", compaction: { enabled: false }, retry: { enabled: false } },
		{ projectTrusted: options.projectTrusted ?? true },
	);
	// Commands and lifecycle events need neither credentials nor inference.
	const { session } = await createAgentSession({
		cwd,
		agentDir,
		modelRuntime,
		resourceLoader,
		settingsManager,
		sessionManager: SessionManager.inMemory(cwd),
		...(options.tools === undefined ? {} : { tools: options.tools }),
	});
	const runner = session.extensionRunner;
	if (options.flag !== undefined) {
		runner.setFlagValue("request-user-input", options.flag);
	}
	const notify = vi.fn<ExtensionUIContext["notify"]>();
	const errors: ExtensionError[] = [];
	const uiContext = createContext({ ui: { notify } }).ui;

	return {
		session,
		runner,
		extensionsResult,
		notify,
		errors,
		// bindExtensions dispatches session_start through Pi, including on repeated calls.
		startSession: () => session.bindExtensions({ uiContext, mode: "tui", onError: (error) => errors.push(error) }),
	};
}

export type ExtensionHarness = Awaited<ReturnType<typeof createExtensionHarness>>;
