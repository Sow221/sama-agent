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

export const DOCUMENT_STATUS_LABEL = {
  MISSING: "À fournir",
  PROVIDED: "Reçu, analyse en cours",
  ANALYZED: "Analysé",
  NEEDS_REVIEW: "À vérifier par le service",
  UNEXPECTED: "Ne correspond pas",
  UNKNOWN: "Indéterminé",
} as const;
export type DocumentStatusLabel = keyof typeof DOCUMENT_STATUS_LABEL;
export type DocumentStatusLabelValue = (typeof DOCUMENT_STATUS_LABEL)[DocumentStatusLabel];

export const JOURNEY_STATUS_LABEL = {
  NOT_STARTED: "Pas encore commencé",
  IN_PROGRESS: "En cours de préparation",
  NEEDS_INFORMATION: "Il manque une information",
  NEEDS_DOCUMENT: "Il manque une pièce",
  NEEDS_REVIEW: "Vérification nécessaire",
  READY_FOR_NEXT_STEP: "Prêt pour la suite",
  OUT_OF_SCOPE: "Hors périmètre de cet assistant",
} as const;
export type JourneyStatusLabel = keyof typeof JOURNEY_STATUS_LABEL;
export type JourneyStatusLabelValue = (typeof JOURNEY_STATUS_LABEL)[JourneyStatusLabel];

export const NEXT_ACTION = ["PROVIDE_DOCUMENT", "REVIEW_DOCUMENT", "READ_INFORMATION", "CONTACT_SERVICE", "CLARIFY", "PROVIDE_PHOTOS"] as const;
export type NEXT_ACTION = (typeof NEXT_ACTION)[number];

export const NEXT_ACTION_LABEL = {
  PROVIDE_DOCUMENT: "Fournir un document",
  PROVIDE_PHOTOS: "Fournir les photographies",
  REVIEW_DOCUMENT: "Vérifier un document",
  READ_INFORMATION: "Lire les informations",
  CONTACT_SERVICE: "Contacter le service",
  CLARIFY: "Préciser la demande",
} as const;
export type NextActionLabel = keyof typeof NEXT_ACTION_LABEL;
export type NextActionLabelValue = (typeof NEXT_ACTION_LABEL)[NextActionLabel];

export const NEXT_ACTION_REASON = {
  PROVIDE_DOCUMENT: "Cette exigence est encore manquante : fournissez le document pour continuer.",
  PROVIDE_PHOTOS: "Les photographies exigées sont encore manquantes : ajoutez-les pour continuer.",
  REVIEW_DOCUMENT: "Un document analysé nécessite une vérification manuelle.",
  READ_INFORMATION: "Lisez les informations pour comprendre la démarche.",
  CONTACT_SERVICE: "Toutes les exigences sont fournies : contactez le service CAPP.",
  CLARIFY: "La demande nécessite une précision.",
} as const;
export type NextActionReason = keyof typeof NEXT_ACTION_REASON;
export type NextActionReasonValue = (typeof NEXT_ACTION_REASON)[NextActionReason];

export const DOCUMENT_TYPE = ["identity_document", "medical_certificate", "photo"] as const;
export type DOCUMENT_TYPE = (typeof DOCUMENT_TYPE)[number];
