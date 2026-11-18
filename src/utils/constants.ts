/** Speed options with labels and descriptions for detailed UI (e.g. bottom sheets). */
export const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x', description: 'Half speed' },
  { value: 0.75, label: '0.75x', description: 'Slower' },
  { value: 1, label: '1x', description: 'Normal' },
  { value: 1.25, label: '1.25x', description: 'Slightly faster' },
  { value: 1.5, label: '1.5x', description: 'Faster' },
  { value: 1.75, label: '1.75x', description: 'Much faster' },
  { value: 2, label: '2x', description: 'Double speed' },
] as const;

/** Simple speed values for compact UI (e.g. dropdown menus). */
export const SPEED_VALUES = SPEED_OPTIONS.map((o) => o.value);

/** One seek step, used by every seek control (desktop, phone, Full Audio, keyboard, media keys). */
export const SEEK_STEP_SECONDS = 10;
