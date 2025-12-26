const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ================= Create Trivia Questions Function ================= //
exports.createTriviaQuestions = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  // Handle preflight request
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

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
exports.seedLevelsV3 = functions.https.onRequest(async (req, res) => {
  const batch = db.batch();
  const levelsRef = db.collection("levels");

  // Emoji tiers per 100 levels
  const emojiTiers = [
    "🙂", // 1–100
    "😎", // 101–200
    "🧠", // 201–300
    "⚔️", // 301–400
    "👑", // 401–500
    "🔥", // 501–600
    "💎", // 601–700
    "🚀", // 701–800
    "🌌", // 801–900
    "⚡", // 901–1000
    "👁️", // 1001–1100
    "🌀", // 1101–1200
    "🌠", // 1201–1300
    "🧿", // 1301–1400
    "👑✨", // 1401–1500
  ];

  // Viral title generators
  const prefixes = [
    "Emoji", "Trivia", "Mind", "Brain", "Puzzle",
    "Symbol", "Cosmic", "Alpha", "Omega", "Legend",
  ];

  const suffixes = [
    "Novice", "Hunter", "Breaker", "Master", "Lord",
    "Overlord", "Champion", "God", "Supreme", "Ascendant",
  ];

  for (let level = 1; level <= 1500; level++) {
    // ---- XP LOGIC ----
    let xpToNext;

    if (level <= 100) {
      xpToNext = 100 + (level - 1) * 50;
    } else {
      const block = Math.floor((level - 1) / 100);
      const increment = 50 * (block + 1);
      xpToNext = 100 + increment * ((level - 1) % 100);
    }

    // ---- TITLE LOGIC ----
    const prefix = prefixes[level % prefixes.length];
    const suffix = suffixes[level % suffixes.length];

    let title;
    if (level < 50) {
      title = `${prefix} ${suffix}`;
    } else if (level < 300) {
      title = `${prefix} ${suffix} ${level}`;
    } else {
      title = `${prefix} ${suffix} of Emojis`;
    }

    // ---- EMOJI LOGIC ----
    const emoji =
      emojiTiers[Math.floor((level - 1) / 100)] || "👑";

    // ---- FIRESTORE WRITE ----
    const docRef = levelsRef.doc(String(level));
    batch.set(docRef, {
      level,
      title,
      emoji,
      xp_to_next_level: xpToNext,
      image_url: "",
    });
  }

  await batch.commit();
  res.status(200).send("✅ Levels 1–1500 seeded successfully");
});
