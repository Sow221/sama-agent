/**
 * Contenu éditorial partagé (landing, page Aide publique, Aide dans l'espace).
 * Une seule source : la landing et l'aide ne peuvent pas se contredire.
 * Tout ce qui est écrit ici est vrai de l'application livrée — aucune promesse
 * qui ne soit pas branchée (une seule démarche disponible, par exemple).
 */

export const STEPS = [
  {
    n: 1,
    title: "Comprendre",
    text: "Dites ce que vous voulez faire, en wolof ou en français. L'agent identifie la démarche qui vous correspond.",
  },
  {
    n: 2,
    title: "Préparer",
    text: "Il liste les pièces officielles exigées, chacune avec sa source, et vous montre ce qui manque.",
  },
  {
    n: 3,
    title: "Vérifier",
    text: "Déposez une photo de chaque pièce : l'agent contrôle qu'elle est lisible et qu'elle correspond à ce qui est demandé.",
  },
  {
    n: 4,
    title: "Agir",
    text: "Dossier complet : vous savez où le déposer, avec le récapitulatif de vos pièces.",
  },
] as const;

export const COMMITMENTS = [
  {
    title: "Des sources officielles",
    text: "Chaque pièce demandée renvoie à la source officielle qui la justifie (CAPP Karangë). Rien n'est inventé.",
  },
  {
    title: "Honnête quand il ne sait pas",
    text: "Si une information ne peut pas être confirmée, l'agent vous le dit au lieu de deviner.",
  },
  {
    title: "Vous gardez la main",
    text: "L'agent vous prépare ; le service compétent décide. Une pièce analysée n'est pas une pièce validée officiellement.",
  },
  {
    title: "Vos données sous votre contrôle",
    text: "Votre dossier est lié à votre compte et visible par vous seul. Ce que l'agent retient se consulte et s'oublie en un geste.",
  },
] as const;

export const FAQ = [
  {
    q: "Quelles démarches sont disponibles ?",
    a: "Aujourd'hui, la première demande de permis de conduire, préparée à partir des informations officielles du CAPP Karangë. D'autres démarches suivront.",
  },
  {
    q: "Faut-il parler wolof ?",
    a: "Non. Vous pouvez parler en wolof ou écrire en français. L'agent vous répond à voix haute en wolof, et tout reste lisible en français à l'écran.",
  },
  {
    q: "Comment l'agent sait-il quelles pièces fournir ?",
    a: "Il s'appuie sur la liste officielle des pièces de la démarche. Chaque exigence affiche sa source : vous pouvez toujours vérifier d'où elle vient.",
  },
  {
    q: "Que vérifie l'agent sur mes documents ?",
    a: "Qu'ils sont lisibles et qu'ils correspondent à la pièce demandée. En cas de doute, la pièce est marquée « à vérifier par le service » plutôt que validée.",
  },
  {
    q: "Sama Agent remplace-t-il le guichet ?",
    a: "Non. Il vous aide à arriver au guichet avec un dossier complet et lisible. La décision et la validation officielle restent celles du service compétent.",
  },
  {
    q: "Que deviennent mes informations ?",
    a: "Votre dossier et vos échanges sont liés à votre compte et ne sont visibles que par vous. Ce que l'agent retient de vous se consulte et s'efface depuis la page Mémoire.",
  },
  {
    q: "Faut-il installer une application ?",
    a: "Non. Sama Agent s'ouvre dans le navigateur de votre téléphone ou de votre ordinateur. Vous pouvez l'ajouter à votre écran d'accueil depuis le menu du navigateur.",
  },
] as const;
