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

  if (!category) return showToast("Please select a category.", "error");
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

// ================= Tab Switching ================= //
function switchTab(tab) {
  const regularTab = document.querySelector('.tab-btn:nth-child(1)');
  const dailyTab = document.querySelector('.tab-btn:nth-child(2)');
  const regularSection = document.getElementById('regularSection');
  const dailySection = document.getElementById('dailySection');

  if (tab === 'regular') {
    regularTab.classList.add('active');
    dailyTab.classList.remove('active');
    regularSection.classList.add('active');
    dailySection.classList.remove('active');
  } else {
    regularTab.classList.remove('active');
    dailyTab.classList.add('active');
    regularSection.classList.remove('active');
    dailySection.classList.add('active');
  }
}

// ================= Daily Mission Functions ================= //

// Check if a daily mission already exists for a date
async function checkDailyMissionExists(date) {
  const url =
    "https://firestore.googleapis.com/v1/projects/emojivia-f5bd5/databases/(default)/documents/daily_missions";

  const res = await fetch(url);
  const data = await res.json();

  if (!data.documents) return false;

  for (const doc of data.documents) {
    const docId = doc.name.split("/").pop();
    if (docId === date) {
      return true;
    }
  }

  return false;
}

// Generate and upload daily mission questions
async function generateAndUploadDailyMission() {
  const dateInput = document.getElementById("dailyDateInput").value.trim();
  const category = document.getElementById("dailyCategoryInput").value.trim();
  const topic = document.getElementById("dailyTopicInput").value.trim();
  let count = parseInt(document.getElementById("dailyCountInput").value.trim());
  if (!count || isNaN(count)) count = 50;

  if (!dateInput) return showToast("Please select a date.", "error");
  if (!category) return showToast("Please select a category.", "error");
  if (!topic) return showToast("Please enter a topic.", "error");
  if (count > 100) {
    showToast("⚠️ Maximum 100 questions allowed per generation.", "error");
    count = 100;
  }

  // Format date to DD-MM-YYYY
  const [year, month, day] = dateInput.split('-');
  const formattedDate = `${day}-${month}-${year}`;

  // Check if API key is loaded
  if (!apiKeyLoaded || !OPENAI_API_KEY) {
    return showToast("⚠️ API key not loaded yet. Please wait or refresh the page.", "error");
  }

  // Show loading UI
  showLoading("🎯 Preparing to generate daily mission...", 5);
  disableDailyButton(true);

  try {
    // Step 1: Check if daily mission already exists
    updateLoading("🔍 Checking if daily mission exists for " + formattedDate + "...", 10);
    const exists = await checkDailyMissionExists(formattedDate);
    
    if (exists) {
      hideLoading();
      disableDailyButton(false);
      return showToast(`❌ Daily mission for ${formattedDate} already exists! Please choose a different date.`, "error");
    }

    updateLoading("✅ Date available! Proceeding...", 15);

    // Step 2: Generate questions from OpenAI for Guess Mode
    updateLoading(`🤖 Generating ${count} questions for GUESS MODE...\n⏳ This may take 30-60 seconds...`, 20);

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

    // Generate Guess Mode questions
    const guessModeResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
        max_tokens: 16000
      })
    });

    if (!guessModeResponse.ok) {
      const errorData = await guessModeResponse.json().catch(() => ({}));
      hideLoading();
      disableDailyButton(false);
      
      if (guessModeResponse.status === 429) {
        return showToast("⚠️ Rate limit exceeded. Please wait a few moments and try again.", "error");
      } else if (guessModeResponse.status === 401) {
        return showToast("❌ Invalid API key. Please check your configuration.", "error");
      } else if (guessModeResponse.status === 402) {
        return showToast("💳 Insufficient quota. Please check your OpenAI billing.", "error");
      } else {
        return showToast(`❌ OpenAI API error (${guessModeResponse.status}): ${errorData.error?.message || 'Unknown error'}`, "error");
      }
    }

    updateLoading("📥 Receiving Guess Mode response...", 40);
    const guessModeData = await guessModeResponse.json();
    
    const guessModeContent = guessModeData.choices[0].message.content;
    
    if (guessModeData.choices[0].finish_reason === 'length') {
      hideLoading();
      disableDailyButton(false);
      return showToast("⚠️ Guess Mode response was truncated. Try generating fewer questions.", "error");
    }
    
    let guessModeJson;
    try {
      guessModeJson = JSON.parse(guessModeContent);
    } catch (parseError) {
      console.error("Guess Mode JSON Parse Error:", parseError);
      hideLoading();
      disableDailyButton(false);
      return showToast("❌ Failed to parse Guess Mode AI response.", "error");
    }

    // Step 3: Generate questions for No Cap Mode
    updateLoading(`🤖 Generating ${count} questions for NO CAP MODE...\n⏳ This may take 30-60 seconds...`, 50);

    const noCapModeResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
        max_tokens: 16000
      })
    });

    if (!noCapModeResponse.ok) {
      const errorData = await noCapModeResponse.json().catch(() => ({}));
      hideLoading();
      disableDailyButton(false);
      
      if (noCapModeResponse.status === 429) {
        return showToast("⚠️ Rate limit exceeded. Please wait a few moments and try again.", "error");
      } else {
        return showToast(`❌ OpenAI API error (${noCapModeResponse.status}): ${errorData.error?.message || 'Unknown error'}`, "error");
      }
    }

    updateLoading("📥 Receiving No Cap Mode response...", 70);
    const noCapModeData = await noCapModeResponse.json();
    
    const noCapModeContent = noCapModeData.choices[0].message.content;
    
    if (noCapModeData.choices[0].finish_reason === 'length') {
      hideLoading();
      disableDailyButton(false);
      return showToast("⚠️ No Cap Mode response was truncated. Try generating fewer questions.", "error");
    }
    
    let noCapModeJson;
    try {
      noCapModeJson = JSON.parse(noCapModeContent);
    } catch (parseError) {
      console.error("No Cap Mode JSON Parse Error:", parseError);
      hideLoading();
      disableDailyButton(false);
      return showToast("❌ Failed to parse No Cap Mode AI response.", "error");
    }

    // Step 4: Upload to Firestore using Cloud Function
    updateLoading(`⬆️ Uploading questions to Firestore...`, 80);

    const cloudFn =
      "https://us-central1-emojivia-f5bd5.cloudfunctions.net/createDailyMissionQuestions";

    // Upload Guess Mode
    const guessModeRes = await fetch(cloudFn + "?date=" + formattedDate + "&mode=guess_mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(guessModeJson),
    });

    let guessModeResult;
    try {
      guessModeResult = await guessModeRes.json();
    } catch (e) {
      const errorText = await guessModeRes.text();
      console.error("Guess Mode Response Error:", errorText);
      hideLoading();
      disableDailyButton(false);
      return showToast("❌ Guess Mode upload failed: " + errorText, "error");
    }

    if (!guessModeRes.ok) {
      console.error("Guess Mode upload failed:", guessModeResult);
      hideLoading();
      disableDailyButton(false);
      return showToast("❌ Guess Mode upload failed: " + (guessModeResult.message || JSON.stringify(guessModeResult)), "error");
    }

    updateLoading(`⬆️ Uploading No Cap Mode questions...`, 90);

    // Upload No Cap Mode
    const noCapModeRes = await fetch(cloudFn + "?date=" + formattedDate + "&mode=no_cap_mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(noCapModeJson),
    });

    const noCapModeResult = await noCapModeRes.json();

    updateLoading("✅ Finalizing...", 95);

    if (noCapModeRes.ok) {
      updateLoading("🎉 Success!", 100);
      setTimeout(() => {
        hideLoading();
        disableDailyButton(false);
        showToast(`🎉 Successfully created daily mission for ${formattedDate}!\n✅ Guess Mode: ${guessModeJson.length} questions\n✅ No Cap Mode: ${noCapModeJson.length} questions`, "success");
      }, 500);
    } else {
      hideLoading();
      disableDailyButton(false);
      showToast("❌ No Cap Mode upload failed: " + (noCapModeResult.message || "Unknown error"), "error");
    }
  } catch (err) {
    hideLoading();
    disableDailyButton(false);
    showToast("❌ Network error: " + err.message, "error");
  }
}

function disableDailyButton(disabled) {
  const btn = document.getElementById("generateDailyBtn");
  btn.disabled = disabled;
  btn.innerText = disabled ? "⏳ Generating..." : "Generate & Upload Daily Mission";
}

// 🔥 Fetch available categories from Firestore and populate dropdowns
async function fetchCategories() {
  try {
    // Fetch all documents in the categories collection
    const url = "https://firestore.googleapis.com/v1/projects/emojivia-f5bd5/databases/(default)/documents/categories";
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error("Failed to fetch categories. Status:", response.status);
      const errorText = await response.text();
      console.error("Error response:", errorText);
      return [];
    }
    
    const data = await response.json();
    console.log("Fetched categories collection:", data);

    if (!data.documents || data.documents.length === 0) {
      console.error("No documents found in categories collection");
      return [];
    }

    // Get the first document (should be SMQBUphyv9T1MbsSqZ based on your screenshot)
    const categoryDoc = data.documents[0];
    console.log("Category document:", categoryDoc);
    console.log("Fields:", categoryDoc.fields);

    if (!categoryDoc.fields) {
      console.error("No fields found in document");
      return [];
    }

    if (!categoryDoc.fields.categories) {
      console.error("No 'categories' field found. Available fields:", Object.keys(categoryDoc.fields));
      return [];
    }

    if (!categoryDoc.fields.categories.arrayValue) {
      console.error("'categories' is not an array. Type:", categoryDoc.fields.categories);
      return [];
    }

    if (!categoryDoc.fields.categories.arrayValue.values) {
      console.error("Array has no values");
      return [];
    }

    // Extract category values from the array
    const categories = categoryDoc.fields.categories.arrayValue.values.map(v => v.stringValue);
    console.log("Extracted categories:", categories);
    return categories;
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

// 🎨 Format category name for display (e.g., "gen_alpha" → "Gen Alpha")
function formatCategoryName(category) {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// 📋 Populate dropdown with categories
async function populateCategoryDropdowns() {
  const categories = await fetchCategories();
  
  const regularDropdown = document.getElementById("categoryInput");
  const dailyDropdown = document.getElementById("dailyCategoryInput");

  if (categories.N === 0) {
    regularDropdown.innerHTML = '<option value="">No categories found</option>';
    dailyDropdown.innerHTML = '<option value="">No categories found</option>';
    return;
  }

  // Create options HTML
  const optionsHTML = '<option value="">Select a category</option>' + 
    categories.map(cat => `<option value="${cat}">${formatCategoryName(cat)}</option>`).join('');

  regularDropdown.innerHTML = optionsHTML;
  dailyDropdown.innerHTML = optionsHTML;
}

// Initialize categories on page load
populateCategoryDropdowns();
