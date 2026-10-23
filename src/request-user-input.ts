import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type {
	ExtensionAPI,
	ExtensionContext,
	ExtensionUIDialogOptions,
	ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import { RequestUserInputSchema } from "./schemas";
import type {
	NormalizedRequestUserInputQuestion,
	RequestUserInputAnswer,
	RequestUserInputDetails,
	RequestUserInputQuestion,
	RequestUserInputQuestionResponse,
	RequestUserInputResponse,
} from "./types";

export type { RequestUserInputQuestionResponse } from "./types";

export const REQUEST_USER_INPUT_TOOL_NAME = "request_user_input";

// Pi assumes that RPC mode has a UI. Hosts that run Pi in RPC mode without one set this to "1".
export const NONINTERACTIVE_ENV_VAR = "PI_REQUEST_USER_INPUT_NONINTERACTIVE";

const NO_UI_ERROR =
	"request_user_input requires UI support. No person can answer questions in this session; " +
	"continue without asking and state the assumptions you make.";

function canAskUser(ctx: ExtensionContext): boolean {
	return ctx.hasUI && process.env[NONINTERACTIVE_ENV_VAR] !== "1";
}

function createText(text: string) {
	return new Text(text, 0, 0);
}

export function normalizeRequestUserInputQuestions(
	rawQuestions: RequestUserInputQuestion[],
): { questions: NormalizedRequestUserInputQuestion[] } | { error: string } {
	const questions: NormalizedRequestUserInputQuestion[] = rawQuestions.map((question) => ({
		...question,
		id: question.id.trim(),
		options: question.options ?? [],
	}));

	for (const question of questions) {
		if (!question.id) {
			return { error: "request_user_input question ids must be non-empty." };
		}
	}

	const seen = new Set<string>();
	for (const question of questions) {
		if (seen.has(question.id)) {
			return {
				error: `request_user_input question ids must be unique. Duplicate id: ${question.id}`,
			};
		}
		seen.add(question.id);
	}

	return { questions };
}

export function buildRequestUserInputAnswer(
	question: NormalizedRequestUserInputQuestion,
	response: RequestUserInputQuestionResponse,
): RequestUserInputAnswer {
	const hasOptions = question.options.length > 0;
	const otherIndex = question.options.length;
	const trimmed = response.customText.trim();

	if (!hasOptions) {
		if (trimmed.length === 0) {
			return { answers: [] };
		}

		return { answers: [`user_note: ${trimmed}`] };
	}

	if (response.selectedOptionIndex === otherIndex) {
		if (trimmed.length === 0) {
			return { answers: [] };
		}

		return { answers: ["Other", `user_note: ${trimmed}`] };
	}

	const label = question.options[response.selectedOptionIndex]?.label;
	if (!label) {
		return { answers: [] };
	}

	return { answers: [label] };
}

export function buildRequestUserInputResponse(
	questions: NormalizedRequestUserInputQuestion[],
	responses: RequestUserInputQuestionResponse[],
): RequestUserInputResponse {
	const answers: Array<[string, RequestUserInputAnswer]> = [];
	for (const [index, question] of questions.entries()) {
		const response = responses[index];
		if (!response) {
			throw new Error(`Missing response for request_user_input question: ${question.id}`);
		}
		answers.push([question.id, buildRequestUserInputAnswer(question, response)]);
	}
	return { answers: Object.fromEntries(answers) };
}

export function summarizeRequestUserInputAnswer(answer: RequestUserInputAnswer | undefined): string {
	const entries = answer?.answers ?? [];
	if (entries.length === 0) {
		return "(no answer)";
	}

	const notes = entries
		.filter((entry) => entry.startsWith("user_note: "))
		.map((entry) => entry.slice("user_note: ".length).trim())
		.filter((entry) => entry.length > 0);
	const selected = entries
		.filter((entry) => !entry.startsWith("user_note: "))
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	if (selected.length === 0 && notes.length > 0) {
		return notes.join(" · ");
	}

	if (selected.length > 0 && notes.length > 0) {
		return `${selected.join(", ")} (${notes.join(" · ")})`;
	}

	return selected.join(", ") || "(no answer)";
}

export function buildRequestUserInputSummary(details: RequestUserInputDetails): string {
	const lines: string[] = [];
	for (const [index, question] of details.questions.entries()) {
		const answer = details.response.answers[question.id];
		lines.push(`${index + 1}. ${question.question}`);
		lines.push(`   Answer: ${summarizeRequestUserInputAnswer(answer)}`);
	}
	return lines.join("\n");
}

export function buildRequestUserInputDialogTitle(question: NormalizedRequestUserInputQuestion): string {
	const header = question.header?.trim();
	const prompt = question.question.trim();
	if (!header || header === prompt) {
		return prompt || question.question;
	}
	return `${header}\n${prompt || question.question}`;
}

function buildDialogOptions(signal: AbortSignal | undefined): ExtensionUIDialogOptions | undefined {
	return signal ? { signal } : undefined;
}

async function requestInputDialog(
	ctx: ExtensionContext,
	title: string,
	placeholder: string,
	signal: AbortSignal | undefined,
): Promise<string | undefined> {
	const options = buildDialogOptions(signal);
	if (options) {
		return ctx.ui.input(title, placeholder, options);
	}
	return ctx.ui.input(title, placeholder);
}

async function requestSelectDialog(
	ctx: ExtensionContext,
	title: string,
	labels: string[],
	signal: AbortSignal | undefined,
): Promise<string | undefined> {
	const options = buildDialogOptions(signal);
	if (options) {
		return ctx.ui.select(title, labels, options);
	}
	return ctx.ui.select(title, labels);
}

export async function collectSingleRequestUserInputAnswer(
	ctx: ExtensionContext,
	question: NormalizedRequestUserInputQuestion,
	signal?: AbortSignal,
): Promise<RequestUserInputQuestionResponse | null> {
	const title = buildRequestUserInputDialogTitle(question);

	if (question.options.length === 0) {
		const value = await requestInputDialog(ctx, title, question.question, signal);
		if (value === undefined) {
			return null;
		}

		return {
			selectedOptionIndex: 0,
			customText: value,
			selectionTouched: value.trim().length > 0,
			committed: true,
		};
	}

	const labels = [
		...question.options.map((option, index) => `${index + 1}. ${option.label}`),
		`${question.options.length + 1}. Other (type your own answer)`,
	];
	const selected = await requestSelectDialog(ctx, title, labels, signal);
	if (selected === undefined) {
		return null;
	}

	const selectedOptionIndex = labels.indexOf(selected);
	if (selectedOptionIndex < 0) {
		return null;
	}

	if (selectedOptionIndex === question.options.length) {
		const value = await requestInputDialog(ctx, `${title}\nOther answer`, "Type your answer", signal);
		if (value === undefined) {
			return null;
		}

		return {
			selectedOptionIndex,
			customText: value,
			selectionTouched: value.trim().length > 0,
			committed: true,
		};
	}

	return {
		selectedOptionIndex,
		customText: "",
		selectionTouched: true,
		committed: true,
	};
}

export async function collectRequestUserInputAnswers(
	ctx: ExtensionContext,
	questions: NormalizedRequestUserInputQuestion[],
	signal?: AbortSignal,
): Promise<RequestUserInputResponse | null> {
	const responses: RequestUserInputQuestionResponse[] = [];

	for (const question of questions) {
		const response = await collectSingleRequestUserInputAnswer(ctx, question, signal);
		if (!response) {
			return null;
		}
		responses.push(response);
	}

	return buildRequestUserInputResponse(questions, responses);
}

export type RequestUserInputTool = ToolDefinition<typeof RequestUserInputSchema, RequestUserInputDetails>;

export function createRequestUserInputTool(): RequestUserInputTool {
	return {
		description: "Request user input for one to three short questions and wait for the response.",
		async execute(
			_toolCallId,
			params,
			signal,
			_onUpdate,
			ctx,
		): Promise<AgentToolResult<RequestUserInputDetails>> {
			if (!canAskUser(ctx)) {
				throw new Error(NO_UI_ERROR);
			}

			const normalized = normalizeRequestUserInputQuestions(params.questions);
			if ("error" in normalized) {
				throw new Error(normalized.error);
			}

			const response = await collectRequestUserInputAnswers(ctx, normalized.questions, signal);
			if (!response) {
				if (signal?.aborted) {
					throw new Error("request_user_input was aborted");
				}
				throw new Error("request_user_input was cancelled by the user");
			}

			const details: RequestUserInputDetails = {
				questions: normalized.questions,
				response,
			};
			return {
				content: [
					{
						type: "text",
						text: buildRequestUserInputSummary(details),
					},
				],
				details,
			};
		},
		label: REQUEST_USER_INPUT_TOOL_NAME,
		name: REQUEST_USER_INPUT_TOOL_NAME,
		parameters: RequestUserInputSchema,
		annotations: {
			readOnlyHint: true,
		},
		exposure: "model-only",
		renderCall(args, theme) {
			const questions = args.questions.length;
			const label = `${questions} question${questions === 1 ? "" : "s"}`;
			return createText(
				`${theme.fg("toolTitle", theme.bold("request_user_input "))}${theme.fg("muted", label)}`,
			);
		},
		renderResult(result, { isPartial }, theme) {
			if (isPartial) {
				return createText(theme.fg("muted", "Waiting for user input..."));
			}

			const details: RequestUserInputDetails | undefined = result.details;
			if (!details) {
				const text = result.content.find((item) => item.type === "text");
				return createText(text?.type === "text" ? text.text : "(no output)");
			}

			const lines: string[] = [];
			for (const [index, question] of details.questions.entries()) {
				const answer = summarizeRequestUserInputAnswer(details.response.answers[question.id]);
				lines.push(`${theme.fg("accent", `${index + 1}.`)} ${question.question}`);
				if (answer === "(no answer)") {
					lines.push(`   ${theme.fg("muted", "Answer:")} ${theme.fg("warning", answer)}`);
				} else {
					lines.push(`   ${theme.fg("muted", "Answer:")} ${answer}`);
				}
			}

			return createText(lines.join("\n"));
		},
	};
}

export function registerRequestUserInputTool(pi: ExtensionAPI): RequestUserInputTool {
	const tool = createRequestUserInputTool();
	pi.registerTool(tool);
	return tool;
}
