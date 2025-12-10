const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ================= Create Trivia Questions Function ================= //
exports.createTriviaQuestions = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const triviaId = req.query.triviaId;
    if (!triviaId) {
      res.status(400).send("Missing triviaId");
      return;
    }

    const questions = req.body;
    if (!Array.isArray(questions)) {
      res.status(400).send("Body must be an array");
      return;
    }

    const batch = db.batch();
    const col = db.collection("trivia").doc(triviaId).collection("questions");

    for (const q of questions) {
      const ref = col.doc(String(q.id));
      batch.set(ref, {
        id: q.id,
        question: q.question,
        options: q.options.join("|"),
        answer: q.answer,
      });
    }

    await batch.commit();
    res.send({success: true});
  } catch (e) {
    console.error(e);
    res.status(500).send("Internal error");
  }
});

// ================= Seed Levels Function ================= //
exports.seedLevels = functions.https.onRequest(async (req, res) => {
  const titles = [
    "Emoji Novice", "Trivia Starter", "Emoji Scout",
    "Baby Brainiac", "Curious Thinker",
    "Emoji Apprentice", "Puzzle Pupil", "Emoji Rookie",
    "Mini Mindmaster", "Symbol Seeker",
    "Emoji Pathfinder", "Trivia Walker", "Emoji Translator",
    "Riddle Newbie", "Witty Wanderer",
    "Emoji Analyst", "Clever Cub", "Quick Picker",
    "Flash Thinker", "Emoji Solver",
    "Trivia Striker", "Emoji Reader", "Puzzle Hustler",
    "Symbol Whisperer", "Emoji Breaker",
    "Quick Decoder", "Rapid Resolver", "Brain Tickler",
    "Emoji Ranger", "Trivia Warrior",
    "Emoji Mage", "Logic Tamer", "Emoji Explorer",
    "Trivia Artisan", "Insight Seeker",
    "Emoji Drifter", "Symbol Slicer", "Thought Piercer",
    "Puzzle Bender", "Emoji Whisperer",
    "Trivia Gladiator", "Emoji Illusionist", "Witty Nomad",
    "Symbol Reader", "Emoji Summoner",
    "Logic Lifter", "Trivia Pilot", "Riddle Archer",
    "Thought Crafter", "Emoji Fighter",
    "Trivia Soldier", "Symbol Smasher", "Emoji Smith",
    "Cipher Crusher", "Logic Berserker",
    "Emoji Raider", "Puzzle Marauder", "Trivia Knight",
    "Emoji Rogue", "Symbol Knight",
    "Emoji Ronin", "Trivia Paladin", "Code Shogun",
    "Emoji Guardian", "Puzzle Captain",
    "Emoji Outlaw", "Trivia Marshal", "Emoji Vigilante",
    "Symbol Sheriff", "Emoji Baron",
    "Logic Baron", "Trivia Viscount", "Emoji Count",
    "Puzzle Earl", "Emoji Duke",
    "Trivia Marquis", "Emoji Noble", "Puzzle Noble",
    "Trivia Sovereign", "Emoji Monarch",
    "Trivia Legend", "Emoji Overlord", "Puzzle General",
    "Emoji Titan", "Trivia Titan",
    "Emoji Colossus", "Symbol Colossus", "Emoji Warlord",
    "Puzzle Warden", "Trivia Champion",
    "Emoji Conqueror", "Symbol Conqueror", "Emoji Grandmaster",
    "Trivia Grandmaster",
    "Emoji Dominator", "Puzzle Dominator", "Trivia Emperor",
    "Emoji Emperor", "Emoji Supreme",
    "Trivia Supreme", "The Emoji Hero", "Trivia Hero",
    "Puzzle Hero", "Emoji Genius",
    "Trivia Genius", "Logic Genius", "Emoji Wizard",
    "Trivia Wizard", "Brain Wizard",
    "Emoji Sage", "Trivia Sage", "Symbol Sage",
    "Emoji Prophet", "Trivia Prophet",
    "Puzzle Prophet", "Emoji Oracle", "Trivia Oracle",
    "Riddle Oracle", "Emoji Visionary",
    "Trivia Visionary", "Symbol Visionary", "Emoji Commander",
    "Puzzle Commander",
    "Trivia Commander", "Emoji Veteran", "Trivia Veteran",
    "Puzzle Veteran", "Emoji Elite",
    "Trivia Elite", "Ultimate Solver", "Emoji Rocketeer",
    "Trivia Rocketeer",
    "Symbol Rocketeer", "Emoji Pilot", "Trivia Flyer",
    "Puzzle Voyager", "Emoji Astronaut",
    "Trivia Astronaut", "Emoji Navigator", "Trivia Navigator",
    "Emoji Mechanic",
    "Puzzle Mechanic", "Trivia Engineer", "Emoji Engineer",
    "Symbol Engineer",
    "Emoji Hacker", "Trivia Hacker", "Puzzle Hacker",
    "Emoji Cyberlord", "Trivia Cyberlord",
    "The Emoji Alpha", "Trivia Alpha", "Symbol Alpha",
    "Emoji Apex", "Trivia Apex",
    "Puzzle Apex", "Emoji Lord", "Trivia Lord",
    "Riddle Lord", "Lord of Emojis",
    "Emoji Champion", "Trivia Champion", "Puzzle Champion",
    "Emoji Slayer", "Trivia Slayer",
    "Symbol Slayer", "Emoji Shaman", "Trivia Shaman",
    "Puzzle Shaman", "Emoji Magister",
    "Trivia Magister", "Brain Magister",
    "Emoji Commander Supreme",
    "Trivia Commander Supreme", "Symbol Commander Supreme",
    "Emoji Grand Scholar",
    "Trivia Scholar", "Emoji Pundit", "Trivia Pundit",
    "Puzzle Pundit", "Emoji Archmage",
    "Trivia Archmage", "Symbol Archmage", "Emoji Ultra",
    "Trivia Ultra", "Puzzle Ultra",
    "Emoji Prime", "Trivia Prime", "Puzzle Prime",
    "Emoji Apex Ruler", "Trivia Apex Ruler",
    "Emoji Phantom", "Trivia Phantom", "Puzzle Phantom",
    "Emoji Shadowlord",
    "Trivia Shadowlord", "Puzzle Shadowlord",
    "Emoji Beastmaster", "Trivia Beastmaster",
    "Puzzle Beastmaster", "Emoji Crowned One",
    "Trivia Crowned One", "Puzzle Crowned One",
    "Emoji Ascendant", "Trivia Ascendant", "Puzzle Ascendant",
    "Emoji Infinity",
    "Trivia Infinity", "Symbol Infinity", "Emoji Destructor",
    "Trivia Destructor",
    "Riddle Destructor", "Emoji Immortal", "Trivia Immortal",
    "Symbol Immortal",
    "Emoji Eternal", "Trivia Eternal", "Puzzle Eternal",
    "Emoji Celestial",
    "Trivia Celestial", "Puzzle Celestial", "Emoji Liberator",
    "Trivia Liberator",
    "Puzzle Liberator", "Emoji Overmind", "Trivia Overmind",
    "Puzzle Overmind",
    "Emoji Alpha Master", "Trivia Alpha Master",
    "Puzzle Alpha Master",
    "Emoji Reality Bender", "Trivia Reality Bender",
    "Symbol Reality Bender",
    "Emoji Crownbearer", "Trivia Crownbearer",
    "Puzzle Crownbearer", "Emoji Nova",
    "Trivia Nova", "Puzzle Nova", "Emoji Godhand",
    "Trivia Godhand", "Symbol Godhand",
    "Emoji Highlord", "Trivia Highlord", "Puzzle Highlord",
    "Emoji Kingmaker",
    "Trivia Kingmaker", "Puzzle Kingmaker", "Emoji Mythic",
    "Trivia Mythic",
    "Puzzle Mythic", "Emoji Everlasting",
    "Trivia Everlasting", "Symbol Everlasting",
    "Emoji Infinity Lord", "Trivia Infinity Lord",
    "Puzzle Infinity Lord",
    "Emoji Ethereal", "Trivia Ethereal", "Symbol Ethereal",
    "Emoji Timebender",
    "Trivia Timebender", "Puzzle Timebender",
    "Emoji Universe Tamer",
    "Trivia Universe Tamer", "Puzzle Universe Tamer",
    "Emoji Omega", "Trivia Omega",
    "Symbol Omega", "Emoji Apex God", "Trivia Apex God",
    "Puzzle Apex God",
    "Emoji Supreme Being", "Trivia Supreme Being",
    "Symbol Supreme Being",
    "Emoji Ultra Master", "Trivia Ultra Master",
    "Puzzle Ultra Master",
    "Emoji Megalord", "Trivia Megalord", "Puzzle Megalord",
    "Emoji Titan King",
    "Trivia Titan King", "Puzzle Titan King",
    "Emoji Worldbreaker",
    "Trivia Worldbreaker", "Puzzle Worldbreaker",
    "Emoji Infinity Emperor",
    "Trivia Infinity Emperor", "Puzzle Infinity Emperor",
    "Emoji Overgod",
    "Trivia Overgod", "Symbol Overgod",
    "Emoji Cosmic Emperor",
    "Trivia Cosmic Emperor", "Puzzle Cosmic Emperor",
    "Emoji Supreme Overlord",
    "Trivia Supreme Overlord", "Emoji Omniscient",
    "Trivia Omniscient",
  ];

  const emojiTiers = [
    "🙂✨🧠🔤", // 1–20 beginner
    "🧭🚶‍♂️🔍🌄", // 21–40 explorer
    "⚔️🔥🛡️🏹", // 41–60 warrior
    "👑🏰💎", // 61–80 noble
    "🐉🌟🌀", // 81–100 mythic
    "🚀🌌🛸", // 101–150 galactic
    "⚡🔥💥", // 151–200 ultra
    "🌠🌙✨", // 201–250 cosmic
    "👁️💫🌟👑", // 251–300 divine
  ];

  const batch = db.batch();
  const colRef = db.collection("levels");

  titles.forEach((title, i) => {
    const level = i + 1;

    const tierIndex =
      level <= 20 ? 0 :
      level <= 40 ? 1 :
      level <= 60 ? 2 :
      level <= 80 ? 3 :
      level <= 100 ? 4 :
      level <= 150 ? 5 :
      level <= 200 ? 6 :
      level <= 250 ? 7 :
      8;

    const emoji = emojiTiers[tierIndex];

    const docRef = colRef.doc(String(level));
    batch.set(docRef, {
      title: title,
      xp_required: level * 100,
      emoji: emoji,
      image_url: "", // future upgrade
    });
  });

  await batch.commit();
  res.send("All 300 levels created with emoji & image_url field!");
});
