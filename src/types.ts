export interface RequestUserInputOption {
	label: string;
	description: string;
}

export interface RequestUserInputQuestion {
	id: string;
	header: string;
	question: string;
	options?: RequestUserInputOption[];
}

export type NormalizedRequestUserInputQuestion = Omit<RequestUserInputQuestion, "options"> & {
	options: RequestUserInputOption[];
};

export interface RequestUserInputAnswer {
	answers: string[];
}

export interface RequestUserInputResponse {
	answers: Record<string, RequestUserInputAnswer>;
}

export interface RequestUserInputDetails {
	questions: NormalizedRequestUserInputQuestion[];
	response: RequestUserInputResponse;
}

export interface RequestUserInputQuestionResponse {
	selectedOptionIndex: number;
	customText: string;
	selectionTouched: boolean;
	committed: boolean;
}
