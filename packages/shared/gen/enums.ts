// GÉNÉRÉ — ne pas éditer (source : packages/shared/enums.json via scripts/gen-enums.mjs)
// ADR-006 : enums canoniques Sama Agent (parité TS ≡ Python ≡ JSON)

export const INTENT = ["driving_license"] as const;
export type INTENT = (typeof INTENT)[number];

export const INTENT_ACTION = ["new_application", "renewal", "unknown"] as const;
export type INTENT_ACTION = (typeof INTENT_ACTION)[number];

export const LANGUAGE = ["fr", "wo"] as const;
export type LANGUAGE = (typeof LANGUAGE)[number];

export const CANDIDATE_TYPE = ["new", "renewal"] as const;
export type CANDIDATE_TYPE = (typeof CANDIDATE_TYPE)[number];

export const JOURNEY_STATUS = ["NOT_STARTED", "IN_PROGRESS", "NEEDS_INFORMATION", "NEEDS_DOCUMENT", "NEEDS_REVIEW", "READY_FOR_NEXT_STEP", "OUT_OF_SCOPE"] as const;
export type JOURNEY_STATUS = (typeof JOURNEY_STATUS)[number];

export const DOCUMENT_STATUS = ["MISSING", "PROVIDED", "ANALYZED", "NEEDS_REVIEW", "UNEXPECTED", "UNKNOWN"] as const;
export type DOCUMENT_STATUS = (typeof DOCUMENT_STATUS)[number];

export const NEXT_ACTION = ["PROVIDE_DOCUMENT", "REVIEW_DOCUMENT", "READ_INFORMATION", "CONTACT_SERVICE", "CLARIFY", "PROVIDE_PHOTOS"] as const;
export type NEXT_ACTION = (typeof NEXT_ACTION)[number];

export const DOCUMENT_TYPE = ["identity_document", "medical_certificate", "photo"] as const;
export type DOCUMENT_TYPE = (typeof DOCUMENT_TYPE)[number];
