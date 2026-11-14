import agriculture from "../knowledge/agriculture.json";
import {
  detectCrop,
  detectDisease,
  detectIntent,
  detectLanguage,
  detectSeason,
} from "../utils/intentDetector";

type Knowledge = Record<string, Record<string, unknown>>;
const knowledge = agriculture as Knowledge;

const greetings = {
  en: [
    "Hello! I'm your Govi Isuru farming assistant. Ask me about fertilizers, diseases, planting, or harvesting for rice, tea, and chili!",
  ],
  si: [
    "ආයුබෝවන්! මම ඔබේ ගොවි ඉසුරු ගොවිතැන් සහායකයා. වී, තේ සහ මිරිස් සඳහා පොහොර, රෝග, වගා කිරීම හෝ අස්වනු නෙලීම ගැන මගෙන් අහන්න!",
  ],
};

const fallbacks = {
  en: [
    "I'm not sure about that. Could you ask about fertilizers, diseases, planting, or harvesting for rice, tea, or chili?",
  ],
  si: [
    "ඒ ගැන මට විශ්වාස නැත. වී, තේ හෝ මිරිස් සඳහා පොහොර, රෝග, වගා කිරීම හෝ අස්වනු නෙලීම ගැන අහන්න පුළුවන්ද?",
  ],
};

function isGreeting(message: string) {
  const greetingPatterns = ["hello", "hi", "hey", "ayubowan", "ආයුබෝවන්", "help", "start"];
  return greetingPatterns.some((p) => message.toLowerCase().includes(p));
}

function getRandomItem<T>(array: T[]) {
  return array[Math.floor(Math.random() * array.length)];
}

type HistoryMsg = { role: string; content: string; intent?: string };

function extractContextFromHistory(history: HistoryMsg[]) {
  const context = {
    crop: null as string | null,
    season: null as string | null,
    disease: null as string | null,
    lastTopic: null as string | null,
  };
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "user") {
      if (!context.crop) context.crop = detectCrop(msg.content);
      if (!context.season) context.season = detectSeason(msg.content);
      if (!context.disease) context.disease = detectDisease(msg.content);
    }
    if (msg.role === "assistant" && msg.intent && !context.lastTopic) {
      context.lastTopic = msg.intent;
    }
  }
  return context;
}

function isFollowUpQuestion(message: string) {
  const patterns = ["what about", "also", "tell me more", "ඒ ගැන", "තව"];
  return patterns.some((p) => message.toLowerCase().includes(p));
}

export type CropChatBody = {
  message?: string;
  crop?: string;
  season?: string;
  language?: string;
  history?: HistoryMsg[];
};

export function handleCropChat(body: CropChatBody) {
  const { message, crop: userCrop, season: userSeason, language: userLanguage, history } = body;
  if (!message?.trim()) {
    return { status: 400 as const, body: { error: "Message is required" } };
  }

  const language = userLanguage || detectLanguage(message);
  const langKey = language === "si" ? "si" : "en";

  if (isGreeting(message)) {
    return {
      status: 200 as const,
      body: {
        answer: getRandomItem(greetings[langKey]),
        intent: "GREETING",
        source: "Govi Isuru Assistant",
      },
    };
  }

  const historyContext = extractContextFromHistory(history || []);
  const isFollowUp = isFollowUpQuestion(message);
  const currentIntent = detectIntent(message);
  const currentCrop = detectCrop(message);
  const currentSeason = detectSeason(message);
  const currentDisease = detectDisease(message);

  const intent =
    currentIntent !== "UNKNOWN"
      ? currentIntent
      : isFollowUp
        ? historyContext.lastTopic || "UNKNOWN"
        : "UNKNOWN";
  const crop = userCrop || currentCrop || historyContext.crop || "rice";
  const season = userSeason || currentSeason || historyContext.season;
  const specificDisease = currentDisease || historyContext.disease;

  let response: string | null = null;
  let source = "Department of Agriculture Sri Lanka Guidelines";

  const cropKb = knowledge[crop] as Record<string, unknown> | undefined;
  const seasonKey = season || "general";

  try {
    switch (intent) {
      case "FERTILIZER": {
        const seasonNode = cropKb?.[seasonKey] as Record<string, unknown> | undefined;
        const fert = seasonNode?.fertilizer as { si?: string; recommendation?: string } | undefined;
        const generalFert = (cropKb?.general as Record<string, unknown> | undefined)?.fertilizer as
          | { si?: string; recommendation?: string }
          | undefined;
        const pick = fert || generalFert;
        if (pick) response = langKey === "si" ? pick.si || pick.recommendation || null : pick.recommendation || null;
        break;
      }
      case "DISEASE": {
        const diseases = cropKb?.diseases as Record<string, { si?: string; treatment?: string; symptoms?: string }> | undefined;
        if (specificDisease && diseases?.[specificDisease]) {
          const d = diseases[specificDisease];
          response =
            langKey === "si" ? d.si || d.treatment || null : `${d.symptoms || ""} ${d.treatment || ""}`.trim();
        } else if (diseases) {
          const keys = Object.keys(diseases);
          response =
            langKey === "si"
              ? `${keys.length} රෝග හඳුනාගෙන ඇත.`
              : `I can help with ${keys.length} diseases: ${keys.join(", ")}.`;
        }
        break;
      }
      default:
        response = null;
    }
  } catch (err) {
    console.error("Chatbot error:", err);
  }

  if (!response) {
    return {
      status: 200 as const,
      body: {
        answer: getRandomItem(fallbacks[langKey]),
        intent: "UNKNOWN",
        detected: { crop, season, intent },
        source: "Govi Isuru Assistant",
        context: { crop, season, disease: specificDisease },
      },
    };
  }

  return {
    status: 200 as const,
    body: {
      answer: response,
      intent,
      detected: { crop, season, language: langKey },
      source,
      context: { crop, season, disease: specificDisease },
    },
  };
}