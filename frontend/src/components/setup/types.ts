export type SetupProfile = 'empty' | 'express' | 'demo';
export type ServiceModel = 'qsr' | 'finedine';

export const SETUP_STEP_COUNT = 6;

export const SETUP_STEP_KEYS = [
  'setup.stepLocale',
  'setup.stepPin',
  'setup.stepOwner',
  'setup.stepData',
  'setup.stepCloud',
  'setup.stepFlow',
] as const;
