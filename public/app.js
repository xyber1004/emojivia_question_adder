// API key is fetched from Firestore on page load
let OPENAI_API_KEY = null;
let apiKeyLoaded = false;

// Fetch API key from Firestore when page loads
async function initializeApiKey() {
  try {
    showToast("🔑 Loading API key from Firestore...", "success");
    OPENAI_API_KEY = await CONFIG.fetchApiKey();
    apiKeyLoaded = true;
    showToast("✅ API key loaded successfully!", "success");
    console.log("✅ OpenAI API key loaded from Firestore");
  } catch (error) {
    console.error("Failed to load API key:", error);
    showToast("⚠️ Failed to load API key from Firestore. Please check your Firebase configuration.", "error");
    apiKeyLoaded = false;
  }
}

// Initialize API key on page load
initializeApiKey();

// 🔥 Automatically create triviaId like <category>_trivia_<nextIndex>
async function generateTriviaId(category) {
  // Sanitize and ensure lowercase
  const sanitized = category
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const prefix = sanitized + "_trivia_";

  // Firestore REST API
  const url =
    "https://firestore.googleapis.com/v1/projects/emojivia-f5bd5/databases/(default)/documents/trivia";

  const res = await fetch(url);
  const data = await res.json();

  if (!data.documents) return prefix + "1";

  let maxIndex = 0;

  for (const doc of data.documents) {
    const fullName = doc.name.split("/").pop(); // extract document ID

    if (fullName.startsWith(prefix)) {
      const num = parseInt(fullName.replace(prefix, ""), 10);
      if (!isNaN(num) && num > maxIndex) maxIndex = num;
    }
  }

  const nextId = maxIndex + 1;
  return prefix + nextId;
}

async function generateAndUpload() {
  const category = document.getElementById("categoryInput").value.trim();
  const topic = document.getElementById("topicInput").value.trim();
  let count = parseInt(document.getElementById("countInput").value.trim());
  if (!count || isNaN(count)) count = 50; // Reduced default from 100 to 50

  if (!category) return showToast("Please enter a category.", "error");
  if (!topic) return showToast("Please enter a topic.", "error");
  if (count > 100) {
    showToast("⚠️ Maximum 100 questions allowed per generation.", "error");
    count = 100;
  }

  // Check if API key is loaded
  if (!apiKeyLoaded || !OPENAI_API_KEY) {
    return showToast("⚠️ API key not loaded yet. Please wait or refresh the page.", "error");
  }

  // Show loading UI
  showLoading("🎯 Preparing to generate trivia...", 10);
  disableButton(true);

  try {
    // 🔥 Step 1: auto-generate triviaId from category
    updateLoading("🔑 Generating trivia ID...", 20);
    const triviaId = await generateTriviaId(category);
    updateLoading("✨ Trivia ID created: " + triviaId, 30);

    // 🔥 Step 2: Generate questions from OpenAI
    updateLoading(`🤖 Asking AI to generate ${count} questions...\n⏳ This may take 30-60 seconds...`, 40);

    const systemPrompt = `
You create emoji-only trivia questions.
Return ONLY a JSON array. Format:
[
  {
    "id": 1,
    "question": "💀😂📱",
    "options": ["NPC moment", "I'm dead (laughing)", "Phone lag", "L take"],
    "answer": "I'm dead (laughing)"
  }
]

Rules:
- JSON array only.
- id starts at 1.
- question is ONLY emojis.
- 4 options.
- answer must match one option exactly.
Topic: ${topic}
`;

    const userPrompt = `Generate ${count} questions for topic: ${topic}`;

    let aiJson;

    console.log("Before calling OpenAI API...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 16000 // Increased to handle larger responses
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      hideLoading();
      disableButton(false);
      
      if (response.status === 429) {
        return showToast("⚠️ Rate limit exceeded. Please wait a few moments and try again.", "error");
      } else if (response.status === 401) {
        return showToast("❌ Invalid API key. Please check your configuration.", "error");
      } else if (response.status === 402) {
        return showToast("💳 Insufficient quota. Please check your OpenAI billing.", "error");
      } else {
        return showToast(`❌ OpenAI API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`, "error");
      }
    }

    updateLoading("📥 Receiving AI response...", 60);
    const data = await response.json();
    console.log("OpenAI Response:", data);
    
    const content = data.choices[0].message.content;
    
    // Check if response was truncated
    if (data.choices[0].finish_reason === 'length') {
      hideLoading();
      disableButton(false);
      showToast("⚠️ Response was truncated. Try generating fewer questions.", "error");
      return showToast("❌ Response incomplete - reduce question count and try again", "error");
    }
    
    updateLoading("🔍 Parsing AI response...", 70);
    try {
      aiJson = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.log("Content received:", content);
      hideLoading();
      disableButton(false);
      return showToast("❌ Failed to parse AI response. Try generating fewer questions.", "error");
    }

    updateLoading(`⬆️ Uploading ${aiJson.length} questions to Firestore...`, 80);

    // 🔥 Step 3: Upload to Firestore using Cloud Function
    const cloudFn =
      "https://us-central1-emojivia-f5bd5.cloudfunctions.net/createTriviaQuestions";

    const res = await fetch(cloudFn + "?triviaId=" + triviaId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(aiJson),
    });

    const result = await res.json();

    updateLoading("✅ Finalizing...", 95);

    if (res.ok) {
      updateLoading("🎉 Success!", 100);
      setTimeout(() => {
        hideLoading();
        disableButton(false);
        showToast(`🎉 Successfully saved ${aiJson.length} questions!\nTrivia ID: ${triviaId}`, "success");
      }, 500);
    } else {
      hideLoading();
      disableButton(false);
      showToast("❌ Upload failed: " + (result.message || "Unknown error"), "error");
    }
  } catch (err) {
    hideLoading();
    disableButton(false);
    showToast("❌ Network error: " + err.message, "error");
  }
}

function showToast(message, type) {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.className = type;
  toast.style.display = "block";
  setTimeout(() => (toast.style.display = "none"), 4000);
}

function showLoading(message, progress) {
  const container = document.getElementById("loadingContainer");
  const text = document.getElementById("loadingText");
  const progressFill = document.getElementById("progressFill");
  
  container.style.display = "flex";
  text.innerText = message;
  progressFill.style.width = progress + "%";
}

function updateLoading(message, progress) {
  const text = document.getElementById("loadingText");
  const progressFill = document.getElementById("progressFill");
  
  text.innerText = message;
  progressFill.style.width = progress + "%";
}

function hideLoading() {
  const container = document.getElementById("loadingContainer");
  const progressFill = document.getElementById("progressFill");
  
  container.style.display = "none";
  progressFill.style.width = "0%";
}

function disableButton(disabled) {
  const btn = document.getElementById("generateBtn");
  btn.disabled = disabled;
  btn.innerText = disabled ? "⏳ Generating..." : "Generate & Upload";
}
