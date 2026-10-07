export type LocalLexiconItem = {
  meaning: string;
  reasoning: string;
  analogy: string;
  synonyms: string[];
  mistake: string;
  oneLiner: string;
  baseWord?: string;
  baseMeaning?: string;
  targetMeaning?: string;
};

export const localLexicon: Record<string, LocalLexiconItem> = {
  equalizer: {
    meaning: "In this sentence, equalizer means something that reduces social gaps and gives everyone fair access.",
    reasoning: "The library is described as helping people across income levels, so the word emphasizes fairness.",
    analogy: "Like a public park where everyone can enter, not a private club.",
    synonyms: ["leveler", "balancer"],
    mistake: "Do not read it as an audio device here; this is a social metaphor.",
    oneLiner: "equalizer: makes the game fair for everyone.",
    baseWord: "helpful place",
    baseMeaning: "a place that offers support",
    targetMeaning: "a place that narrows inequality"
  },
  preserve: {
    meaning: "Preserve here means keeping something valuable from being lost over time.",
    reasoning: "The sentence is about culture/history, so the word carries long-term protection.",
    analogy: "Like backing up old family photos before they disappear.",
    synonyms: ["protect", "conserve"],
    mistake: "Not about preserving food here.",
    oneLiner: "preserve: keep it alive for the future."
  },
  successfully: {
    meaning: "在该句中表示“成功地、顺利地完成某个变化或行动”。",
    reasoning: "这里不是强调结果本身，而是强调“转型这件事做成了且效果良好”。",
    analogy: "就像一个城市改造项目按计划推进并且落地见效。",
    synonyms: ["effectively", "smoothly"],
    mistake: "不要只机械翻成“成功”，它更像“以成功的方式完成”。",
    oneLiner: "successfully：不是喊口号，是“这事真做成了”。",
    baseWord: "do",
    baseMeaning: "做了某事",
    targetMeaning: "把某事做成并达成预期效果"
  },
  artifacts: {
    meaning: "Artifacts are historical objects that carry cultural or historical value.",
    reasoning: "The context is archives and history, so this refers to physical traces of the past.",
    analogy: "Like old letters, tools, or photos that tell a story.",
    synonyms: ["relics", "historical objects"],
    mistake: "Not software/rendering artifacts in this context.",
    oneLiner: "artifacts: objects that let history speak."
  },
  historic: {
    meaning: "Historic means important in history, not just old.",
    reasoning: "The sentence talks about public memory and significance.",
    analogy: "A century-old shop is old; a treaty site is historic.",
    synonyms: ["historical", "landmark"],
    mistake: "Do not confuse with merely old or outdated.",
    oneLiner: "historic: old and important."
  },
  discourse: {
    meaning: "Discourse here means serious public discussion of ideas.",
    reasoning: "The sentence focuses on civic engagement and dialogue quality.",
    analogy: "Not random chat, but thoughtful discussion with purpose.",
    synonyms: ["discussion", "dialogue"],
    mistake: "Not equal to casual small talk.",
    oneLiner: "discourse: talk that moves thinking forward."
  },
  municipal: {
    meaning: "Municipal means related to city or local government.",
    reasoning: "Budgets in the sentence are controlled by local authorities.",
    analogy: "Things decided at city hall level.",
    synonyms: ["city-level", "local-government"],
    mistake: "Not national-level policy.",
    oneLiner: "municipal: the city's responsibility."
  },
  tutoring: {
    meaning: "Tutoring means focused extra teaching support.",
    reasoning: "It appears in a list of programs that help students close gaps.",
    analogy: "Like personalized after-class coaching.",
    synonyms: ["coaching", "instruction"],
    mistake: "Not full-time schooling.",
    oneLiner: "tutoring: targeted help when class isn't enough."
  },
  perpetuate: {
    meaning: "Perpetuate means causing something to continue, especially a problem.",
    reasoning: "The context discusses inequality being repeatedly reinforced.",
    analogy: "Like patching symptoms while the root problem keeps growing.",
    synonyms: ["sustain", "reinforce"],
    mistake: "It often has a negative tone in social issues.",
    oneLiner: "perpetuate: keep the cycle going."
  }
};
