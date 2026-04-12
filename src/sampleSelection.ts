export interface SampleSelectionStateInput {
  sampleId: string;
  sampleSource: string;
}

export interface SampleSelectionState {
  selectedId: string;
  source: string;
  transpilerInput: string;
  transpilerStatus: string;
}

export function resolveSampleSelectionState(input: SampleSelectionStateInput): SampleSelectionState {
  return {
    selectedId: input.sampleId,
    source: input.sampleSource,
    transpilerInput: '',
    transpilerStatus: 'Paste or edit a .egg program in the left editor.',
  };
}
