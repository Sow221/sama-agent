# GÉNÉRÉ — ne pas éditer (source : packages/shared/enums.json via scripts/gen-enums.mjs)
# ADR-006 : enums canoniques Sama Agent (parité TS ≡ Python ≡ JSON)

from enum import Enum

class Intent(str, Enum):
    driving_license = "driving_license"

class IntentAction(str, Enum):
    new_application = "new_application"
    renewal = "renewal"
    unknown = "unknown"

class Language(str, Enum):
    fr = "fr"
    wo = "wo"

class CandidateType(str, Enum):
    new = "new"
    renewal = "renewal"

class JourneyStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    NEEDS_INFORMATION = "NEEDS_INFORMATION"
    NEEDS_DOCUMENT = "NEEDS_DOCUMENT"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    READY_FOR_NEXT_STEP = "READY_FOR_NEXT_STEP"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"

class DocumentStatus(str, Enum):
    MISSING = "MISSING"
    PROVIDED = "PROVIDED"
    ANALYZED = "ANALYZED"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    UNEXPECTED = "UNEXPECTED"
    UNKNOWN = "UNKNOWN"

class JourneyStatusLabel(str, Enum):
    NOT_STARTED = "Pas encore commencé"
    IN_PROGRESS = "En cours de préparation"
    NEEDS_INFORMATION = "Il manque une information"
    NEEDS_DOCUMENT = "Il manque une pièce"
    NEEDS_REVIEW = "Vérification nécessaire"
    READY_FOR_NEXT_STEP = "Prêt pour la suite"
    OUT_OF_SCOPE = "Hors périmètre de cet assistant"

class NextAction(str, Enum):
    PROVIDE_DOCUMENT = "PROVIDE_DOCUMENT"
    REVIEW_DOCUMENT = "REVIEW_DOCUMENT"
    READ_INFORMATION = "READ_INFORMATION"
    CONTACT_SERVICE = "CONTACT_SERVICE"
    CLARIFY = "CLARIFY"
    PROVIDE_PHOTOS = "PROVIDE_PHOTOS"

class NextActionLabel(str, Enum):
    PROVIDE_DOCUMENT = "Fournir un document"
    PROVIDE_PHOTOS = "Fournir les photographies"
    REVIEW_DOCUMENT = "Vérifier un document"
    READ_INFORMATION = "Lire les informations"
    CONTACT_SERVICE = "Contacter le service"
    CLARIFY = "Préciser la demande"

class NextActionReason(str, Enum):
    PROVIDE_DOCUMENT = "Cette exigence est encore manquante : fournissez le document pour continuer."
    PROVIDE_PHOTOS = "Les photographies exigées sont encore manquantes : ajoutez-les pour continuer."
    REVIEW_DOCUMENT = "Un document analysé nécessite une vérification manuelle."
    READ_INFORMATION = "Lisez les informations pour comprendre la démarche."
    CONTACT_SERVICE = "Toutes les exigences sont fournies : contactez le service CAPP."
    CLARIFY = "La demande nécessite une précision."

class DocumentType(str, Enum):
    identity_document = "identity_document"
    medical_certificate = "medical_certificate"
    photo = "photo"
