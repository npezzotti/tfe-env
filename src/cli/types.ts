export interface GlobalOptions {
  debug: boolean;
  config?: string;
}

export type ProgressCallback = (message: string) => void;
export type PromptCallback = (question: string) => Promise<string>;
