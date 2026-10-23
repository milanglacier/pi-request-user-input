import type { ExtensionCommandContext, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const scratch = mkdtempSync(join(tmpdir(), "pi-request-user-input-harness-"));
const runtime = await ModelRuntime.create({
	allowModelNetwork: false,
	authPath: join(scratch, "auth.json"),
	modelsPath: null,
	modelsStorePath: join(scratch, "models.json"),
	refreshOnCreate: false,
});
const modelRegistry = new ModelRegistry(runtime);
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

export type TestContext = ExtensionToolContext;
export type ContextOverrides = Partial<Omit<TestContext, "ui" | "sessionManager">> & {
	ui?: Partial<TestContext["ui"]>;
	sessionManager?: Partial<TestContext["sessionManager"]>;
};

export function unsupported(name: string): never {
	throw new Error(`The request_user_input test harness does not implement ${name}.`);
}

export function createContext(overrides: ContextOverrides = {}): TestContext {
	const sessionManager: TestContext["sessionManager"] = {
		buildContextEntries: () => [],
		buildSessionProjection: () => ({ entries: [], messages: [], thinkingLevel: "off", model: null }),
		getBranch: () => [],
		getCwd: () => "/tmp",
		getEntries: () => [],
		getEntry: () => undefined,
		getHeader: () => null,
		getLabel: () => undefined,
		getLeafEntry: () => undefined,
		getLeafId: () => "leaf-1",
		getSessionDir: () => "/tmp",
		getSessionFile: () => undefined,
		getSessionId: () => "session-1",
		getSessionName: () => "",
		getTree: () => [],
		...overrides.sessionManager,
	};
	const ui: TestContext["ui"] = {
		get theme() {
			return unsupported("ui.theme");
		},
		addAutocompleteProvider() {},
		confirm: async () => true,
		custom: async () => unsupported("ui.custom"),
		editor: async () => undefined,
		getAllThemes: () => [],
		getEditorComponent: () => undefined,
		getEditorText: () => "",
		getTheme: () => undefined,
		getToolsExpanded: () => false,
		input: async () => undefined,
		notify() {},
		onTerminalInput: () => () => {},
		pasteToEditor() {},
		select: async () => undefined,
		setEditorComponent() {},
		setEditorText() {},
		setFooter() {},
		setHeader() {},
		setHiddenThinkingLabel() {},
		setStatus() {},
		setTheme: () => ({ success: true }),
		setTitle() {},
		setToolsExpanded() {},
		setWidget() {},
		setWorkingIndicator() {},
		setWorkingMessage() {},
		setWorkingVisible() {},
		...overrides.ui,
	};
	const ctx: TestContext = {
		cwd: process.cwd(),
		mode: "tui",
		hasUI: true,
		model: undefined,
		scopedModels: [],
		signal: undefined,
		modelRegistry,
		abort() {},
		shutdown() {},
		getContextUsage: () => undefined,
		compact() {},
		getSystemPrompt: () => "",
		isIdle: () => true,
		isProjectTrusted: () => true,
		hasPendingMessages: () => false,
		tools: [],
		executeTool: async () => unsupported("executeTool"),
		...overrides,
		ui,
		sessionManager,
	};
	// Theme access must be explicit; spreading a partial UI should not lose the rest of the contract.
	Object.defineProperty(ui, "theme", { enumerable: false });
	return ctx;
}

export function createCommandContext(overrides: ContextOverrides = {}): ExtensionCommandContext {
	return {
		...createContext(overrides),
		getSystemPromptOptions: () => unsupported("getSystemPromptOptions"),
		waitForIdle: async () => {},
		newSession: async () => unsupported("newSession"),
		fork: async () => unsupported("fork"),
		navigateTree: async () => unsupported("navigateTree"),
		switchSession: async () => unsupported("switchSession"),
		reload: async () => unsupported("reload"),
	};
}
