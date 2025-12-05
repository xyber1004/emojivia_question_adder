const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

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
