// TrackMate - app.js (Coding_v4: stable + editable + progressive suggestions)
// Drop-in replacement for /js/app.js

// -------------------------
// Screen navigation helpers
// -------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("screen--active"));
  const target = document.getElementById(id);
  if (target) target.classList.add("screen--active");

  // Keep the welcome message in sync with the saved profile.
  if (id === "screen-welcome") {
    try { syncWelcomeTitle(); } catch (_) {}
  }

  
  // v2.7.4: keep duration display live while on workout screen (no layout shift).
  if (durationTicker) {
    clearInterval(durationTicker);
    durationTicker = null;
  }
  if (id === "screen-workout") {
    // Update immediately, then tick periodically.
    try { updateDurationFooterOnly(); } catch (_) {}
    durationTicker = setInterval(() => {
      const w = document.getElementById("screen-workout");
      if (w && w.classList.contains("screen--active")) {
        try { updateDurationFooterOnly(); } catch (_) {}
      }
    }, 15000);
  }
// Screen-specific UI sync (keep logic minimal to avoid regressions)
  if (id === "screen-workout") {
    try { syncWorkoutDaySelectOptionsForSeries(getActiveSeriesName()); } catch (_) {}
    try { syncWorkoutEditProgramButton(); } catch (_) {}
  }
  if (id === "screen-programs") {
    try { renderProgramsScreen(); } catch (_) {}
  }
  if (id === "screen-custom-builder") {
    try { syncProgramDraftUI(); renderCustomBuilderForCurrentDay(); } catch (_) {}
  }
}

// Token used to guarantee that "Continue to Workouts" renders the intended day.
// If multiple navigations occur quickly, only the latest token may render.
let __continueEntryToken = 0;

// -------------------------
// Cross-screen recalculation hooks
// -------------------------
// When 1RM values change, refresh UI that derives suggested weights.
// This is UI-only: it must not wipe logged data or change completion logic.
function handleOneRMUpdatedUIRefresh() {
  try {
    const activeId = document.querySelector(".screen.screen--active")?.id || "";
    if (activeId === "screen-workout" && typeof window.renderWorkoutDay === "function") {
      // Re-render current day to recompute suggestion pills from the latest 1RMs.
      window.renderWorkoutDay(currentDayIndex);
      return;
    }
    if (activeId === "screen-programs" && typeof window.renderProgramsScreen === "function") {
      window.renderProgramsScreen();
      return;
    }
  } catch (_) {}
}

// Listen for in-app events (same tab) as well as storage events (other tabs)
document.addEventListener("trackmate:oneRMUpdated", handleOneRMUpdatedUIRefresh);

// When a custom programme definition is updated (e.g., Week 1 edits mirrored from
// the Workout screen), refresh any screens that render the builder/program lists.
function handleProgramDefinitionUpdatedUIRefresh(e) {
  try {
    const activeId = document.querySelector(".screen.screen--active")?.id || "";
    if (activeId === "screen-programs" && typeof window.renderProgramsScreen === "function") {
      window.renderProgramsScreen();
      return;
    }
    if (activeId === "screen-custom-builder" && typeof window.renderCustomBuilderForCurrentDay === "function") {
      window.renderCustomBuilderForCurrentDay();
      return;
    }
  } catch (_) {}
}
document.addEventListener("trackmate:programDefinitionUpdated", handleProgramDefinitionUpdatedUIRefresh);


// -------------------------
// Welcome screen personalisation
// -------------------------
function getProfileFirstName() {
  const profile = readJSON(STORAGE_KEYS.profile, null);
  const full = (profile && profile.name) ? String(profile.name).trim() : "";
  if (!full) return "";
  // Use the first token as the first name/nickname.
  return full.split(/\s+/)[0].trim();
}

function syncWelcomeTitle() {
  const el = document.getElementById("welcomeTitle");
  if (!el) return;
  const first = getProfileFirstName();
  el.textContent = first ? `Welcome back, ${first}` : "Welcome!";
}

// -------------------------
// Logo-as-home shortcut
// -------------------------
function bindHomeLogoShortcuts() {
  const logos = document.querySelectorAll('[data-home-logo="true"]');
  logos.forEach((logo) => {
    if (!logo || logo.dataset.homeLogoBound === "1") return;
    logo.dataset.homeLogoBound = "1";
    logo.style.cursor = "pointer";
    logo.setAttribute("role", "button");
    logo.setAttribute("tabindex", "0");

    const goHome = () => {
      try { if (typeof window.closeWorkoutMenu === "function") window.closeWorkoutMenu(); } catch (_) {}
      showScreen("screen-welcome");
    };

    logo.addEventListener("click", goHome);
    logo.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        goHome();
      }
    });
  });
}

// -------------------------
// Storage helpers
// -------------------------
const STORAGE_KEYS = {
  profile: "trackmateProfile",
  oneRM: "trackmateOneRM",
  workoutState: "trackmateWorkoutState",
  oneRMEquip: "trackmateOneRMEquip",
  prefs: "trackmatePrefs",
  lastViewed: "trackmateLastViewed",
  historyLog: "trackmateHistoryLog",
  seriesRegistry: "trackmateSeriesRegistry",
  customProgramDraft: "trackmateCustomProgramDraft"
};

// React to 1RM changes made in another tab/window.
window.addEventListener("storage", (e) => {
  try {
    if (e && e.key === STORAGE_KEYS.oneRM) handleOneRMUpdatedUIRefresh();
  } catch (_) {}
});
// Series-scoped storage helpers
function sanitizeStorageKeyPart(part) {
  return (part || "").toString().trim().replace(/[^a-z0-9_\-]+/gi, "_").slice(0, 80) || "default";
}

function workoutStateStorageKeyForSeries(seriesName) {
  const safe = sanitizeStorageKeyPart(seriesName || DEFAULT_SERIES_NAME);
  return `trackmateWorkoutState::${safe}`;
}

function customProgramStorageKeyForSeries(seriesName) {
  const safe = sanitizeStorageKeyPart(seriesName || "Custom");
  return `trackmateCustomProgram::${safe}`;
}

function canonicalSeriesName(name) {
  // Canonical form used ONLY for matching/comparisons (not for display).
  // Normalises whitespace and strips punctuation so that earlier builds that
  // stored/registered programme names with different punctuation/underscores
  // still match consistently for delete/dedup/cleanup.
  return (name || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn(`Could not save ${key}`, e);
    return false;
  }
}

// -------------------------
// Tiny inline icons (no external dependencies)
// -------------------------
function getTrashIconSVG() {
  // Simple trash can outline (stroke uses currentColor)
  return `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 6l1 16a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M10 11v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M14 11v7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
}

// -------------------------
// Custom programme draft (phased feature)
// -------------------------
function normaliseCustomProgramDraft(raw) {
  // Legacy support: draft might have been stored as a string name.
  if (typeof raw === "string") return { name: raw.trim(), days: {}, updatedAt: Date.now() };
  if (!raw || typeof raw !== "object") return null;

  const name = (raw.name || "").toString().trim();
  const days = (raw.days && typeof raw.days === "object") ? raw.days : {};
  const updatedAt = Number(raw.updatedAt || raw.updatedAt || Date.now());

  // Ensure days 1–7 exist as arrays.
  const nextDays = {};
  for (let d = 1; d <= 7; d++) {
    const key = String(d);
    const arr = Array.isArray(days[key]) ? days[key] : [];
    // Normalise each exercise entry.
    nextDays[key] = arr
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        name: (x.name || "").toString(),
        prescription: (x.prescription || "").toString(),
        notes: (x.notes || "").toString(),
        // Preserve fields required by the custom programme builder.
        equipment: (x.equipment || "").toString(),
        setCount: Number.isFinite(parseInt(x.setCount, 10)) ? parseInt(x.setCount, 10) : undefined
      }))
      .filter((x) => x.name.trim().length > 0);
  }

  return { name, days: nextDays, updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now() };
}

function getCustomProgramDraft() {
  const raw = readJSON(STORAGE_KEYS.customProgramDraft, null);
  const d = normaliseCustomProgramDraft(raw);
  return d && d.name ? d : null;
}

function writeCustomProgramDraft(draft) {
  const d = normaliseCustomProgramDraft(draft);
  if (!d || !d.name) return false;
  d.updatedAt = Date.now();
  writeJSON(STORAGE_KEYS.customProgramDraft, d);
  return true;
}

function setCustomProgramDraft(name) {
  const cleaned = (name || "").toString().trim();
  if (!cleaned) return false;

  const existing = getCustomProgramDraft() || { name: cleaned, days: {}, updatedAt: Date.now() };
  existing.name = cleaned;
  return writeCustomProgramDraft(existing);
}

// Start a brand-new programme draft (blank Days 1–7).
// This is used when the user enters a new programme name and presses "Start Building".
// It intentionally discards any prior draft content to avoid unexpected carryover.
function startNewCustomProgramDraft(name) {
  const cleaned = (name || "").toString().trim();
  if (!cleaned) return false;
  const blank = { name: cleaned, days: {}, updatedAt: Date.now() };
  for (let i = 1; i <= 7; i++) blank.days[String(i)] = [];
  return writeCustomProgramDraft(blank);
}

function ensureCustomDraft() {
  const d = getCustomProgramDraft();
  if (d) return d;
  // Create a blank draft if needed.
  const blank = { name: "My Program", days: {}, updatedAt: Date.now() };
  for (let i = 1; i <= 7; i++) blank.days[String(i)] = [];
  writeCustomProgramDraft(blank);
  return blank;
}

// -------------------------
// Series helpers (Workout Series naming)
// -------------------------
const DEFAULT_SERIES_NAME = "Sklar Series";

function getPrefsObject() {
  const prefs = readJSON(STORAGE_KEYS.prefs, {});
  return (prefs && typeof prefs === "object") ? prefs : {};
}

function setPrefsObject(nextPrefs) {
  writeJSON(STORAGE_KEYS.prefs, nextPrefs && typeof nextPrefs === "object" ? nextPrefs : {});
}

function getActiveSeriesName() {
  const prefs = getPrefsObject();
  const name = (prefs.activeSeriesName || "").toString().trim();
  return name || DEFAULT_SERIES_NAME;
}

function setActiveSeriesName(name) {
  const cleaned = (name || "").toString().trim();
  const prefs = getPrefsObject();
  prefs.activeSeriesName = cleaned || DEFAULT_SERIES_NAME;
  setPrefsObject(prefs);
}

function makeCopySeriesName(base) {
  const b = (base || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME;
  return `${b} (Copy)`;
}


function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

// -------------------------
// Workout day display helpers
// -------------------------
function getDisplayDayNumber(dayIndex) {
  // Display consecutive day numbers to avoid users thinking a day is missing.
  // The built-in Sklar template includes a non-workout slot (a blank day) which
  // means the underlying day indices are not strictly consecutive.
  // We therefore map indices -> display numbers explicitly.
  const sklarMap = {
    0: 1,
    1: 2,
    2: 3,
    4: 4,
    5: 5,
  };
  if (sklarMap.hasOwnProperty(dayIndex)) return sklarMap[dayIndex];
  return dayIndex + 1;
}

// -------------------------
// Exercise descriptions (Info modal)
// -------------------------
const exerciseDescriptions = {
  "Wide-Grip Pull-Ups or Lat Pulldown": {
    muscles: "Lats, upper back, biceps",
    description:
      "Pull the elbows down and back while keeping the chest lifted. Maintain a controlled descent and avoid swinging."
  },
  "Bent-Over Barbell Rows": {
    muscles: "Lats, mid-back, posterior delts, forearms",
    description:
      "Hinge at the hips with a neutral spine and pull the bar toward the lower ribs. Drive elbows back and maintain torso stability."
  },
  "One-Arm DB Rows or Machine Row (Superset)": {
    muscles: "Lats, mid-back, rear delts, biceps",
    description:
      "Pull the dumbbell or machine handle toward the hip, keeping the torso stable. Focus on squeezing the back at the top."
  },
  "Straight-Arm Rope Pulldown": {
    muscles: "Lats, teres major, triceps (long head)",
    description:
      "Keep arms nearly straight and pull the rope down toward the thighs. Emphasise lat engagement by keeping chest tall."
  },
  "Rear Delt Cable Fly (Face Pull Style)": {
    muscles: "Rear delts, upper back, traps",
    description:
      "Pull the handles outward and slightly back at shoulder height. Lead with elbows and avoid shrugging."
  },
  "DB Hammer Curl + EZ-Bar Curl (Superset)": {
    muscles: "Biceps (brachialis, brachii), forearms",
    description:
      "Keep elbows tight and curl with control. Hammer curls target brachialis; EZ curls emphasise peak contraction."
  },
  "Side Plank Reach-Throughs": {
    muscles: "Obliques, core stabilisers, shoulders",
    description:
      "Hold a strong side plank and rotate under the body to reach through. Maintain a straight line from head to feet."
  }
};

// -------------------------
// Exercise library (equipment + alternatives + category browsing)
// -------------------------
const exerciseLibrary = {
  "Wide-Grip Pull-Ups or Lat Pulldown": {
    category: "Back",
    equipment: "MC",
    alternatives: ["Bent-Over Barbell Rows", "One-Arm DB Rows or Machine Row (Superset)", "Straight-Arm Rope Pulldown"]
  },
  "Bent-Over Barbell Rows": {
    category: "Back",
    equipment: "BB",
    alternatives: ["One-Arm DB Rows or Machine Row (Superset)", "Wide-Grip Pull-Ups or Lat Pulldown", "Straight-Arm Rope Pulldown"]
  },
  "One-Arm DB Rows or Machine Row (Superset)": {
    category: "Back",
    equipment: "DB",
    alternatives: ["Bent-Over Barbell Rows", "Wide-Grip Pull-Ups or Lat Pulldown", "Straight-Arm Rope Pulldown"]
  },
  "Straight-Arm Rope Pulldown": {
    category: "Back",
    equipment: "MC",
    alternatives: ["Wide-Grip Pull-Ups or Lat Pulldown", "Bent-Over Barbell Rows"]
  },
  "Rear Delt Cable Fly (Face Pull Style)": {
    category: "Shoulders",
    equipment: "MC",
    alternatives: ["Rear Delt Bent-Over Flys", "Side-Angle DB Lateral Raise"]
  },
  "Rear Delt Bent-Over Flys": {
    category: "Shoulders",
    equipment: "DB",
    alternatives: ["Rear Delt Cable Fly (Face Pull Style)", "Side-Angle DB Lateral Raise"]
  },
  "DB Hammer Curl + EZ-Bar Curl (Superset)": {
    category: "Arms",
    equipment: "DB",
    alternatives: ["Bicep Spider Curls + Rope Hammer Curls (Superset)"]
  },
  "Bicep Spider Curls + Rope Hammer Curls (Superset)": {
    category: "Arms",
    equipment: "DB",
    alternatives: ["DB Hammer Curl + EZ-Bar Curl (Superset)"]
  },
  "Overhead Triceps Extensions (Rope or DB)": {
    category: "Arms",
    equipment: "MC",
    alternatives: ["Triceps Rope Pushdowns + Dips (Superset)"]
  },
  "Triceps Rope Pushdowns + Dips (Superset)": {
    category: "Arms",
    equipment: "MC",
    alternatives: ["Overhead Triceps Extensions (Rope or DB)"]
  },
  "Side Plank Reach-Throughs": {
    category: "Core",
    equipment: "BW",
    alternatives: ["Russian Twists (Weighted)", "Knee Raises + In-and-Out Crunches"]
  },
  "Russian Twists (Weighted)": {
    category: "Core",
    equipment: "DB",
    alternatives: ["Side Plank Reach-Throughs", "Cable Woodchoppers or Weighted Decline Sit-Ups"]
  }
  ,
  // -------------------------
  // Cardio catalogue (separate exercise type)
  // -------------------------
  "Treadmill": {
    category: "Cardio",
    equipment: "MC",
    type: "cardio",
    alternatives: ["Bike (Stationary)", "Rowing Machine", "Stair Climber"]
  },
  "Bike (Stationary)": {
    category: "Cardio",
    equipment: "MC",
    type: "cardio",
    alternatives: ["Treadmill", "Rowing Machine", "Stair Climber"]
  },
  "Rowing Machine": {
    category: "Cardio",
    equipment: "MC",
    type: "cardio",
    alternatives: ["Treadmill", "Bike (Stationary)", "Ski Erg"]
  },
  "Stair Climber": {
    category: "Cardio",
    equipment: "MC",
    type: "cardio",
    alternatives: ["Treadmill", "Bike (Stationary)", "Incline Walk"]
  },
  "Ski Erg": {
    category: "Cardio",
    equipment: "MC",
    type: "cardio",
    alternatives: ["Rowing Machine", "Bike (Stationary)", "Treadmill"]
  },
  "Incline Walk": {
    category: "Cardio",
    equipment: "MC",
    type: "cardio",
    alternatives: ["Treadmill", "Stair Climber"]
  }
};

const exerciseCategories = {
  Back: ["Wide-Grip Pull-Ups or Lat Pulldown", "Bent-Over Barbell Rows", "One-Arm DB Rows or Machine Row (Superset)", "Straight-Arm Rope Pulldown"],
  Chest: ["Incline Barbell or Dumbbell Press", "Chest Press (Machine)", "Cable Fly (High to Low)", "Incline Chest Fly (DB)"],
  Shoulders: ["Rear Delt Cable Fly (Face Pull Style)", "Rear Delt Bent-Over Flys", "Side-Angle DB Lateral Raise", "Seated DB Shoulder Press or Military Press", "Front DB Raise or Barbell Raise"],
  Legs: ["Front Squats (BB or Goblet)", "Leg Press", "Romanian Deadlift (BB or DB)", "Walking Lunges (DB)", "Leg Extensions (Slow Tempo)"],
  Arms: ["DB Hammer Curl + EZ-Bar Curl (Superset)", "Bicep Spider Curls + Rope Hammer Curls (Superset)", "Triceps Rope Pushdowns + Dips (Superset)", "Overhead Triceps Extensions (Rope or DB)"],
  Core: ["Side Plank Reach-Throughs", "Russian Twists (Weighted)", "Cable Woodchoppers or Weighted Decline Sit-Ups", "Knee Raises + In-and-Out Crunches"],
  Cardio: ["Treadmill", "Bike (Stationary)", "Rowing Machine", "Stair Climber", "Ski Erg", "Incline Walk"]
};

function isCardioExercise(exerciseName) {
  const meta = exerciseLibrary?.[exerciseName] || {};
  return (meta.type === "cardio") || (meta.category === "Cardio");
}
// -------------------------
// Expanded exercise catalogue (auto-generated from your master list)
// -------------------------
const TM_RAW_EXERCISES = `
Chest

Barbell Bench Press
Incline Barbell Bench Press
Decline Barbell Bench Press
Dumbbell Bench Press
Incline Dumbbell Bench Press
Decline Dumbbell Bench Press
Chest Press Machine
Incline Chest Press Machine
Smith Machine Bench Press
Smith Machine Incline Bench Press
Smith Machine Decline Bench Press
Floor Press (Barbell)
Floor Press (Dumbbell)
Spoto Press
Guillotine Press
Single-Arm Dumbbell Bench Press
Neutral-Grip Dumbbell Bench Press
Dumbbell Fly
Incline Dumbbell Fly
Decline Dumbbell Fly
Cable Chest Fly (High to Low)
Cable Chest Fly (Low to High)
Single-Arm Cable Chest Fly
Cable Chest Press
Single-Arm Cable Chest Press
Pec Deck / Chest Fly Machine
Push-Up
Incline Push-Up
Decline Push-Up
Weighted Push-Up
Push-Up (Banded)
Isometric Push-Up Hold
Ring Push-Up
Ring Fly
Deficit Push-Up
Dips (Chest Focus)
Resistance Band Chest Press (Banded)
Resistance Band Chest Fly (Banded)
Resistance Band Incline Chest Press (Banded)

Back

Deadlift
Romanian Deadlift
Sumo Deadlift
Trap Bar Deadlift
Deficit Deadlift
Rack Pull
Good Morning
Pull-Up
Chin-Up
Assisted Pull-Up
Inverted Row
Inverted Row (Feet Elevated)
Australian Row
Ring Row
Lat Pulldown (Wide Grip)
Lat Pulldown (Close Grip)
Neutral-Grip Lat Pulldown
Single-Arm Lat Pulldown
Seated Cable Row
Single-Arm Cable Row
Bent-Over Barbell Row
Pendlay Row
Seal Row
Meadows Row
Kroc Row
Dumbbell Row
Chest-Supported Dumbbell Row
T-Bar Row
Machine Row
Straight-Arm Pulldown
Face Pull
Resistance Band Lat Pulldown (Banded)
Resistance Band Row (Banded)
Resistance Band Face Pull (Banded)
Resistance Band Straight-Arm Pulldown (Banded)
Back Extension / Hyperextension
Reverse Hyperextension
Jefferson Curl

Legs

Back Squat
Front Squat
Pause Squat
Tempo Squat
Box Squat
Goblet Squat
Zercher Squat
Smith Machine Squat
Belt Squat
Hack Squat
Leg Press
Single-Leg Press
Bulgarian Split Squat
Split Squat
Walking Lunge
Reverse Lunge
Curtsy Lunge
Step-Up
Cossack Squat
Romanian Deadlift
Stiff-Leg Deadlift
Single-Leg Romanian Deadlift
Hip Thrust
Barbell Hip Thrust
Glute Bridge
Cable Pull-Through
Nordic Hamstring Curl
Seated Leg Curl
Lying Leg Curl
Standing Leg Curl
Leg Extension
Standing Calf Raise
Seated Calf Raise
Donkey Calf Raise
Standing Single-Leg Calf Raise
Tibialis Raise
Sled Push
Sled Pull
Resistance Band Squat (Banded)
Resistance Band Hip Thrust (Banded)
Resistance Band Lateral Walk (Banded)
Resistance Band Glute Kickback (Banded)

Biceps

Barbell Curl
EZ-Bar Curl
Dumbbell Curl
Alternating Dumbbell Curl
Incline Dumbbell Curl
Preacher Curl
Machine Bicep Curl
Concentration Curl
Cable Curl
Single-Arm Cable Curl
High Cable Curl
Low Cable Curl
Bayesian Cable Curl
Hammer Curl
Cross-Body Hammer Curl
Reverse Barbell Curl
Reverse EZ-Bar Curl
Spider Curl
Drag Curl
Zottman Curl
Offset Dumbbell Curl
Fat-Grip Dumbbell Curl
Isometric Curl Hold
Resistance Band Curl (Banded)
Resistance Band Hammer Curl (Banded)
Resistance Band Preacher Curl (Banded)
Chin-Up (Biceps Focus)

Triceps

Close-Grip Bench Press
Neutral-Grip Close-Grip Bench Press
Skull Crushers (Barbell)
EZ-Bar Skull Crushers
Dumbbell Skull Crushers
Floor Skull Crushers
JM Press
Overhead Dumbbell Tricep Extension
Single-Arm Overhead Dumbbell Extension
Cable Tricep Pushdown (Rope)
Cable Tricep Pushdown (Bar)
Single-Arm Cable Extension
Overhead Cable Tricep Extension
Cable Kickback
Dumbbell Kickback
Bench Dips
Dips (Triceps Focus)
Close-Grip Push-Up
Push-Up (Banded)
Machine Tricep Extension
Tate Press
Resistance Band Pushdown (Banded)
Resistance Band Overhead Extension (Banded)
Resistance Band Kickback (Banded)
Isometric Tricep Extension Hold

Shoulders

Overhead Barbell Press
Push Press
Z Press
Bradford Press
Dumbbell Shoulder Press
Single-Arm Dumbbell Shoulder Press
Arnold Press
Neutral-Grip Shoulder Press
Seated Shoulder Press Machine
Smith Machine Shoulder Press
Lateral Raise
Dumbbell Lateral Raise
Cable Lateral Raise
Lean-Away Cable Lateral Raise
Lateral Raise (Banded)
Front Raise (Dumbbell)
Front Raise (Plate)
Front Raise (Banded)
Rear Delt Fly (Dumbbell)
Rear Delt Fly (Machine)
Cable Rear Delt Fly
Rear Delt Fly (Banded)
Upright Row
Upright Row (Banded)
Face Pull
Shoulder Press (Banded)
Cuban Press
Plate Raise
Y-Raise
IYT Raises
Scaption Raise
Isometric Lateral Raise Hold
Handstand Push-Up
Pike Push-Up

Core

Plank
Plank (Weighted)
Side Plank
Side Plank with Reach
Copenhagen Plank
Hollow Body Hold
Dead Bug
Bird Dog
Hanging Leg Raise
Hanging Knee Raise
Captain’s Chair Leg Raise
Toes-to-Bar
Lying Leg Raise
Reverse Crunch
Crunch
Cable Crunch
Resistance Band Crunch (Banded)
Sit-Up (Weighted or Bodyweight)
V-Up
Dragon Flag
L-Sit Hold
Russian Twist
Bicycle Crunch
Mountain Climbers
Ab Wheel Rollout
Swiss Ball Rollout
Stability Ball Crunch
Woodchopper (Cable)
Resistance Band Woodchopper (Banded)
Pallof Press
Resistance Band Pallof Press (Banded)
Farmer’s Carry
Suitcase Carry

`;

function tmNormalizeLine(s){ return (s||"").replace(/\s+/g," ").trim(); }

function tmParseRawExerciseList(rawText){
  const lines = String(rawText||"").split(/\r?\n/).map(tmNormalizeLine).filter(Boolean);
  const headers = new Set(["Chest","Back","Legs","Biceps","Triceps","Shoulders","Core"]);
  const out = {}; let current=null;
  for (const line of lines){
    if (headers.has(line)){ current=line; out[current]=out[current]||[]; continue; }
    if (!current) continue;
    out[current].push(line);
  }
  Object.keys(out).forEach((k)=>{ const seen=new Set(); out[k]=out[k].filter((n)=>{const key=n.toLowerCase(); if(seen.has(key)) return false; seen.add(key); return true;});});
  return out;
}

function tmInferEquipmentCode(name){
  const n=(name||"").toLowerCase();
  if (n.includes("kettlebell") || /\bkb\b/.test(n)) return "KB";
  if (n.includes("barbell") || n.includes("ez-bar") || n.includes("ez bar")) return "BB";
  if (n.includes("dumbbell") || /\bdb\b/.test(n)) return "DB";
  if (n.includes("smith") || n.includes("machine") || n.includes("cable") || n.includes("pec deck") || n.includes("pulldown") || n.includes("leg press")) return "MC";
  if (n.includes("band") || n.includes("banded") || n.includes("bodyweight") || n.includes("push-up") || n.includes("pull-up") || n.includes("chin-up") || n.includes("plank") || n.includes("carry") || n.includes("hollow") || n.includes("dead bug") || n.includes("bird dog")) return "BW";
  return "MC";
}

function tmInferMovementPattern(name, bodyPart){
  const n=(name||"").toLowerCase();
  const bp=(bodyPart||"").toLowerCase();
  if (bp==="core"){
    if (n.includes("pallof")) return "Anti-rotation";
    if (n.includes("woodchopper") || n.includes("twist")) return "Rotation";
    if (n.includes("carry")) return "Loaded carry";
    if (n.includes("plank") || n.includes("hollow") || n.includes("dead bug") || n.includes("bird dog")) return "Anti-extension";
    if (n.includes("leg raise") || n.includes("knee raise") || n.includes("toes-to-bar") || n.includes("sit-up") || n.includes("crunch") || n.includes("v-up")) return "Hip flexion / Trunk flexion";
    return "Core stability";
  }
  if (n.includes("overhead") || n.includes("shoulder press") || n.includes("push press") || n.includes("z press") || n.includes("bradford") || n.includes("handstand") || n.includes("pike push-up")) return "Vertical press";
  if (n.includes("press") || n.includes("push-up") || n.includes("dip")) return "Horizontal press";
  if (n.includes("row")) return "Horizontal pull";
  if (n.includes("pull-up") || n.includes("chin-up") || n.includes("pulldown")) return "Vertical pull";
  if (n.includes("squat") || n.includes("lunge") || n.includes("step-up") || n.includes("split squat") || n.includes("leg press")) return "Knee dominant";
  if (n.includes("deadlift") || n.includes("good morning") || n.includes("hip thrust") || n.includes("glute bridge") || n.includes("pull-through") || n.includes("hamstring") || n.includes("hyperextension") || n.includes("back extension")) return "Hip hinge";
  if (n.includes("calf") || n.includes("tibialis")) return "Ankle / Calf";
  if (n.includes("curl")) return "Elbow flexion";
  if (n.includes("extension") || n.includes("pushdown") || n.includes("skull")) return "Elbow extension";
  if (n.includes("raise") || n.includes("fly") || n.includes("scaption") || n.includes("cuban") || n.includes("iyt")) return "Shoulder isolation";
  return "General";
}

function tmInferDifficulty(name){
  const n=(name||"").toLowerCase();
  if (n.includes("dragon flag") || n.includes("jefferson curl") || n.includes("nordic") || n.includes("handstand") || n.includes("deficit deadlift") || n.includes("meadows row") || n.includes("kroc row")) return "Advanced";
  if (n.includes("deadlift") || n.includes("squat") || n.includes("good morning") || n.includes("pendlay") || n.includes("seal row") || n.includes("push press") || n.includes("z press")) return "Intermediate";
  if (n.includes("pull-up") || n.includes("chin-up")) return n.includes("assisted") ? "Beginner" : "Intermediate";
  return "Beginner";
}

function tmInferMuscles(name, bodyPart){
  const n=(name||"").toLowerCase();
  const bp=(bodyPart||"").toLowerCase();
  if (bp==="chest"){
    const secondary=["Anterior deltoids"];
    if (n.includes("press") || n.includes("push-up") || n.includes("dip")) secondary.push("Triceps");
    return { muscleEmphasis: n.includes("incline") ? "Upper chest" : (n.includes("decline") ? "Lower chest" : "Mid chest"), primary:"Pectorals", secondary };
  }
  if (bp==="back"){
    const primary=(n.includes("deadlift")||n.includes("good morning")||n.includes("hyperextension")) ? "Posterior chain" : "Lats / Upper back";
    const secondary=[];
    if (n.includes("row")||n.includes("pulldown")||n.includes("pull-up")||n.includes("chin-up")) secondary.push("Biceps");
    secondary.push("Rear deltoids");
    return { muscleEmphasis: n.includes("row") ? "Mid-back" : (n.includes("pulldown")||n.includes("pull-up") ? "Lats" : "Posterior chain"), primary, secondary };
  }
  if (bp==="legs"){
    if (n.includes("calf")) return { muscleEmphasis:"Calves", primary:"Calves", secondary:["Tibialis (if applicable)"] };
    if (n.includes("tibialis")) return { muscleEmphasis:"Tibialis", primary:"Tibialis anterior", secondary:["Calves"] };
    if (n.includes("deadlift")||n.includes("hip thrust")||n.includes("glute")||n.includes("hamstring")||n.includes("pull-through")) return { muscleEmphasis:"Posterior chain", primary:"Glutes / Hamstrings", secondary:["Lower back"] };
    return { muscleEmphasis:"Quads", primary:"Quadriceps", secondary:["Glutes","Hamstrings"] };
  }
  if (bp==="biceps") return { muscleEmphasis: n.includes("incline") ? "Long head" : "Overall", primary:"Biceps", secondary:[(n.includes("hammer")||n.includes("reverse"))?"Brachialis / Forearms":"Forearms"] };
  if (bp==="triceps") return { muscleEmphasis: n.includes("overhead") ? "Long head" : "Overall", primary:"Triceps", secondary:[(n.includes("close-grip")||n.includes("bench"))?"Chest / Anterior deltoids":"Shoulders"] };
  if (bp==="shoulders"){
    const secondary=[]; if (n.includes("press")) secondary.push("Triceps"); if (n.includes("rear")||n.includes("face pull")) secondary.push("Upper back");
    return { muscleEmphasis: n.includes("lateral")?"Lateral delts":(n.includes("rear")?"Rear delts":(n.includes("front")?"Anterior delts":"Overall")), primary:"Deltoids", secondary: secondary.length?secondary:["Upper back"] };
  }
  if (bp==="core"){
    const secondary=[]; if (n.includes("carry")) secondary.push("Grip / Upper back"); if (n.includes("side plank")||n.includes("copenhagen")) secondary.push("Obliques / Adductors");
    return { muscleEmphasis: (n.includes("woodchopper")||n.includes("twist"))?"Rotational":"Stability", primary:"Core", secondary: secondary.length?secondary:["Hip flexors (if applicable)"] };
  }
  return { muscleEmphasis:"General", primary:bodyPart, secondary:[] };
}

function tmMapBodyPartToCategory(bodyPart){ return (bodyPart==="Biceps"||bodyPart==="Triceps") ? "Arms" : bodyPart; }

function tmBuildExerciseCatalog(){
  const byPart=tmParseRawExerciseList(TM_RAW_EXERCISES);
  const out=[];
  Object.keys(byPart).forEach((bodyPart)=>{
    byPart[bodyPart].forEach((name)=>{
      const equipment=tmInferEquipmentCode(name);
      const movementPattern=tmInferMovementPattern(name, bodyPart);
      const difficulty=tmInferDifficulty(name);
      const m=tmInferMuscles(name, bodyPart);
      out.push({ name, bodyPart, movementPattern, difficulty, equipment, muscleEmphasis:m.muscleEmphasis, primary:m.primary, secondary:m.secondary });
    });
  });
  const seen=new Set();
  return out.filter((e)=>{ const key=(e.name||"").toLowerCase(); if(seen.has(key)) return false; seen.add(key); return true; });
}

const TM_EXERCISE_CATALOG = tmBuildExerciseCatalog();

(function tmMergeIntoExistingLibraries(){
  ["Back","Chest","Shoulders","Legs","Arms","Core"].forEach((k)=>{ if(!exerciseCategories[k]) exerciseCategories[k]=[]; });
  TM_EXERCISE_CATALOG.forEach((e)=>{
    const cat=tmMapBodyPartToCategory(e.bodyPart);
    if (Array.isArray(exerciseCategories[cat]) && !exerciseCategories[cat].includes(e.name)) exerciseCategories[cat].push(e.name);
    if (!exerciseLibrary[e.name]) exerciseLibrary[e.name]={ category:cat, equipment:e.equipment, alternatives:[] };
    if (!exerciseDescriptions[e.name]){
      const secondary = Array.isArray(e.secondary)&&e.secondary.length ? e.secondary.join(", ") : "";
      exerciseDescriptions[e.name]={ muscles: secondary ? `${e.primary} (primary); ${secondary} (secondary)` : `${e.primary} (primary)`, description:"Description to be added." };
    }
  });
})();



// -------------------------
// BMI / Units helpers
// -------------------------
function calculateBMI(weight, height, units) {
  if (!weight || !height) return null;
  let kg;
  let metres;

  if (units === "imperial") {
    kg = weight * 0.453592;
    metres = height * 0.0254;
  } else {
    kg = weight;
    metres = height / 100;
  }
  if (!metres || metres <= 0) return null;
  return kg / (metres * metres);
}


// -------------------------
// Units conversion helpers
// -------------------------
function getActiveUnits() {
  const profile = readJSON(STORAGE_KEYS.profile, null);
  const prefs = readJSON(STORAGE_KEYS.prefs, {});
  const u = profile?.units || prefs?.units || "metric";
  return (u === "imperial") ? "imperial" : "metric";
}

function getWeightUnitLabel(units) {
  const u = units || getActiveUnits();
  return u === "imperial" ? "lb" : "kg";
}

function kgToLb(kg) { return Number(kg) * 2.2046226218; }
function lbToKg(lb) { return Number(lb) * 0.45359237; }

function roundWeightForDisplay(val, units) {
  const n = Number(val);
  if (!isFinite(n)) return "";
  // Keep display clean: kg to 1 decimal (if needed), lb to whole number
  if (units === "imperial") return String(Math.round(n));
  const oneDec = Math.round(n * 10) / 10;
  // Strip trailing .0
  return (Math.abs(oneDec - Math.round(oneDec)) < 1e-9) ? String(Math.round(oneDec)) : String(oneDec);
}

function toDisplayWeightFromKg(kgVal, units) {
  const kg = Number(kgVal);
  if (!isFinite(kg)) return "";
  return units === "imperial" ? roundWeightForDisplay(kgToLb(kg), units) : roundWeightForDisplay(kg, units);
}

function toKgFromDisplayWeight(displayVal, units) {
  const n = Number(displayVal);
  if (!isFinite(n)) return "";
  const kg = (units === "imperial") ? lbToKg(n) : n;
  // store with one decimal precision max
  const oneDec = Math.round(kg * 10) / 10;
  return String(oneDec);
}

function getWeightIncrementInUserUnits(equipmentCode, units) {
  const incKg = getIncrementForEquipment(equipmentCode);
  if ((units || getActiveUnits()) === "imperial") {
    // 2.5 kg ≈ 5 lb; 1 kg ≈ 2.2 lb (use 2.5 lb for DB/KB to feel natural)
    const code = (equipmentCode || "MC").toUpperCase();
    if (code === "BB" || code === "MC") return 5;
    if (code === "DB" || code === "KB") return 2.5;
    return 0;
  }
  return incKg;
}

function roundToUserIncrement(value, equipmentCode, units) {
  const inc = getWeightIncrementInUserUnits(equipmentCode, units);
  if (!Number.isFinite(value)) return null;
  if (!Number.isFinite(inc) || inc <= 0) return value;
  return Math.round(value / inc) * inc;
}

function formatSuggestedWeightFromKg(kgValue, equipmentCode) {
  const units = getActiveUnits();
  if (!Number.isFinite(kgValue) || kgValue <= 0) return "";
  if (units === "imperial") {
    const lb = kgToLb(kgValue);
    const rounded = roundToUserIncrement(lb, equipmentCode, units);
    return (Number.isFinite(rounded) ? rounded : lb).toFixed(0);
  }
  // metric
  const rounded = roundToUserIncrement(kgValue, equipmentCode, units);
  return (Number.isFinite(rounded) ? rounded : kgValue).toFixed(0);
}

function formatWeightPill(valueKgStrOrNum, equipmentCode) {
  const units = getActiveUnits();
  const unit = getWeightUnitLabel(units);
  const v = String(valueKgStrOrNum ?? "").trim();
  if (!v) return unit;
  const display = toDisplayWeightFromKg(v, units);
  return display ? `${display} ${unit}` : unit;
}


// -------------------------
// 1RM + Working weight helpers
// -------------------------
function estimateOneRM(weightKg, reps) {
  const w = Number(weightKg);
  const r0 = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r0) || r0 <= 0) return null;
  const r = Math.min(r0, 12);
  return w * (1 + r / 30);
}

function getPercentForReps(targetReps) {
  const r = parseInt(targetReps, 10);
  if (!Number.isFinite(r) || r <= 0) return null;
  if (r <= 5) return 0.85;
  if (r <= 6) return 0.80;
  if (r <= 8) return 0.75;
  if (r <= 10) return 0.70;
  if (r <= 12) return 0.65;
  return 0.60;
}

function roundToIncrement(value, increment) {
  if (!Number.isFinite(value)) return null;
  if (!Number.isFinite(increment) || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

function calcWorkingWeightKg(oneRMKg, targetReps, equipmentCode) {
  const oneRM = Number(oneRMKg);
  if (!Number.isFinite(oneRM) || oneRM <= 0) return null;
  const pct = getPercentForReps(targetReps);
  if (!pct) return null;

  const raw = oneRM * pct;
  const code = (equipmentCode || "").toUpperCase();
  const increment = (code === "BB" || code === "MC") ? 2.5 : 1;
  return roundToIncrement(raw, increment);
}

function getTargetRepsFromPrescription(prescription) {
  const p = (prescription || "").replace(/\s+/g, " ").trim();
  // Prefer range, then explicit x, then any number
  const range = p.match(/(\d{1,2})\s*[–-]\s*(\d{1,2})/);
  if (range) {
    const a = parseInt(range[1], 10);
    const b = parseInt(range[2], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  }
  const single = p.match(/[x×]\s*(\d{1,2})\b/);
  if (single) return parseInt(single[1], 10);

  const any = p.match(/\b(\d{1,2})\b/);
  if (any) return parseInt(any[1], 10);

  return null;
}

// Map key lifts to stored 1RM keys
const oneRMKeyMap = {
  "Bent-Over Barbell Rows": "row",
  "Incline Barbell or Dumbbell Press": "bench_press",
  "Front Squats (BB or Goblet)": "squat",
  "Romanian Deadlift (BB or DB)": "deadlift"
};

function isCoreOrBW(exName) {
  const n = (exName || "").toLowerCase();
  return (
    n.includes("plank") ||
    n.includes("reach-through") ||
    n.includes("knee raises") ||
    n.includes("crunch") ||
    n.includes("rollout") ||
    n.includes("hanging") ||
    n.includes("woodchopper") ||
    n.includes("twist")
  );
}

// Conservative caps for isolation/cable
function profileFallbackSuggestionKg(exName, profileWeightKg, equipmentCode) {
  if (isCoreOrBW(exName)) return "00";

  const n = (exName || "").toLowerCase();
  const hasProfile = Number.isFinite(profileWeightKg) && profileWeightKg > 0;

  let raw;

  if (hasProfile) {
    let factor = 0.45;

    if (n.includes("squat") || n.includes("deadlift") || n.includes("leg press") || n.includes("hip thrust") || n.includes("glute bridge")) {
      factor = 0.70;
    } else if (n.includes("press") || n.includes("row") || n.includes("pulldown") || n.includes("pull-up")) {
      factor = 0.50;
    }

    if (n.includes("rear delt") || n.includes("lateral raise") || n.includes("front raise") || n.includes("fly") ||
        n.includes("curl") || n.includes("triceps") || n.includes("extension") || n.includes("straight-arm")) {
      factor = 0.20;
    }

    raw = profileWeightKg * factor;
  } else {
    // Conservative defaults (kg) used when profile/1RM has been cleared.
    if (n.includes("rear delt") || n.includes("lateral raise") || n.includes("front raise")) raw = 6;
    else if (n.includes("fly")) raw = 10;
    else if (n.includes("curl")) raw = 12;
    else if (n.includes("triceps") || n.includes("extension")) raw = 15;
    else if (n.includes("straight-arm") || n.includes("rope pulldown")) raw = 20;
    else if (n.includes("pulldown") || n.includes("row") || n.includes("press")) raw = 30;
    else if (n.includes("leg press")) raw = 60;
    else if (n.includes("squat") || n.includes("deadlift")) raw = 40;
    else raw = 20;
  }

  // caps
  if (n.includes("rear delt") || n.includes("lateral raise") || n.includes("front raise")) raw = Math.min(raw, 12);
  if (n.includes("curl")) raw = Math.min(raw, 20);
  if (n.includes("triceps") || n.includes("extension")) raw = Math.min(raw, 25);
  if (n.includes("straight-arm") || n.includes("rope pulldown")) raw = Math.min(raw, 35);
  if (n.includes("fly")) raw = Math.min(raw, 30);

  const inc = (equipmentCode === "BB" || equipmentCode === "MC") ? 2.5 : 1;
  const rounded = roundToIncrement(raw, inc);
  return rounded ? String(rounded) : "";
}

function getOneRMBasedSuggestion(exName, targetReps, equipmentCode) {
  if (isCoreOrBW(exName)) return "00";
  const key = oneRMKeyMap[exName];
  if (!key) return "";
  const oneRMData = readJSON(STORAGE_KEYS.oneRM, {});
  const oneRM = oneRMData?.[key];
  if (!Number.isFinite(oneRM) || oneRM <= 0) return "";
  const suggested = calcWorkingWeightKg(oneRM, targetReps, equipmentCode);
  return suggested ? formatSuggestedWeightFromKg(suggested, equipmentCode) : "";
}

// -------------------------
// Progressive overload (week-to-week suggestion)
// -------------------------
function getIncrementForEquipment(equipmentCode) {
  const code = (equipmentCode || "MC").toUpperCase();
  if (code === "BB" || code === "MC") return 2.5;
  if (code === "DB" || code === "KB") return 1;
  return 0;
}

function meetsTargetReps(actualReps, targetReps) {
  const a = parseInt(actualReps, 10);
  const t = parseInt(targetReps, 10);
  if (!Number.isFinite(a) || !Number.isFinite(t) || t <= 0) return false;
  return a >= t;
}

// -------------------------
// Program data (Week 1 template; weeks cloned)
// -------------------------
const programWeek1 = [
  {
    id: "day1_pull",
    theme: "PULL",
    goal: "Back thickness, rear delts, biceps, core control",
    exercises: [
      { name: "Wide-Grip Pull-Ups or Lat Pulldown", prescription: "4 × 6–8", notes: "Weighted if possible" },
      { name: "Bent-Over Barbell Rows", prescription: "4 × 8" },
      { name: "One-Arm DB Rows or Machine Row (Superset)", prescription: "3 × 12", notes: "Superset variation" },
      { name: "Straight-Arm Rope Pulldown", prescription: "3 × 15", notes: "Time under tension" },
      { name: "Rear Delt Cable Fly (Face Pull Style)", prescription: "3 × 15–20" },
      { name: "DB Hammer Curl + EZ-Bar Curl (Superset)", prescription: "3 × 12 each" },
      { name: "Side Plank Reach-Throughs", prescription: "3 × 10/side", notes: "Core" }
    ]
  },
  {
    id: "day2_posterior",
    theme: "LOWER",
    goal: "Hamstring, glute, and lower back hypertrophy",
    exercises: [
      { name: "Leg Press", prescription: "4 × 10" },
      { name: "Romanian Deadlift (BB or DB)", prescription: "4 × 10" },
      { name: "Glute Bridges or Hip Thrusts (Weighted)", prescription: "3 × 12" },
      { name: "Walking Lunges (DB)", prescription: "3 × 16 steps" },
      { name: "Seated Leg Curl or Nordic Curl", prescription: "3 × 12" },
      { name: "Reverse Hyperextension or Back Extensions", prescription: "3 × 15" },
      { name: "Ab Rollouts or Hanging Leg Raises", prescription: "3 × 10–12", notes: "Core" }
    ]
  },
  {
    id: "day3_push",
    theme: "PUSH",
    goal: "Chest, shoulder, and triceps strength & hypertrophy",
    exercises: [
      { name: "Incline Barbell or Dumbbell Press", prescription: "4 × 8–10" },
      { name: "Cable Fly (High to Low)", prescription: "3 × 15" },
      { name: "Seated DB Shoulder Press or Military Press", prescription: "4 × 10" },
      { name: "Side-Angle DB Lateral Raise", prescription: "3 × 15" },
      { name: "Overhead Triceps Extensions (Rope or DB)", prescription: "3 × 12" },
      { name: "Front DB Raise or Barbell Raise", prescription: "2 × 15" },
      { name: "Russian Twists (Weighted)", prescription: "3 × 20", notes: "10/side, core" }
    ]
  },
  {
    id: "day5_quad",
    theme: "LOWER",
    goal: "Quad hypertrophy and single-leg strength",
    exercises: [
      { name: "Front Squats (BB or Goblet)", prescription: "4 × 8" },
      { name: "Leg Press (Wide Stance)", prescription: "3 × 12" },
      { name: "Step-Ups or Bulgarian Split Squats (DB)", prescription: "3 × 10/leg" },
      { name: "Leg Extensions (Slow Tempo)", prescription: "3 × 15" },
      { name: "Thigh Abduction + Adduction (Superset)", prescription: "3 × 20 each" },
      { name: "Cable Woodchoppers or Weighted Decline Sit-Ups", prescription: "3 × 12", notes: "Core" }
    ]
  },
  {
    id: "day6_pump",
    theme: "PUMP",
    goal: "Isolation, blood flow, arm-pump day",
    exercises: [
      { name: "Chest Press (Machine)", prescription: "3 × 12" },
      { name: "DB Arnold Press + Lateral Raise (Superset)", prescription: "3 × 12 each" },
      { name: "Bicep Spider Curls + Rope Hammer Curls (Superset)", prescription: "3 × 12 each" },
      { name: "Triceps Rope Pushdowns + Dips (Superset)", prescription: "3 × 12 each" },
      { name: "Incline Chest Fly (DB)", prescription: "3 × 15" },
      { name: "Rear Delt Bent-Over Flys", prescription: "3 × 15–20" },
      { name: "Knee Raises + In-and-Out Crunches", prescription: "2 rounds", notes: "Core circuit" }
    ]
  }
];

const WEEKS_IN_SERIES = 6;

function buildCustomWeekTemplateFromDraft(draft) {
  const d = normaliseCustomProgramDraft(draft);
  const name = (d?.name || "").toString().trim() || "Custom Program";
  const days = (d?.days && typeof d.days === "object") ? d.days : {};

  const week = [];
  for (let i = 1; i <= 7; i++) {
    const key = String(i);
    const exs = Array.isArray(days[key]) ? days[key] : [];
    week.push({
      id: `custom_day${i}`,
      theme: `DAY ${i}`,
      goal: name,
      exercises: exs.map((x) => ({
        name: (x.name || "").toString(),
        prescription: (x.prescription || "").toString(),
        notes: (x.notes || "").toString(),
        // Preserve builder-defined metadata so the workout screen can render consistently.
        equipment: (x.equipment || "").toString(),
        setCount: Number.isFinite(parseInt(x.setCount, 10)) ? Math.min(10, Math.max(1, parseInt(x.setCount, 10))) : undefined
      })).filter((x) => x.name.trim().length > 0)
    });
  }
  return week;
}

function loadCustomProgramForSeries(seriesName) {
  const key = customProgramStorageKeyForSeries(seriesName);
  const raw = readJSON(key, null);
  const d = normaliseCustomProgramDraft(raw);
  return d && d.name ? d : null;
}


// Open a stored custom programme in the builder for editing.
// dayNumber is 1–7.
function openProgrammeInBuilder(seriesName, dayNumber) {
  const name = (seriesName || "").toString().trim();
  if (!name) return;

  const program = loadCustomProgramForSeries(name);
  if (!program) {
    // Allow editing of the *current draft* even if it has not been saved as a programme definition.
    // This prevents confusing dead-end cards where Continue/Edit cannot load anything.
    const draft = getCustomProgramDraft();
    if (!draft || canonicalSeriesName(draft.name) !== canonicalSeriesName(name)) {
      alert("Could not load this programme for editing.");
      return;
    }
    setActiveSeriesName(name);
    showScreen("screen-custom-builder");
    const daySel = document.getElementById("custom-day-select");
    if (daySel) {
      const d = Math.min(7, Math.max(1, parseInt(dayNumber || 1, 10) || 1));
      daySel.value = String(d);
    }
    syncProgramDraftUI();
    renderCustomBuilderForCurrentDay();
    return;
  }

  // Load into the draft store so the builder can render/edit.
  writeCustomProgramDraft({ name: program.name, days: program.days, updatedAt: Date.now() });
  setActiveSeriesName(name);

  showScreen("screen-custom-builder");

  const daySel = document.getElementById("custom-day-select");
  if (daySel) {
    const d = Math.min(7, Math.max(1, parseInt(dayNumber || 1, 10) || 1));
    daySel.value = String(d);
  }

  syncProgramDraftUI();
  renderCustomBuilderForCurrentDay();
}

function deleteCustomProgramme(seriesName) {
  const name = (seriesName || "").toString().trim();
  if (!name) return false;

  const canon = canonicalSeriesName(name);

  if (!confirm(`Delete "${name}"? This will remove the programme card and clear its saved progress.`)) return false;

  // Remove programme definition (robust: match by stored payload name, not by key decoding)
  try {
    // Remove the primary definition key first (fast path)
    localStorage.removeItem(customProgramStorageKeyForSeries(name));

    // Defensive sweep: remove any custom programme keys whose *stored programme name*
    // canonicalises to the same value. This handles earlier builds where key sanitisation
    // (underscores / punctuation removal / casing) caused mismatches.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      const isCurrent = k.startsWith("trackmateCustomProgram::");
      const isLegacy1 = k.startsWith("trackmateCustomProgram:");
      const isLegacy2 = k.startsWith("trackmateCustomProgramme::");
      if (!isCurrent && !isLegacy1 && !isLegacy2) continue;
      const payload = readJSON(k, null);
      const payloadName = (payload && typeof payload === "object" ? (payload.name || "") : "").toString();
      if (payloadName && canonicalSeriesName(payloadName) === canon) {
        try { localStorage.removeItem(k); } catch (_) {}
      }
    }
  } catch (_) {}

  // If the current draft matches this programme, clear it so it does not re-appear
  // as a "Draft programme" card after deletion.
  try {
    const draft = getCustomProgramDraft();
    if (draft && canonicalSeriesName(draft.name) === canon) {
      localStorage.removeItem(STORAGE_KEYS.customProgramDraft);
      // Legacy draft keys (older builds)
      try { localStorage.removeItem("trackmateCustomProgrammeDraft"); } catch (_) {}
    }
  } catch (_) {}

  // Remove progress state for this series (robust: match workout state by stored seriesName)
  try {
    localStorage.removeItem(workoutStateStorageKeyForSeries(name));
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith("trackmateWorkoutState::")) continue;
      const payload = readJSON(k, null);
      const payloadSeries = (payload && typeof payload === "object" ? (payload.seriesName || payload.series || "") : "").toString();
      if (payloadSeries && canonicalSeriesName(payloadSeries) === canon) {
        try { localStorage.removeItem(k); } catch (_) {}
      }
    }
  } catch (_) {}

  // Remove from registry
  try {
    const reg = getSeriesRegistry();
    if (reg) {
      Object.keys(reg).forEach((k) => {
        if (canonicalSeriesName(k) === canon) delete reg[k];
      });
      writeSeriesRegistry(reg);
    }
  } catch (_) {}

  // Remove history entries for this series
  try {
    const log = getHistoryLog();
    const cleaned = (log || []).filter((e) => {
      const s = (e?.series || DEFAULT_SERIES_NAME).toString();
      return canonicalSeriesName(s) !== canon;
    });
    writeHistoryLog(cleaned);
  } catch (_) {}

  // If this programme was active, revert to default.
  try {
    if (canonicalSeriesName(getActiveSeriesName()) === canon) setActiveSeriesName(DEFAULT_SERIES_NAME);
  } catch (_) {}

  return true;
}

function getProgramWeekTemplateForSeries(seriesName) {
  const name = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
  if (name === DEFAULT_SERIES_NAME) return programWeek1;

  const custom = loadCustomProgramForSeries(name);
  if (custom) return buildCustomWeekTemplateFromDraft(custom);

  // Fallback: if a custom series has no stored definition, show the default template.
  return programWeek1;
}

function getPlannedWorkoutDaysCountForSeries(seriesName) {
  const template = getProgramWeekTemplateForSeries(seriesName);
  if (!Array.isArray(template)) return 0;
  return template.reduce((acc, day) => {
    const exs = Array.isArray(day?.exercises) ? day.exercises : [];
    return acc + (exs.length > 0 ? 1 : 0);
  }, 0);
}

function getTotalPlannedWorkoutsForSeries(seriesName) {
  const days = getPlannedWorkoutDaysCountForSeries(seriesName);
  if (!days) return 0;
  return WEEKS_IN_SERIES * days;
}

// -------------------------
// Custom programme week independence (Weeks 1–6)
// -------------------------
// Custom programmes propagate their Week 1 template forward by default.
// Once a user edits a later week, that week becomes independent via a
// per-week template snapshot stored in workout state. Completed weeks are
// snapshotted when a day is marked completed so they are never mutated by
// later programme definition changes.

function getCustomWeekOverride(state, weekNumber) {
  try {
    const wKey = String(weekNumber);
    const o = state?.customWeekOverrides?.[wKey];
    return Array.isArray(o) ? o : null;
  } catch (_) {
    return null;
  }
}

function ensureCustomWeekOverride(seriesName, weekNumber) {
  const series = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
  const st = getWorkoutState(series);
  if (!st.customWeekOverrides || typeof st.customWeekOverrides !== "object") st.customWeekOverrides = {};
  const wKey = String(weekNumber);
  if (!Array.isArray(st.customWeekOverrides[wKey])) {
    // Snapshot from the *current* base template definition for this series.
    const base = getProgramWeekTemplateForSeries(series);
    st.customWeekOverrides[wKey] = deepClone(base);
    saveWorkoutState(st, series);
  }
  return st.customWeekOverrides[wKey];
}

function getProgramForWeek(weekNumber, seriesName) {
  // TrackMate uses a 6-week run.
  // - Built-in programme: the template repeats unchanged.
  // - Custom programmes: Week 1 propagates forward by default, but once a week is edited,
  //   that specific week becomes independent via a stored snapshot.
  const series = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
  const template = getProgramWeekTemplateForSeries(series);

  if (series === DEFAULT_SERIES_NAME) return deepClone(template);

  // Custom: if we have a per-week override, use it.
  const st = getWorkoutState(series);
  const o = getCustomWeekOverride(st, weekNumber);
  if (o) return deepClone(o);

  // Default: no override -> Week 1 template propagates forward.
  return deepClone(template);
}

// -------------------------
// Workout state persistence
// -------------------------
function migrateLegacyWorkoutStateIfNeeded(seriesName) {
  const series = (seriesName || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME;
  const legacyRaw = localStorage.getItem(STORAGE_KEYS.workoutState);
  if (!legacyRaw) return;

  const targetKey = workoutStateStorageKeyForSeries(series);
  const already = localStorage.getItem(targetKey);
  if (already) return;

  // Only migrate legacy state into the default series to avoid accidental cross-series contamination.
  if (series !== DEFAULT_SERIES_NAME) return;

  try {
    localStorage.setItem(targetKey, legacyRaw);
    // Keep legacy key for safety; do not remove.
  } catch (_) {}
}

function getWorkoutState(seriesName) {
  const series = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
  migrateLegacyWorkoutStateIfNeeded(series);
  const key = workoutStateStorageKeyForSeries(series);
  const st = readJSON(key, { weeks: {} });

  // -------------------------
  // Sklar: defensive cleanup of any out-of-range day indices.
  // The built-in programme template uses consecutive day indices (0..4).
  // If any legacy builds wrote an out-of-range day (e.g. index 5), clamp it safely.
  if (series === DEFAULT_SERIES_NAME) {
    try {
      let changed = false;
      if (st && typeof st === "object" && st.weeks && typeof st.weeks === "object") {
        Object.keys(st.weeks).forEach((wKey) => {
          const weekObj = st.weeks[wKey];
          if (!weekObj || typeof weekObj !== "object") return;

          if (weekObj["5"] != null) {
            // Prefer preserving any existing Day 5 (index 4). If absent, move 5 -> 4.
            if (weekObj["4"] == null) weekObj["4"] = weekObj["5"];
            delete weekObj["5"];
            changed = true;
          }
        });
      }
      if (changed) writeJSON(key, st);
    } catch (_) {}
  }

return st;
}

function saveWorkoutState(state, seriesName) {
  const series = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
  const key = workoutStateStorageKeyForSeries(series);
  writeJSON(key, state);
}

// -------------------------
// Exercise-name override persistence (critical for edit sync)
// -------------------------
// Programme templates are deep-cloned on render.
// If a user edits an exercise name inside a workout, we must persist that
// change in state; otherwise it will appear to revert and will not remain
// consistent across screens (e.g., builder/programme views).

function setExerciseNameOverride(seriesName, week, dayIndex, exIndex, newName) {
  try {
    const series = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
    const st = getWorkoutState(series);
    const ds = ensureDayState(st, week, dayIndex);
    if (!ds.exerciseNameOverrides || typeof ds.exerciseNameOverrides !== "object") ds.exerciseNameOverrides = {};
    ds.exerciseNameOverrides[String(exIndex)] = (newName || "").toString();
    saveWorkoutState(st, series);
    return true;
  } catch (_) {
    return false;
  }
}

function getExerciseNameOverride(dayState, exIndex) {
  try {
    const o = dayState?.exerciseNameOverrides;
    if (!o || typeof o !== "object") return "";
    const v = o[String(exIndex)];
    return v ? v.toString() : "";
  } catch (_) {
    return "";
  }
}

// For custom programmes only: if an edit occurs in Week 1, mirror it into the
// saved programme definition so the "sheet" (builder) reflects the update.
// Later-week edits remain week-scoped and must not back-propagate into Week 1.
function mirrorWeek1ExerciseNameToCustomDefinition(seriesName, dayIndex, exIndex, newName) {
  try {
    const series = (seriesName || "").toString().trim();
    if (!series || series === DEFAULT_SERIES_NAME) return false;

    const program = loadCustomProgramForSeries(series);
    if (!program || !program.days) return false;

    const dayKey = String(dayIndex + 1); // builder uses 1–7
    const arr = Array.isArray(program.days?.[dayKey]) ? program.days[dayKey] : [];
    if (!(exIndex >= 0 && exIndex < arr.length)) return false;
    arr[exIndex].name = (newName || "").toString();
    program.days[dayKey] = arr;

    // Persist programme definition (offline-safe localStorage)
    writeJSON(customProgramStorageKeyForSeries(series), program);

    // If the user currently has the same programme open in the builder draft, sync it too.
    const draft = getCustomProgramDraft();
    if (draft && draft.name && canonicalSeriesName(draft.name) === canonicalSeriesName(series)) {
      const dArr = Array.isArray(draft.days?.[dayKey]) ? draft.days[dayKey] : [];
      if (exIndex >= 0 && exIndex < dArr.length) {
        dArr[exIndex].name = (newName || "").toString();
        draft.days[dayKey] = dArr;
        writeCustomProgramDraft(draft);
      }
    }

    // Notify any open screens to re-render.
    document.dispatchEvent(new CustomEvent("trackmate:programDefinitionUpdated", { detail: { series } }));
    return true;
  } catch (_) {
    return false;
  }
}

function ensureDayState(state, week, dayIndex) {
  const wKey = String(week);
  const dKey = String(dayIndex);
  if (!state.weeks[wKey]) state.weeks[wKey] = {};
  if (!state.weeks[wKey][dKey]) state.weeks[wKey][dKey] = { completed: false, completedAt: null, startedAt: null, endedAt: null, durationSec: null, exercises: {}, extraExercises: [] };
  // Back-compat for older saves
  const ds = state.weeks[wKey][dKey];
  if (!Array.isArray(ds.extraExercises)) ds.extraExercises = [];
  if (!("completedAt" in ds)) ds.completedAt = ds.completed ? (ds.completedAt ?? Date.now()) : null;
  if (!("startedAt" in ds)) ds.startedAt = null;
  if (!("endedAt" in ds)) ds.endedAt = null;
  if (!("durationSec" in ds)) ds.durationSec = null;
  return state.weeks[wKey][dKey];
}

function getSetState(state, week, dayIndex, exIndex, setIndex) {
  const dayState = ensureDayState(state, week, dayIndex);
  const exKey = String(exIndex);
  const sKey = String(setIndex);
  if (!dayState.exercises[exKey]) dayState.exercises[exKey] = { sets: {}, equipment: null };
  if (!dayState.exercises[exKey].sets[sKey]) dayState.exercises[exKey].sets[sKey] = { w: "", r: "" };
  return dayState.exercises[exKey].sets[sKey];
}


// ===============================
// RESET HELPERS
// ===============================
function resetDay(week, dayIndex) {
  const state = getWorkoutState();
  const wKey = String(week);
  const dKey = String(dayIndex);

  // Resetting a day should also clear its "completed" marker in My Past Workouts
  // for the active series, without touching any other historical entries.
  try {
    removeHistoryLogEntry(getActiveSeriesName(), week, dayIndex);
  } catch (_) {}

  if (state.weeks?.[wKey]?.[dKey]) {
    delete state.weeks[wKey][dKey];
    if (Object.keys(state.weeks[wKey]).length === 0) state.weeks[wKey] = {};
    saveWorkoutState(state);
  }
}

function resetWeek(week) {
  const state = getWorkoutState();
  const wKey = String(week);
  if (state.weeks?.[wKey]) {
    delete state.weeks[wKey];
    saveWorkoutState(state);
  }
}


function getExerciseState(state, week, dayIndex, exIndex) {
  const dayState = ensureDayState(state, week, dayIndex);
  const exKey = String(exIndex);
  if (!dayState.exercises[exKey]) dayState.exercises[exKey] = { sets: {}, equipment: null };
  return dayState.exercises[exKey];
}

// -------------------------
// DOMContentLoaded - main
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  // Make all TrackMate logos act as a Home shortcut.
  try { bindHomeLogoShortcuts(); } catch (_) {}

  // Ensure the active series exists in the registry (used for ordering in My Past Workouts)
  ensureSeriesRegistryEntry(getActiveSeriesName());

  // History integrity: normalise + de-duplicate any legacy entries on load.
  // This guarantees My Past Workouts cannot show repeated Week/Day rows for the same series.
  try { getHistoryLog(); } catch (_) {}


  // -------------------------
  // PWA: service worker registration (safe no-op if unsupported)
  // -------------------------
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js");
    }
  } catch (e) {
    // Intentionally silent: SW registration failure should never block app usage.
  }

  // Disclosure (dropdown) toggles
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".tm-disclosure-toggle");
    if (!btn) return;

    const key = btn.getAttribute("data-disclosure");
    const panel = document.querySelector(`[data-disclosure-content="${key}"]`);
    if (!panel) return;

    const isOpen = !panel.hasAttribute("hidden");
    if (isOpen) {
      panel.setAttribute("hidden", "");
      btn.setAttribute("aria-expanded", "false");
    } else {
      panel.removeAttribute("hidden");
      btn.setAttribute("aria-expanded", "true");
    }
  });


  // Back buttons
  document.querySelectorAll(".link-back").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      if (target) showScreen(target);
    });
  });

  // Welcome
  
  // -------------------------
  // Continue behaviour (Next incomplete vs Resume last viewed)
  // -------------------------
  function getContinueMode() {
    const prefs = readJSON(STORAGE_KEYS.prefs, {});
    return (prefs && (prefs.continueMode === "resume" || prefs.continueMode === "next"))
      ? prefs.continueMode
      : "next";
  }

  function setContinueMode(mode) {
    const safe = (mode === "resume" || mode === "next") ? mode : "next";
    const prefs = readJSON(STORAGE_KEYS.prefs, {});
    prefs.continueMode = safe;
    writeJSON(STORAGE_KEYS.prefs, prefs);
  }


  // Determine whether the currently-active programme is a custom programme.
  // This build defaults to built-in (Sklar). Future custom builds should set one of the keys below.
  function isCustomProgramActive() {
    const activeId = localStorage.getItem("trackmateActiveProgramId") || "";
    if (activeId && String(activeId).toLowerCase().startsWith("custom")) return true;

    const activeType = localStorage.getItem("trackmateActiveProgramType") || "";
    if (activeType && String(activeType).toLowerCase() === "custom") return true;

    const programs = readJSON("trackmatePrograms", null);
    if (programs && typeof programs === "object") {
      const pid = programs.activeProgramId || programs.activeProgram || "";
      if (pid && String(pid).toLowerCase().startsWith("custom")) return true;
    }
    return false;
  }


  function getLastViewedWorkout() {
    const lv = readJSON(STORAGE_KEYS.lastViewed, null);
    if (!lv) return null;
    const week = parseInt(lv.week, 10);
    let dayIndex = parseInt(lv.dayIndex, 10);
    if (!Number.isFinite(week) || !Number.isFinite(dayIndex)) return null;
    if (week < 1 || week > 6) return null;

    // Clamp dayIndex to the active series template length to avoid stale/invalid indices
    // leaving the UI showing one day while rendering another.
    const template = getProgramWeekTemplateForSeries(getActiveSeriesName());
    const maxIdx = Array.isArray(template) && template.length ? (template.length - 1) : 0;
    if (dayIndex < 0) dayIndex = 0;
    if (dayIndex > maxIdx) dayIndex = maxIdx;

    return { week, dayIndex };
  }

  function setLastViewedWorkout(week, dayIndex) {
    const w = parseInt(week, 10);
    let d = parseInt(dayIndex, 10);
    const template = getProgramWeekTemplateForSeries(getActiveSeriesName());
    const maxIdx = Array.isArray(template) && template.length ? (template.length - 1) : 0;
    if (!Number.isFinite(w)) return;
    if (!Number.isFinite(d)) d = 0;
    if (d < 0) d = 0;
    if (d > maxIdx) d = maxIdx;
    writeJSON(STORAGE_KEYS.lastViewed, { week: w, dayIndex: d, ts: Date.now() });
  }

  function getCompletedWorkoutKeySetForSeries(seriesName) {
  // Ensure the history log is hydrated for this series (legacy completion flags -> history migration).
  hydrateHistoryLogFromStateIfMissing(seriesName || getActiveSeriesName());
    // Authoritative source of truth for "completed" is the History Log (My Past Workouts).
    // We consider a workout completed if an entry exists for (series + week + dayIndex).
    const name = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
    // Compare series using canonicalised forms to avoid mismatches across versions
    // (e.g., registry naming, punctuation, or minor spacing differences).
    const targetCanon = canonicalSeriesName(name || DEFAULT_SERIES_NAME);

    // TrackMate legacy reality check:
    // Some older builds stored completion under slightly different series labels (or none at all),
    // while the UI still correctly shows green cards. To avoid Week 1 / Day 1 resets, Sklar
    // continuation must be resilient to series label drift.

    // 1) Prefer the dedicated history log when present.
    // 2) If the active series is the built-in Sklar series, treat *any* history entry as a completion
    //    signal (series label mismatch should never block Continue).
    // 3) If history is empty, fall back to scanning *all* workoutState stores for completed flags.

    const set = new Set();

    const canonDefault = canonicalSeriesName(DEFAULT_SERIES_NAME);
    const isDefaultSeries = (targetCanon === canonDefault);

    // First: history log (authoritative when present)
    // Note: Some legacy builds stored day indices as 1..N (instead of 0..N-1).
    // If we detect that pattern (no zeros present, but 1-based values exist), we
    // treat both representations as completed to avoid Week 1 / Day 1 resets.
    const log = getHistoryLog();
    if (Array.isArray(log) && log.length) {
      const tmp = [];
      let hasZero = false;
      let hasOneBased = false;

      for (const e of log) {
        if (!e) continue;
        const week = Number(e.week);
        const dayIndex = Number(e.dayIndex);
        if (!Number.isFinite(week) || !Number.isFinite(dayIndex)) continue;

        if (!isDefaultSeries) {
          const series = (e.series || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME;
          const entryCanon = canonicalSeriesName(series || DEFAULT_SERIES_NAME);
          if (entryCanon !== targetCanon) continue;
        }

        if (dayIndex === 0) hasZero = true;
        if (dayIndex >= 1 && dayIndex <= 14) hasOneBased = true;
        tmp.push({ week, dayIndex });
      }

      const assumeOneBased = (!hasZero && hasOneBased);
      for (const t of tmp) {
        set.add(`${t.week}::${t.dayIndex}`);
        if (assumeOneBased && t.dayIndex >= 1) {
          set.add(`${t.week}::${t.dayIndex - 1}`);
        }
      }
      return set;
    }

    // Second: derived entries (legacy fallback) – scan across all state keys, not just active.
    // This prevents Continue breaking when completion data was saved under an older key/schema.
    const stateKeys = [];
    try {
      // Series-scoped keys
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("trackmateWorkoutState::")) stateKeys.push(k);
      }
      // Legacy unscoped key
      if (localStorage.getItem(STORAGE_KEYS.workoutState)) stateKeys.push(STORAGE_KEYS.workoutState);
    } catch (_) {}

    // Detect 0-based vs 1-based day indexing across stored states.
    let stateHasZero = false;
    let stateHasOneBased = false;
    for (const k of stateKeys) {
      const st = readJSON(k, null);
      const weeks = (st && typeof st === "object" && st.weeks && typeof st.weeks === "object") ? st.weeks : {};
      Object.keys(weeks).forEach((wKey) => {
        const days = weeks[wKey] || {};
        if (Object.prototype.hasOwnProperty.call(days, "0")) stateHasZero = true;
        if (Object.prototype.hasOwnProperty.call(days, "1")) stateHasOneBased = true;
      });
    }
    const assumeOneBasedState = (!stateHasZero && stateHasOneBased);

    for (const k of stateKeys) {
      const st = readJSON(k, null);
      const weeks = (st && typeof st === "object" && st.weeks && typeof st.weeks === "object") ? st.weeks : {};
      Object.keys(weeks).forEach((wKey) => {
        const days = weeks[wKey] || {};
        Object.keys(days).forEach((dKey) => {
          const dayState = days[dKey];
          if (!dayState || !dayState.completed) return;
          const week = parseInt(wKey, 10);
          const dayIndex = parseInt(dKey, 10);
          if (!Number.isFinite(week) || !Number.isFinite(dayIndex)) return;
          set.add(`${week}::${dayIndex}`);
          if (assumeOneBasedState && dayIndex >= 1) {
            set.add(`${week}::${dayIndex - 1}`);
          }
        });
      });
    }

    return set;
  }

function isWorkoutCompletedFor(week, dayIndex, completedKeySet) {
    // If a completedKeySet is provided, use it (deterministic + avoids repeated scans).
    // Otherwise, build it from the authoritative history entries.
    const set = completedKeySet || getCompletedWorkoutKeySetForSeries(getActiveSeriesName());
    const w = Number(week);
    const d = Number(dayIndex);
    return set.has(`${w}::${d}`);
  }

function findNextIncompleteWorkout() {
    const weekOrder = [1, 2, 3, 4, 5, 6];
    const template = getProgramWeekTemplateForSeries(getActiveSeriesName());
    const dayIndices = (Array.isArray(template) ? template.map((_, idx) => idx) : [0,1,2,3,4]).filter((idx) => {
      const exs = Array.isArray(template?.[idx]?.exercises) ? template[idx].exercises : [];
      return exs.length > 0;
    });
    const completedSet = getCompletedWorkoutKeySetForSeries(getActiveSeriesName());
    for (const w of weekOrder) {
      for (const d of dayIndices) {
        if (!isWorkoutCompletedFor(w, d, completedSet)) return { week: w, dayIndex: d };
      }
    }
    return null;
  }

  function findFirstIncompleteDayInWeek(week) {
    const template = getProgramWeekTemplateForSeries(getActiveSeriesName());
    const dayIndices = (Array.isArray(template) ? template.map((_, idx) => idx) : [0,1,2,3,4]).filter((idx) => {
      const exs = Array.isArray(template?.[idx]?.exercises) ? template[idx].exercises : [];
      return exs.length > 0;
    });
    const completedSet = getCompletedWorkoutKeySetForSeries(getActiveSeriesName());
    for (const d of dayIndices) {
      if (!isWorkoutCompletedFor(week, d, completedSet)) return d;
    }
    return dayIndices.length ? dayIndices[0] : 0;
  }


  function chooseContinueTarget() {
    // Continue behaviour is user-selectable in Settings.
    // - "next": open the next incomplete workout (authoritative completion = History Log)
    // - "resume": open the last viewed workout (with safe clamping)
    const mode = getContinueMode();
    if (mode === "resume") {
      const lv = getLastViewedWorkout();
      if (lv) return lv;
      // Fall through to next incomplete if no last-viewed exists yet.
    }

    const next = findNextIncompleteWorkout();
    if (next) return next;

    // If everything is completed (or no template days exist), fall back gracefully.
    return { week: 1, dayIndex: 0 };
  }

  function enterWorkoutFromEntryPoint() {
    // v2.7.11: Continue-to-workouts must ALWAYS render the same day that the UI
    // indicates (Week tab + Day dropdown). Some browsers can leave the previous
    // day's DOM rendered on first entry unless we force a post-navigation render.
    const navToken = ++__continueEntryToken;
    // Deterministic debug breadcrumb for Continue logic (safe to leave in production).
    try {
      const active = getActiveSeriesName();
      const completedSet = getCompletedWorkoutKeySetForSeries(active);
      const next = (function(){ try { return findNextIncompleteWorkout(); } catch(_) { return null; } })();
      console.info("[TrackMate] Continue->NextIncomplete", {
        activeSeries: active,
        completedCount: completedSet ? completedSet.size : 0,
        nextTarget: next || null,
      });
    } catch (_) {}

    const target = chooseContinueTarget();

    currentWeek = target.week;
    currentDayIndex = target.dayIndex;

    closeWorkoutMenu();
    showScreen("screen-workout");

    // Ensure selector options match the active series before setting the value.
    try { syncWorkoutDaySelectOptionsForSeries(getActiveSeriesName()); } catch (_) {}

    setActiveWeekTab(currentWeek);

    const sel = document.getElementById("workout-day-select");
    if (sel) sel.value = String(currentDayIndex);

    // Force an authoritative render via the same pathway as a user day change.
    // We run it immediately and again on the next frame + a short timeout to
    // override any late initial renders that could otherwise leave stale cards.
    const forceRender = () => {
      if (navToken !== __continueEntryToken) return;
      const s = document.getElementById("workout-day-select");
      if (s) {
        // Ensure the dropdown reflects the canonical currentDayIndex.
        if (s.value !== String(currentDayIndex)) s.value = String(currentDayIndex);
        try { s.dispatchEvent(new Event("change", { bubbles: true })); } catch (_) { renderWorkoutDay(currentDayIndex); }
      } else {
        renderWorkoutDay(currentDayIndex);
      }
    };

    forceRender();
    try { requestAnimationFrame(forceRender); } catch (_) {}
    setTimeout(forceRender, 60);
  }

function syncProgramDraftUI() {
  const draft = getCustomProgramDraft();
  const input = document.getElementById("create-program-name");
  // Do not auto-populate the "Create Your Program" name field on the Select a Program
  // screen. Users should always see an empty input when returning, to avoid reusing names.
  // The draft name is still preserved for the builder title and saved programme logic.
  if (input) { input.value = ""; input.setAttribute("value",""); requestAnimationFrame(() => { try { input.value=""; } catch(_){} }); }
  const label = document.getElementById("custom-builder-program-title");
  if (label) label.textContent = draft?.name || "—";
  const err = document.getElementById("create-program-error");
  if (err) err.hidden = true;
}



function syncWorkoutDaySelectOptionsForSeries(seriesName) {
  const select = document.getElementById("workout-day-select");
  if (!select) return;

  const name = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
  const current = select.value;

  // Sklar: keep underlying day indices, but show user-friendly Day 1–5 labels (no "missing" day).
  if (name === DEFAULT_SERIES_NAME) {
    const options = [
      { value: "0", label: "Day 1" },
      { value: "1", label: "Day 2" },
      { value: "2", label: "Day 3" },
      { value: "3", label: "Day 4" },
      { value: "4", label: "Day 5" },
    ];
    select.innerHTML = "";
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      select.appendChild(opt);
    });
    // Restore selection where possible
    if (options.some((o) => o.value === current)) select.value = current;
    else select.value = "0";
    return;
  }

  // Custom programmes: Days 1–7
  select.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Day ${i + 1}`;
    select.appendChild(opt);
  }
  // Restore selection where possible
  if (current && Number(current) >= 0 && Number(current) <= 6) select.value = current;
  else select.value = "0";
}

function syncWorkoutEditProgramButton() {
  const btn = document.getElementById("workout-edit-program");
  if (!btn) return;
  const active = getActiveSeriesName();
  const isSklar = active === DEFAULT_SERIES_NAME;
  // Only show for custom programmes.
  btn.hidden = isSklar;
}

function getCustomBuilderSelectedDay() {
  const sel = document.getElementById("custom-day-select");
  const v = parseInt(sel?.value || "1", 10);
  return Number.isNaN(v) ? 1 : Math.min(7, Math.max(1, v));
}

function showCustomBuilderError(message) {
  const err = document.getElementById("custom-builder-error");
  if (!err) return;
  const msg = (message || "").toString().trim();
  if (!msg) {
    err.hidden = true;
    err.textContent = "";
    return;
  }
  err.textContent = msg;
  err.hidden = false;
}

function renderCustomBuilderForCurrentDay() {
  const draft = ensureCustomDraft();
  const titleEl = document.getElementById("custom-builder-program-title");
  if (titleEl) titleEl.textContent = draft.name || "—";

  const day = getCustomBuilderSelectedDay();
  const list = document.getElementById("custom-builder-list");
  if (!list) return;

  const dayKey = String(day);
  const exercises = Array.isArray(draft.days?.[dayKey]) ? draft.days[dayKey] : [];
  list.innerHTML = "";

  if (exercises.length === 0) {
    const empty = document.createElement("p");
    empty.className = "choice-text";
    empty.style.margin = "6px 0 0 0";
    empty.textContent = "No exercises yet. Tap “+ Add Exercise” to start building this day.";
    list.appendChild(empty);
    showCustomBuilderError("");
    return;
  }

  // Build exercise cards that match the TrackMate workout card UI.
  exercises.forEach((ex, exIndex) => {
    const card = document.createElement("div");
    card.className = "exercise-card";

    const header = document.createElement("div");
    header.className = "exercise-card-header";

    const topRow = document.createElement("div");
    topRow.className = "exercise-header-top-row";

    const meta = exerciseLibrary?.[ex.name] || {};
    const defaultEquip = meta?.equipment || "MC";
    const selectedEquip = (ex.equipment || defaultEquip);

    const title = document.createElement("p");
    title.className = "exercise-title";
    title.textContent = ex.name;

    const equipmentRow = buildEquipmentRow(card, selectedEquip, (code) => {
      const d = ensureCustomDraft();
      const arr = Array.isArray(d.days?.[dayKey]) ? d.days[dayKey] : [];
      if (!arr[exIndex]) return;
      arr[exIndex].equipment = code;
      d.days[dayKey] = arr;
      writeCustomProgramDraft(d);
      refreshBuilderCardSuggestions(card, arr[exIndex], code);
    });

    const linksRow = document.createElement("div");
    linksRow.className = "exercise-header-links-row";

    const links = document.createElement("div");
    links.className = "exercise-header-links";

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.textContent = "Info";
    infoBtn.addEventListener("click", () => openExerciseInfo({ name: ex.name, notes: ex.notes || "" }));

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openCustomExercisePicker({ mode: "replace", dayKey, index: exIndex }));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn";
    delBtn.setAttribute("aria-label", "Delete exercise");
    delBtn.innerHTML = getTrashIconSVG();
    delBtn.addEventListener("click", () => {
      const ok = window.confirm("Are you sure you want to delete this exercise? This will remove it from this day only.");
      if (!ok) return;
      const d = ensureCustomDraft();
      const arr = Array.isArray(d.days?.[dayKey]) ? d.days[dayKey] : [];
      if (!arr[exIndex]) return;
      arr.splice(exIndex, 1);
      d.days[dayKey] = arr;
      writeCustomProgramDraft(d);
      renderCustomBuilderForCurrentDay();
    });

    links.appendChild(infoBtn);
    links.appendChild(editBtn);
    links.appendChild(delBtn);
    linksRow.appendChild(links);

    topRow.appendChild(equipmentRow);
    topRow.appendChild(linksRow);
    header.appendChild(topRow);
    header.appendChild(title);
    card.appendChild(header);

    if (ex.notes) {
      const note = document.createElement("p");
      note.className = "exercise-note";
      note.textContent = `Note: ${ex.notes}`;
      card.appendChild(note);
    }

    const setsGrid = document.createElement("div");
    setsGrid.className = "sets-grid";

    const targetReps = getTargetRepsFromPrescription(ex.prescription) || 8;
    const equipCode = card.dataset.equipment || selectedEquip;

    const visibleSets = Number.isFinite(parseInt(ex.setCount, 10)) ? Math.min(10, Math.max(1, parseInt(ex.setCount, 10))) : 4;
    const MAX_SETS = 10;
    for (let setIndex = 0; setIndex < MAX_SETS; setIndex++) {
      const cell = document.createElement("div");
      cell.className = "set-cell";
      if (setIndex >= visibleSets) cell.hidden = true;

      const label = document.createElement("div");
      label.className = "set-label";
      label.textContent = `Set ${setIndex + 1}:`;

      const fields = document.createElement("div");
      fields.className = "set-fields";

      const weightPill = document.createElement("div");
      weightPill.className = "input-pill input-pill--small";

      const repsPill = document.createElement("div");
      repsPill.className = "input-pill input-pill--small";

      const wSuggest = getBuilderSuggestedWeightDisplay(ex.name, targetReps, equipCode);
      const unit = getWeightUnitLabel(getActiveUnits());
      weightPill.textContent = wSuggest ? `${wSuggest} ${unit}` : unit;
      repsPill.textContent = `${targetReps} reps`;
      weightPill.classList.add("input-pill--suggested");
      repsPill.classList.add("input-pill--suggested");

      fields.appendChild(weightPill);
      fields.appendChild(repsPill);

      cell.appendChild(label);
      cell.appendChild(fields);
      setsGrid.appendChild(cell);
    }

    card.appendChild(setsGrid);
    list.appendChild(card);
  });

  showCustomBuilderError("");
}

function getBuilderSuggestedWeightDisplay(exName, targetReps, equipmentCode) {
  if (isCoreOrBW(exName)) return "00";

  const equip = (equipmentCode || "MC").toUpperCase();
  const oneRM = getOneRMBasedSuggestion(exName, targetReps, equip);
  if (oneRM) return String(oneRM);

  // Fall back to profile-based suggestion (kg internally) then format to display units.
  const profile = readJSON(STORAGE_KEYS.profile, null);
  const profileWeightKg = profile?.units === "imperial"
    ? (Number(profile.weight) * 0.453592)
    : Number(profile?.weight);

  const kgStr = profileFallbackSuggestionKg(exName, profileWeightKg, equip);
  const kgNum = parseFloat(kgStr);
  if (!kgStr || !Number.isFinite(kgNum) || kgNum <= 0) return "";
  return formatSuggestedWeightFromKg(kgNum, equip);
}

function refreshBuilderCardSuggestions(card, ex, equipCode) {
  const targetReps = getTargetRepsFromPrescription(ex.prescription) || 8;
  const wSuggest = getBuilderSuggestedWeightDisplay(ex.name, targetReps, equipCode);
  const unit = getWeightUnitLabel(getActiveUnits());
  const weightPills = card.querySelectorAll(".set-fields .input-pill");
  for (let i = 0; i < weightPills.length; i += 2) {
    const wPill = weightPills[i];
    const rPill = weightPills[i + 1];
    if (wPill) wPill.textContent = wSuggest ? `${wSuggest} ${unit}` : unit;
    if (rPill) rPill.textContent = `${targetReps} reps`;
  }
}

function getCustomPickerEquipmentFilter() {
  const sel = document.getElementById("custom-equipment-key");
  const v = (sel?.value || "").toString().trim().toUpperCase();
  if (!v || v === "ALL") return "";
  return v;
}

// Persist the last used category in the custom exercise picker (defaults to Back).
const CUSTOM_PICKER_CATEGORY_KEY = "trackmateCustomPickerLastCategory";

function getCustomPickerLastCategory() {
  const v = (localStorage.getItem(CUSTOM_PICKER_CATEGORY_KEY) || "").toString().trim();
  return v || "Back";
}

function setCustomPickerLastCategory(categoryName) {
  const v = (categoryName || "").toString().trim();
  if (!v) return;
  localStorage.setItem(CUSTOM_PICKER_CATEGORY_KEY, v);
}

function openCustomExercisePicker(context) {
  // context: { mode: 'add'|'replace', dayKey, index? }
  const overlay = document.getElementById("custom-ex-picker");
  const listEl = document.getElementById("custom-ex-picker-list");
  const search = document.getElementById("custom-ex-picker-search");
  const categoryRow = document.getElementById("custom-ex-picker-category-row");
  const titleEl = document.getElementById("custom-ex-picker-title");
  const editMeta = document.getElementById("custom-ex-picker-edit-meta");
  const editCurrent = document.getElementById("custom-ex-picker-current");
  const setsRow = document.getElementById("custom-ex-picker-sets-row");
  if (!overlay || !listEl || !search) return;

  overlay.dataset.mode = context?.mode || "add";
  overlay.dataset.dayKey = context?.dayKey || String(getCustomBuilderSelectedDay());
  overlay.dataset.index = (typeof context?.index === "number") ? String(context.index) : "";

  // Header + sets selector.
  // For custom programmes we show Sets pills in BOTH add and edit flows:
  // - Add: user chooses set count before selecting an exercise.
  // - Edit: user can change set count for the existing exercise instance.
  const isReplace = overlay.dataset.mode === "replace";
  if (titleEl) titleEl.textContent = isReplace ? "Edit Exercise" : "Add an exercise";

  if (editMeta && editCurrent && setsRow) {
    // Show the sets row for both modes.
    editMeta.style.display = "block";
    setsRow.innerHTML = "";

    // Default set count comes from last used, falling back to 4.
    const lastSets = parseInt(localStorage.getItem("trackmateCustomLastSetCount") || "4", 10);
    const defaultSets = Number.isFinite(lastSets) ? Math.min(10, Math.max(1, lastSets)) : 4;

    // In add mode we don't show a current exercise name.
    if (!isReplace) {
      editCurrent.textContent = "";
      editCurrent.style.display = "none";
      overlay.dataset.addSetCount = String(defaultSets);

      for (let n = 1; n <= 10; n++) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "exercise-edit-sets-pill" + (n === defaultSets ? " exercise-edit-sets-pill--active" : "");
        pill.textContent = String(n);
        pill.addEventListener("click", () => {
          overlay.dataset.addSetCount = String(n);
          localStorage.setItem("trackmateCustomLastSetCount", String(n));
          setsRow.querySelectorAll(".exercise-edit-sets-pill").forEach((p) => p.classList.remove("exercise-edit-sets-pill--active"));
          pill.classList.add("exercise-edit-sets-pill--active");
        });
        setsRow.appendChild(pill);
      }
      // No further edit-mode setup required.
    }

    if (isReplace) {
      editCurrent.style.display = "block";
      const d = ensureCustomDraft();
      const dayKey = overlay.dataset.dayKey;
      const arr = Array.isArray(d.days?.[dayKey]) ? d.days[dayKey] : [];
      const idx = parseInt(overlay.dataset.index || "-1", 10);
      const ex = (Number.isFinite(idx) && idx >= 0 && idx < arr.length) ? arr[idx] : null;

      const currentName = (ex?.name || "").toString();
      editCurrent.textContent = currentName;

      const currentSets = Number.isFinite(parseInt(ex?.setCount, 10))
        ? Math.min(10, Math.max(1, parseInt(ex.setCount, 10)))
        : defaultSets;

      for (let n = 1; n <= 10; n++) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "exercise-edit-sets-pill" + (n === currentSets ? " exercise-edit-sets-pill--active" : "");
        pill.textContent = String(n);
        pill.addEventListener("click", () => {
          // Persist set count on the exercise definition (builder context)
          const d2 = ensureCustomDraft();
          const arr2 = Array.isArray(d2.days?.[dayKey]) ? d2.days[dayKey] : [];
          if (!(Number.isFinite(idx) && idx >= 0 && idx < arr2.length)) return;
          arr2[idx].setCount = n;
          d2.days[dayKey] = arr2;
          writeCustomProgramDraft(d2);
          localStorage.setItem("trackmateCustomLastSetCount", String(n));

          // Update UI highlight without forcing a full overlay re-open
          setsRow.querySelectorAll(".exercise-edit-sets-pill").forEach((p) => p.classList.remove("exercise-edit-sets-pill--active"));
          pill.classList.add("exercise-edit-sets-pill--active");

          // Re-render the builder list behind the modal so the card updates immediately
          renderCustomBuilderForCurrentDay();
        });
        setsRow.appendChild(pill);
      }
    }
  }

  let activeCategory = getCustomPickerLastCategory();

  function applyActiveCategoryUI() {
    if (!categoryRow) return;
    categoryRow.querySelectorAll(".exercise-edit-category-pill").forEach((p) => {
      p.classList.remove("exercise-edit-category-pill--active");
      if ((p.getAttribute("data-custom-cat") || "") === activeCategory) {
        p.classList.add("exercise-edit-category-pill--active");
      }
    });
  }

  function buildFilteredNames(q) {
    const query = (q || "").toString().trim().toLowerCase();
    const equipFilter = getCustomPickerEquipmentFilter();

    // If the user is typing, search across all exercises (overrides category).
    const useCategory = !query;
    const names = Object.keys(exerciseLibrary || {});

    return names
      .filter((name) => {
        const meta = exerciseLibrary?.[name] || {};
        if (equipFilter) {
          if ((meta.equipment || "").toString().toUpperCase() !== equipFilter) return false;
        }

        if (useCategory) {
          const cat = (meta.category || "").toString().trim();
          if (activeCategory && cat !== activeCategory) return false;
        }

        if (!query) return true;
        return name.toLowerCase().includes(query);
      })
      .slice(0, 80);
  }

  function renderList(q) {
    const items = buildFilteredNames(q);
    listEl.innerHTML = "";
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "exercise-edit-empty";
      p.textContent = "No matches. Try a different search term or change the Equipment Key filter.";
      listEl.appendChild(p);
      return;
    }
    items.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exercise-edit-option";
      btn.textContent = name;
      btn.addEventListener("click", () => {
        const d = ensureCustomDraft();
        const dayKey = overlay.dataset.dayKey;
        const arr = Array.isArray(d.days?.[dayKey]) ? d.days[dayKey] : [];
        const meta = exerciseLibrary?.[name] || {};
        // Determine set count for this add/replace action.
        // - Add mode: prefer the set count selected in the overlay (pills above search).
        // - Replace mode: preserve the existing exercise's set count unless the user changes it.
        const lastSets = parseInt(localStorage.getItem("trackmateCustomLastSetCount") || "4", 10);
        const fallbackSetCount = Number.isFinite(lastSets) ? Math.min(10, Math.max(1, lastSets)) : 4;
        const overlayAddSets = parseInt(overlay.dataset.addSetCount || "", 10);
        const chosenAddSetCount = Number.isFinite(overlayAddSets) ? Math.min(10, Math.max(1, overlayAddSets)) : fallbackSetCount;
        const newExBase = {
          name,
          prescription: "4 × 8",
          notes: "",
          equipment: meta.equipment || "MC"
        };

        if (overlay.dataset.mode === "replace") {
          const idx = parseInt(overlay.dataset.index || "-1", 10);
          if (Number.isFinite(idx) && idx >= 0 && idx < arr.length) {
            // Preserve any setCount already chosen for this slot unless the user changes it in Edit.
            const keepSetCount = Number.isFinite(parseInt(arr[idx]?.setCount, 10))
              ? Math.min(10, Math.max(1, parseInt(arr[idx].setCount, 10)))
              : fallbackSetCount;
            arr[idx] = { ...arr[idx], ...newExBase, setCount: keepSetCount };
          }
        } else {
          arr.push({ ...newExBase, setCount: chosenAddSetCount });
        }
        d.days[dayKey] = arr;
        writeCustomProgramDraft(d);
        closeCustomExercisePicker();
        renderCustomBuilderForCurrentDay();
      });
      listEl.appendChild(btn);
    });
  }

  function onInput() {
    renderList(search.value);
    // When searching, the list ignores category, but we keep the last used category highlighted.
    applyActiveCategoryUI();
  }
  search.oninput = onInput;

  // Category browsing (defaults to last used)
  if (categoryRow) {
    categoryRow.onclick = (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      const cat = (target.getAttribute("data-custom-cat") || "").toString().trim();
      if (!cat) return;
      activeCategory = cat;
      setCustomPickerLastCategory(cat);
      applyActiveCategoryUI();
      // Only re-filter by category if the user is not currently searching.
      if (!(search.value || "").toString().trim()) renderList("");
    };
  }

  // initial
  search.value = "";
  applyActiveCategoryUI();
  renderList("");
  overlay.classList.add("set-edit-overlay--active");
  overlay.setAttribute("aria-hidden", "false");
  setTimeout(() => search.focus(), 50);
}

function closeCustomExercisePicker() {
  const overlay = document.getElementById("custom-ex-picker");
  if (!overlay) return;
  overlay.classList.remove("set-edit-overlay--active");
  overlay.setAttribute("aria-hidden", "true");
}

function saveCustomProgrammeAndUse() {
  const draft = ensureCustomDraft();
  const name = (draft.name || "").toString().trim();
  if (!name) {
    showCustomBuilderError("Please enter a programme name.");
    return false;
  }

  // Validate: at least one exercise somewhere across the week
  const hasAny = Object.keys(draft.days || {}).some((k) => (draft.days[k] || []).some((x) => (x?.name || "").toString().trim().length > 0));
  if (!hasAny) {
    showCustomBuilderError("Please add at least one exercise before saving.");
    return false;
  }

  // Persist programme definition under the series name
  const key = customProgramStorageKeyForSeries(name);
  const existedBefore = !!localStorage.getItem(key);
  writeJSON(key, { name, days: draft.days, updatedAt: Date.now() });
  // Register this programme so it appears on Select a Program
  try { ensureSeriesRegistryEntry(name, Date.now()); } catch (_) {}

  // Register series metadata (non-destructive)
  const reg = getSeriesRegistry();
  if (!reg[name]) {
    const ts = Date.now();
    const baseKey = deriveSeriesBaseKey(name) || name;
    const version = getNextSeriesVersionForBase(reg, baseKey);
    reg[name] = { createdAt: ts, baseKey, version, type: "custom" };
  } else {
    reg[name].type = reg[name].type || "custom";
  }
  writeSeriesRegistry(reg);

  setActiveSeriesName(name);

  // Only reset progress when this is a brand-new programme.
  // If the user is editing an existing programme, preserve their current progress.
  if (!existedBefore) resetProgrammeProgress();

  // Ensure the programme appears immediately on the Programmes screen even if the
  // user navigates back without a full reload (non-invasive UI sync).
  try { renderProgramsScreen(); } catch (_) {}

  showCustomBuilderError("");
  return true;
}
document.getElementById("btn-welcome-setup")?.addEventListener("click", () => showScreen("screen-profile"));
  document.getElementById("btn-welcome-programs")?.addEventListener("click", () => {
    showScreen("screen-programs");
    syncProgramDraftUI();
    // Defensive re-render: ensures Created Programmes are visible immediately when arriving from Home.
    try { renderProgramsScreen(); } catch (_) {}
  });
  document.getElementById("btn-welcome-history")?.addEventListener("click", () => {
    openHistoryLanding();
  });

  document.getElementById("btn-welcome-continue")?.addEventListener("click", () => {
    enterWorkoutFromEntryPoint();
  });

  function updateWelcomeForProfile() {
    const profile = readJSON(STORAGE_KEYS.profile, null);
    const setupBtn = document.getElementById("btn-welcome-setup");
    const historyBtn = document.getElementById("btn-welcome-history");
    const continueBtn = document.getElementById("btn-welcome-continue");
    if (profile && profile.name) {
      if (setupBtn) setupBtn.style.display = "none";
      if (historyBtn) historyBtn.style.display = "block";
      if (continueBtn) continueBtn.textContent = "Continue";
    } else {
      if (setupBtn) setupBtn.style.display = "block";
      if (historyBtn) historyBtn.style.display = "none";
      if (continueBtn) continueBtn.textContent = "Continue to Workouts";
    }

    // Update the welcome heading text.
    try { syncWelcomeTitle(); } catch (_) {}
  }
  updateWelcomeForProfile();


  // Program selection
  // Selecting the built-in Sklar programme should always reset the active series
  // back to the default. This prevents users remaining on a previously selected
  // custom programme when they expect to be in Sklar.
  document.getElementById("btn-program-sklar")?.addEventListener("click", () => {
    setActiveSeriesName(DEFAULT_SERIES_NAME);
    // From Select a Program, users expect to enter the programme immediately.
    // Route directly to Week 1 • Day 1 of the Sklar series.
    try { syncWorkoutDaySelectOptionsForSeries(DEFAULT_SERIES_NAME); } catch (_) {}
    currentWeek = 1;
    currentDayIndex = 0;
    setActiveWeekTab(1);
    const sel = document.getElementById("workout-day-select");
    if (sel) sel.value = "0";
    closeWorkoutMenu();
    showScreen("screen-workout");
    renderWorkoutDay(0);
  });

  // Create your own programme (Phase 1: name capture + start building placeholder)
  document.getElementById("btn-program-create")?.addEventListener("click", () => {
    const input = document.getElementById("create-program-name");
    const err = document.getElementById("create-program-error");
    const name = (input?.value || "").toString().trim();
    if (!name) {
      if (err) err.hidden = false;
      input?.focus();
      return;
    }
    if (err) err.hidden = true;
    // Starting a new programme must begin from a blank slate (Days 1–7 empty).
    // This prevents previously added draft exercises from appearing in a new programme.
    startNewCustomProgramDraft(name);
    syncProgramDraftUI();
    showScreen("screen-custom-builder");
    renderCustomBuilderForCurrentDay();
  })

  // Custom programme builder (Phase 2)
  document.getElementById("custom-day-select")?.addEventListener("change", () => {
    renderCustomBuilderForCurrentDay();
  });

  document.getElementById("btn-custom-add-exercise")?.addEventListener("click", () => {
    const day = getCustomBuilderSelectedDay();
    openCustomExercisePicker({ mode: "add", dayKey: String(day) });
  });

  // Custom exercise picker close handlers
  document.getElementById("custom-ex-picker-close")?.addEventListener("click", () => closeCustomExercisePicker());
  document.getElementById("custom-ex-picker")?.addEventListener("click", (e) => {
    if (e.target && e.target.id === "custom-ex-picker") closeCustomExercisePicker();
  });

  document.getElementById("btn-custom-save-and-use")?.addEventListener("click", () => {
    const ok = saveCustomProgrammeAndUse();
    if (!ok) return;

    // Ensure the workout day selector matches the active (custom) series
    syncWorkoutDaySelectOptionsForSeries(getActiveSeriesName());

    // Route straight into workouts
    enterWorkoutFromEntryPoint();
  });
;

  // Start choice
  document.getElementById("btn-start-workouts")?.addEventListener("click", () => {
    // Logical flow: starting workouts should take the user to Select a Program
    // where they can create a programme or choose an existing one.
    showScreen("screen-programs");
  });
  document.getElementById("btn-go-1rm")?.addEventListener("click", () => showScreen("screen-1rm"));

  // Profile
  const profileForm = document.getElementById("profile-form");
  const nameInput = document.getElementById("profile-name");
  const sexHidden = document.getElementById("profile-sex");
  const sexButtons = document.querySelectorAll("[data-sex-option]");
  const unitsHidden = document.getElementById("profile-units");
  const unitsButtons = document.querySelectorAll("[data-units-option]");
  const heightInput = document.getElementById("profile-height");
  const weightInput = document.getElementById("profile-weight");
  const ageInput = document.getElementById("profile-age");
  const bmiDisplay = document.getElementById("profile-bmi");
  const heightPreview = document.getElementById("profile-height-preview");
  const labelHeight = document.getElementById("label-height-unit");
  const labelWeight = document.getElementById("label-weight-unit");

  function updateUnitLabels() {
    const units = unitsHidden.value || "metric";
    if (units === "imperial") {
      labelHeight.textContent = "Height (in)";
      labelWeight.textContent = "Weight (lb)";
      heightInput.placeholder = "e.g. 69";
      weightInput.placeholder = "e.g. 154";
    } else {
      labelHeight.textContent = "Height (cm)";
      labelWeight.textContent = "Weight (kg)";
      heightInput.placeholder = "e.g. 175";
      weightInput.placeholder = "e.g. 70";
    }
  }

  function updateBMI() {
    const units = unitsHidden.value || "metric";
    const h = parseFloat(heightInput.value);
    const w = parseFloat(weightInput.value);
    const bmi = calculateBMI(w, h, units);
    bmiDisplay.textContent = (bmi && Number.isFinite(bmi)) ? bmi.toFixed(1) : "—";
  }


function updateHeightPreview() {
  if (!heightPreview) return;
  const units = unitsHidden.value || "metric";
  const hRaw = parseFloat(heightInput.value);
  if (!Number.isFinite(hRaw) || hRaw <= 0) { heightPreview.textContent = "—"; return; }

  // Always provide ft/in preview; also include the converted metric/imperial value for confidence.
  if (units === "imperial") {
    // input is inches
    const inches = hRaw;
    const cm = inches * 2.54;
    const ft = Math.floor(inches / 12);
    const inchRem = inches - (ft * 12);
    heightPreview.textContent = `≈ ${cm.toFixed(1)} cm • ${ft}'${inchRem.toFixed(1)}"`;
  } else {
    // input is cm
    const cm = hRaw;
    const inches = cm / 2.54;
    const ft = Math.floor(inches / 12);
    const inchRem = inches - (ft * 12);
    heightPreview.textContent = `≈ ${ft}'${inchRem.toFixed(1)}" • ${inches.toFixed(1)} in`;
  }
}

  function loadProfileIntoForm() {
    const saved = readJSON(STORAGE_KEYS.profile, null);
    if (!saved) return;

    nameInput.value = saved.name || "";
    ageInput.value = (saved.age !== null && saved.age !== undefined) ? String(saved.age) : "";
    heightInput.value = (saved.height !== null && saved.height !== undefined) ? String(saved.height) : "";
    weightInput.value = (saved.weight !== null && saved.weight !== undefined) ? String(saved.weight) : "";

    // Units + segmented state
    unitsHidden.value = saved.units || "metric";
    unitsButtons.forEach((b) => {
      b.classList.toggle("segmented-option--active", b.dataset.unitsOption === unitsHidden.value);
    });

    // Sex + segmented state
    sexHidden.value = saved.sex || "";
    sexButtons.forEach((b) => {
      b.classList.toggle("segmented-option--active", b.dataset.sexOption === sexHidden.value);
    });

    updateUnitLabels();
    updateBMI();
    updateHeightPreview();
  }


  sexButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      sexButtons.forEach((b) => b.classList.remove("segmented-option--active"));
      btn.classList.add("segmented-option--active");
      sexHidden.value = btn.dataset.sexOption;
    });
  });

  unitsButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      unitsButtons.forEach((b) => b.classList.remove("segmented-option--active"));
      btn.classList.add("segmented-option--active");
      const prevUnits = unitsHidden.value || "metric";
      const nextUnits = btn.dataset.unitsOption || "metric";
      unitsHidden.value = nextUnits;

      // Convert in-form values when toggling units so users can continue editing
      // without their inputs being overwritten.
      try {
        const hVal = parseFloat(heightInput.value);
        if (Number.isFinite(hVal) && hVal > 0 && prevUnits !== nextUnits) {
          if (prevUnits === "metric" && nextUnits === "imperial") {
            // cm -> inches
            heightInput.value = String((hVal / 2.54).toFixed(1));
          } else if (prevUnits === "imperial" && nextUnits === "metric") {
            // inches -> cm
            heightInput.value = String((hVal * 2.54).toFixed(1));
          }
        }

        const wVal = parseFloat(weightInput.value);
        if (Number.isFinite(wVal) && wVal > 0 && prevUnits !== nextUnits) {
          if (prevUnits === "metric" && nextUnits === "imperial") {
            // kg -> lb
            weightInput.value = String((wVal * 2.2046226218).toFixed(1));
          } else if (prevUnits === "imperial" && nextUnits === "metric") {
            // lb -> kg
            weightInput.value = String((wVal / 2.2046226218).toFixed(1));
          }
        }
      } catch (_) {
        // no-op
      }

      updateUnitLabels();
      updateBMI();
      updateHeightPreview();
    });
  });

  heightInput?.addEventListener("input", () => { updateBMI(); updateHeightPreview(); });
  weightInput?.addEventListener("input", updateBMI);
  updateUnitLabels();
  updateHeightPreview();
  loadProfileIntoForm();

  profileForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const profile = {
      name: nameInput.value.trim(),
      sex: sexHidden.value || null,
      units: unitsHidden.value || "metric",
      height: parseFloat(heightInput.value) || null,
      weight: parseFloat(weightInput.value) || null,
      age: ageInput.value ? parseInt(ageInput.value, 10) : null,
      bmi: (bmiDisplay.textContent && bmiDisplay.textContent !== "—") ? parseFloat(bmiDisplay.textContent) : null
    };
    writeJSON(STORAGE_KEYS.profile, profile);
    showScreen("screen-start-choice");
    updateWelcomeForProfile();
  });


// -------------------------
// History (My Workouts)
// -------------------------
function buildHistoryEntries() {
  // Prefer the dedicated history log if present (supports Reuse without losing history).
  const log = getHistoryLog();
  if (log.length) {
    return log
      .filter((e) => e && Number.isFinite(Number(e.week)) && Number.isFinite(Number(e.dayIndex)))
      .map((e) => ({
        week: parseInt(e.week, 10),
        dayIndex: parseInt(e.dayIndex, 10),
        completedAt: Number(e.completedAt || 0),
        series: e.series || DEFAULT_SERIES_NAME
      }))
      .sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0));
  }

  // Fallback for legacy installs: derive entries from per-day completion flags.
  const state = getWorkoutState();
  const entries = [];
  const weeks = state?.weeks || {};
  Object.keys(weeks).forEach((wKey) => {
    const days = weeks[wKey] || {};
    Object.keys(days).forEach((dKey) => {
      const dayState = days[dKey];
      if (dayState && dayState.completed) {
        const completedAt = Number(dayState.completedAt || 0);
        entries.push({
          week: parseInt(wKey, 10),
          dayIndex: parseInt(dKey, 10),
          completedAt: completedAt,
          series: DEFAULT_SERIES_NAME});
      }
    });
  });
  // Most recent first
  entries.sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0));
  return entries;
}

function formatCompletedDate(ts) {
  if (!ts) return "Completed: —";
  try {
    const d = new Date(ts);
    return `Completed: ${d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" })}`;
  } catch (e) {
    return "Completed: —";
  }
}

function formatShortDate(ts) {
  if (!ts) return "—";
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}


function getHistoryLog() {
  const raw = readJSON(STORAGE_KEYS.historyLog, []);
  const log = Array.isArray(raw) ? raw : [];

  let changed = false;

  // 1) Patch legacy entries (missing fields / inconsistent types)
  const patched = log
    .filter((e) => e && typeof e === "object")
    .map((e) => {
      const series = (e.series || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME;
      const week = Number(e.week);
      const dayIndex = Number(e.dayIndex);
      const completedAt = Number(e.completedAt || 0);

      const next = { series, week, dayIndex, completedAt };

      // Detect if we normalised anything
      if (
        e.series !== series ||
        Number(e.week) !== week ||
        Number(e.dayIndex) !== dayIndex ||
        Number(e.completedAt || 0) !== completedAt
      ) {
        changed = true;
      }
      return next;
    });

  const deduped = dedupeHistoryLog(patched);

  // If de-dupe changed anything, persist the cleaned log.
  if (deduped.length !== patched.length) changed = true;
  if (changed) writeHistoryLog(deduped);
  return deduped;
}

// Hydrate history log from per-day completion flags (legacy installs / migration safety).
// This ensures "Continue to Workouts" can rely on the History Log as the single source of truth
// even for users who have completion data saved only in series-scoped workoutState.
function hydrateHistoryLogFromStateIfMissing(seriesName) {
  try {
    const series = (seriesName || getActiveSeriesName()).toString().trim() || DEFAULT_SERIES_NAME;
    const targetCanon = canonicalSeriesName(series);

    const existing = getHistoryLog();
    const hasAnyForSeries = existing.some((e) => canonicalSeriesName((e?.series || DEFAULT_SERIES_NAME).toString()) === targetCanon);
    if (hasAnyForSeries) return;

    // Scan series-scoped workout state for completed days.
    const st = getWorkoutState(series);
    const weeks = (st && typeof st === "object" && st.weeks && typeof st.weeks === "object") ? st.weeks : {};
    const additions = [];
    let earliest = 0;

    Object.keys(weeks).forEach((wKey) => {
      const days = weeks[wKey] || {};
      Object.keys(days).forEach((dKey) => {
        const dayState = days[dKey];
        if (!dayState || !dayState.completed) return;

        const week = parseInt(wKey, 10);
        const dayIndex = parseInt(dKey, 10);
        if (!Number.isFinite(week) || !Number.isFinite(dayIndex)) return;

        const completedAt = Number(dayState.completedAt || dayState.endedAt || dayState.startedAt || 0) || Date.now();
        if (!earliest || (completedAt && completedAt < earliest)) earliest = completedAt;

        additions.push({ series, week, dayIndex, completedAt });
      });
    });

    if (!additions.length) return;

    // Merge into the existing log and persist (dedupeHistoryLog guards uniqueness).
    writeHistoryLog(existing.concat(additions));

    // Ensure registry metadata exists so the series is stable in My Past Workouts.
    try { ensureSeriesRegistryEntry(series, earliest || Date.now()); } catch (_) {}
  } catch (_) {
    // no-op
  }
}

function dedupeHistoryLog(log) {
  const arr = Array.isArray(log) ? log : [];

  // Only one entry per series + week + dayIndex. Keep most recent completedAt.
  const byKey = new Map();
  for (const e of arr) {
    if (!e || typeof e !== "object") continue;
    const series = (e.series || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME;
    const week = Number(e.week);
    const dayIndex = Number(e.dayIndex);
    const completedAt = Number(e.completedAt || 0);
    if (!Number.isFinite(week) || !Number.isFinite(dayIndex)) continue;

    const key = `${series}::${week}::${dayIndex}`;
    const existing = byKey.get(key);
    if (!existing || completedAt > Number(existing.completedAt || 0)) {
      byKey.set(key, { series, week, dayIndex, completedAt });
    }
  }

  const out = Array.from(byKey.values());
  out.sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0));
  return out;
}

function writeHistoryLog(log) {
  // Hard guardrail: always store a de-duplicated history log.
  const cleaned = dedupeHistoryLog(log);
  writeJSON(STORAGE_KEYS.historyLog, cleaned);
}

function getSeriesRegistry() {
  const reg = readJSON(STORAGE_KEYS.seriesRegistry, {});
  return reg && typeof reg === "object" ? reg : {};
}

function writeSeriesRegistry(reg) {
  writeJSON(STORAGE_KEYS.seriesRegistry, reg && typeof reg === "object" ? reg : {});
}

// Discover custom programmes directly from localStorage (robust against missing/old registry entries).
function discoverCustomProgrammeNamesFromStorage() {
  const names = new Set();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // Current + legacy key prefixes
      const isCurrent = k.startsWith("trackmateCustomProgram::");
      const isLegacy1 = k.startsWith("trackmateCustomProgram:");
      const isLegacy2 = k.startsWith("trackmateCustomProgramme::");
      if (!isCurrent && !isLegacy1 && !isLegacy2) continue;

      const p = readJSON(k, null);
      const nm = (p && typeof p === "object" ? (p.name || "") : "").toString().trim();
      if (nm) names.add(nm);
    }
  } catch (_) {}
  return Array.from(names);
}


// -------------------------
// Programmes screen: render created custom programmes list
// -------------------------

function renderProgramsScreen() {
  // UX guardrail: the "Create Your Program" name field should always be blank
  // when the user returns to the Select a Program screen.
  try {
    const nameInput = document.getElementById("create-program-name");
    if (nameInput) { nameInput.value = ""; nameInput.setAttribute("value",""); requestAnimationFrame(() => { try { nameInput.value=""; } catch(_){} }); }
    const err = document.getElementById("create-program-error");
    if (err) err.hidden = true;
  } catch (_) {}

  const block = document.getElementById("created-programs-block");
  const list = document.getElementById("created-programs-list");
  if (!block || !list) return;

  // Normalise first so older entries pick up baseKey/version.
  const reg = normaliseSeriesRegistrySchema();

  // 1) Registry-sourced custom programmes
  const fromRegistry = Object.keys(reg || {}).filter((n) => reg[n] && reg[n].type === "custom");

  // Note: "Created Programmes" should reflect *actual saved programme definitions*.
  // Registry entries can become stale (e.g., if a programme definition key was removed in earlier tests).
  // We therefore treat storage as the source of truth, and use the registry for metadata only.

  // 2) Storage-sourced custom programmes (covers older builds where registry.type was not set)
  const fromStorage = discoverCustomProgrammeNamesFromStorage();

  // 3) Draft-sourced (covers cases where the user has built a programme but has not yet
  // saved it into the per-series store for any reason). This is a safety net only.
  const draft = getCustomProgramDraft();
  const fromDraft = (draft && draft.name) ? [draft.name] : [];

  // Union (registry is metadata only; storage is the source of truth).
  // We only show cards for:
  //  - saved programme definitions, or
  //  - the current draft programme (single), as a safety net.
  const unionRaw = Array.from(new Set([...fromStorage, ...fromRegistry, ...fromDraft])).filter(Boolean);

  const draftCanon = (draft && draft.name) ? canonicalSeriesName(draft.name) : "";
  const union = unionRaw.filter((nm) => {
    try {
      if (loadCustomProgramForSeries(nm)) return true;
      return !!(draftCanon && canonicalSeriesName(nm) === draftCanon);
    } catch (_) {
      return false;
    }
  });

    // Clean up stale registry entries (custom) that no longer have a saved programme definition
  // and are not the current draft. This prevents "ghost" cards from re-appearing after deletion.
  try {
    // draftCanon already computed above
    let changed = false;
    Object.keys(reg || {}).forEach((k) => {
      if (!(reg[k] && reg[k].type === "custom")) return;
      const canonK = canonicalSeriesName(k);
      if (draftCanon && canonK === draftCanon) return; // keep draft-visible entry
      const hasDef = !!loadCustomProgramForSeries(k);
      if (!hasDef) {
        delete reg[k];
        changed = true;
      }
    });
    if (changed) writeSeriesRegistry(reg);
  } catch (_) {}

// Backfill registry entries so future loads are consistent
  let regChanged = false;
  union.forEach((name) => {
    const key = customProgramStorageKeyForSeries(name);
    const p = readJSON(key, null);
    const updatedAt = Number(p?.updatedAt || 0);

    if (!reg[name]) {
      const ts = updatedAt || Date.now();
      const baseKey = deriveSeriesBaseKey(name);
      const version = getNextSeriesVersionForBase(reg, baseKey);
      reg[name] = { createdAt: ts, baseKey, version, type: "custom" };
      regChanged = true;
    } else {
      if (!reg[name].type) {
        reg[name].type = "custom";
        regChanged = true;
      }
      if (!Number.isFinite(Number(reg[name].createdAt))) {
        reg[name].createdAt = updatedAt || Date.now();
        regChanged = true;
      }
    }
  });
  if (regChanged) writeSeriesRegistry(reg);

  const names = union.sort((a, b) => (Number(reg[b]?.createdAt || 0) - Number(reg[a]?.createdAt || 0)));

  list.innerHTML = "";

  if (!names.length) {
    block.hidden = true;
    return;
  }

  names.forEach((seriesName) => {
    const safeName = (seriesName || "").toString();

    const hasSavedProgramme = !!loadCustomProgramForSeries(seriesName);

    const card = document.createElement("div");
    card.className = "choice-card";
    card.style.marginTop = "12px";

    const title = document.createElement("h3");
    title.className = "choice-title";
    title.textContent = safeName;

    const sub = document.createElement("p");
    sub.className = "choice-text";
    sub.textContent = hasSavedProgramme
      ? "Your custom programme. Continue, edit, or delete it below."
      : "Draft programme. Save it from the builder to enable full Continue behaviour.";

    const actions = document.createElement("div");
    actions.className = "program-card-actions";

    const btnContinue = document.createElement("button");
    btnContinue.type = "button";
    btnContinue.className = "btn-teal-pill";
    btnContinue.textContent = "Continue";
    btnContinue.addEventListener("click", () => {
      if (!hasSavedProgramme) {
        openProgrammeInBuilder(seriesName, 1);
        return;
      }
      setActiveSeriesName(seriesName);
      enterWorkoutFromEntryPoint();
    });

    const btnEdit = document.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "btn-outline-teal-pill";
    btnEdit.textContent = "Edit";
    btnEdit.addEventListener("click", () => {
      openProgrammeInBuilder(seriesName, 1);
    });

    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "btn-danger-pill";
    btnDelete.textContent = "Delete";
    btnDelete.addEventListener("click", () => {
      const didDelete = deleteCustomProgramme(seriesName);
      if (didDelete) renderProgramsScreen();
    });

    actions.appendChild(btnContinue);
    actions.appendChild(btnEdit);
    actions.appendChild(btnDelete);

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(actions);
    list.appendChild(card);
  });

  block.hidden = false;
}

function deriveSeriesBaseKey(seriesName) {
  const n = (seriesName || "").toString().trim();
  if (!n) return "";
  return n.replace(/\s*\(Copy\)\s*$/i, "").trim();
}

function getNextSeriesVersionForBase(reg, baseKey) {
  const base = (baseKey || "").toString().trim();
  if (!base) return 1;
  let maxV = 0;
  Object.keys(reg || {}).forEach((k) => {
    const entry = reg[k];
    if (!entry || typeof entry !== "object") return;
    const b = (entry.baseKey || deriveSeriesBaseKey(k) || "").toString().trim();
    if (b !== base) return;
    const v = Number(entry.version);
    if (Number.isFinite(v) && v > maxV) maxV = v;
  });
  return maxV + 1;
}

// Backfill registry entries with baseKey/version if they predate this schema.
function normaliseSeriesRegistrySchema() {
  const reg = getSeriesRegistry();
  let changed = false;
  const byBase = {};

  // Collect entries per base, sorted by createdAt.
  Object.keys(reg).forEach((name) => {
    const entry = reg[name];
    const ts = Number(entry?.createdAt);
    const createdAt = Number.isFinite(ts) ? ts : Date.now();
    const baseKey = (entry?.baseKey || deriveSeriesBaseKey(name) || "").toString().trim();
    if (!byBase[baseKey]) byBase[baseKey] = [];
    byBase[baseKey].push({ name, createdAt });
  });

  Object.keys(byBase).forEach((baseKey) => {
    const arr = byBase[baseKey].sort((a, b) => a.createdAt - b.createdAt);
    arr.forEach((item, idx) => {
      const entry = reg[item.name] || {};
      if (!entry.baseKey) {
        entry.baseKey = baseKey;
        changed = true;
      }
      if (!Number.isFinite(Number(entry.version))) {
        entry.version = idx + 1;
        changed = true;
      }
      if (!Number.isFinite(Number(entry.createdAt))) {
        entry.createdAt = item.createdAt;
        changed = true;
      }
      reg[item.name] = entry;
    });
  });

  if (changed) writeSeriesRegistry(reg);
  return reg;
}

function ensureSeriesRegistryEntry(seriesName, createdAt) {
  const name = (seriesName || "").toString().trim();
  if (!name) return;
  const reg = normaliseSeriesRegistrySchema();
  if (!reg[name]) {
    const ts = Number(createdAt || Date.now());
    const baseKey = deriveSeriesBaseKey(name);
    const version = getNextSeriesVersionForBase(reg, baseKey);
    reg[name] = { createdAt: ts, baseKey, version };
    writeSeriesRegistry(reg);
  }
}


function appendHistoryLog(entry) {
  const e = entry || {};
  const series = (e.series || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME;
  const week = Number(e.week);
  const dayIndex = Number(e.dayIndex);
  const completedAt = Number(e.completedAt || 0);

  if (!Number.isFinite(week) || !Number.isFinite(dayIndex)) return;

  const log = getHistoryLog();

  // Ensure only one entry per series + week + dayIndex.
  const existingIndex = log.findIndex((x) =>
    x && ((x.series || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME) === series &&
    Number(x.week) === week &&
    Number(x.dayIndex) === dayIndex
  );

  const next = { series, week, dayIndex, completedAt };

  if (existingIndex >= 0) {
    log[existingIndex] = next;
  } else {
    log.push(next);
  }

  writeHistoryLog(log);
}

function removeHistoryLogEntry(seriesName, week, dayIndex) {
  const series = (seriesName || DEFAULT_SERIES_NAME).toString();
  const w = Number(week);
  const d = Number(dayIndex);
  if (!Number.isFinite(w) || !Number.isFinite(d)) return;
  const log = getHistoryLog().filter((x) =>
    !(x && ((x.series || DEFAULT_SERIES_NAME).toString().trim() || DEFAULT_SERIES_NAME) === series && Number(x.week) === w && Number(x.dayIndex) === d)
  );
  writeHistoryLog(log);
}

function purgeHistorySeries(seriesName) {
  const log = getHistoryLog().filter((e) => e && e.series !== seriesName);
  writeHistoryLog(log);
}

function renameHistorySeries(oldName, newName) {
  const from = (oldName || "").toString().trim();
  const to = (newName || "").toString().trim();
  if (!from || !to || from === to) return;
  const log = getHistoryLog().map((e) => {
    if (!e || e.series !== from) return e;
    return { ...e, series: to };
  });
  writeHistoryLog(log);
}


function resetProgrammeProgress() {
  // Clears logged sets/reps/weights + completion state for workouts,
  // but does not touch profile, 1RM, preferences, or history log.
  const state = getWorkoutState();
  state.weeks = {};
  saveWorkoutState(state);
}

// History (Past Workouts) series view state
let historyActiveSeries = null;

function openHistoryLanding() {
  // Always open the landing list view (never inside an individual series).
  historyActiveSeries = null;
  renderHistoryList();
  showScreen("screen-history");
}

function renderHistoryList() {
  const list = document.getElementById("history-list");
  if (!list) return;
  list.innerHTML = "";

  const entries = buildHistoryEntries();

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "form-card";
    empty.textContent = "No completed workouts yet.";
    list.appendChild(empty);
    return;
  }

  // For now, completed workouts belong to the built-in Sklar programme.
  // This is intentionally simple and can be extended later when custom programmes store programme IDs in history.
  const SERIES_NAME = getActiveSeriesName();

  
  if (!historyActiveSeries) {
    // Series list view (all series found in history, plus the current active series)
    const activeSeries = getActiveSeriesName();
    const namesSet = new Set(entries.map((e) => (e.series || activeSeries)));
    namesSet.add(activeSeries);

    const seriesNames = Array.from(namesSet).filter(Boolean);

// Order series by most recent activity (latest completion OR creation), newest first
const reg = normaliseSeriesRegistrySchema();
const seriesSorted = seriesNames
  .map((name) => {
    const seriesEntries = entries.filter((e) => (e.series || activeSeries) === name);
    const completedMostRecent = seriesEntries.reduce((m, e) => Math.max(m, Number(e.completedAt || 0)), 0);
    const createdAt = Number(reg[name]?.createdAt || 0);
    return { name, sortTs: Math.max(completedMostRecent, createdAt) };
  })
  .sort((a, b) => (b.sortTs || 0) - (a.sortTs || 0))
  .map((x) => x.name);

    seriesSorted.forEach((seriesName) => {
      const seriesEntries = entries.filter((e) => (e.series || activeSeries) === seriesName);
      const completedCount = seriesEntries.length;
      const mostRecent = seriesEntries.reduce((m, e) => Math.max(m, Number(e.completedAt || 0)), 0);
      const registryCreatedAt = Number(reg[seriesName]?.createdAt || 0);
      const firstCompletion = seriesEntries.reduce((m, e) => {
        const v = Number(e.completedAt || 0);
        if (!v) return m;
        return m ? Math.min(m, v) : v;
      }, 0);
      const createdAt = registryCreatedAt || firstCompletion || 0;
      const version = Number(reg[seriesName]?.version) || 1;
      const isSeriesCompleted = completedCount >= getTotalPlannedWorkoutsForSeries(seriesName);

      const card = document.createElement("div");
      card.className = "history-card";

      const title = document.createElement("div");
      title.className = "history-title";
      title.textContent = seriesName;

      title.addEventListener("dblclick", () => {
        const next = prompt("Rename workout series:", seriesName);
        if (next === null) return;
        const cleaned = next.toString().trim();
        if (!cleaned) return;
        renameHistorySeries(seriesName, cleaned);
        if (seriesName === getActiveSeriesName()) {
          setActiveSeriesName(cleaned);
        }
        // If we were viewing this series, keep the view consistent.
        if (historyActiveSeries === seriesName) {
          historyActiveSeries = cleaned;
        }
        renderHistoryList();
      });

      const meta = document.createElement("div");
      meta.className = "history-meta";

      const line1 = document.createElement("div");
      line1.className = "history-meta-line";
      line1.textContent = `${seriesName} - version ${version}`;

      const line2 = document.createElement("div");
      line2.className = "history-meta-line";
      line2.textContent = `Series Started: ${formatShortDate(createdAt)}`;

      const line3 = document.createElement("div");
      line3.className = "history-meta-line";
      line3.textContent = `Completed workout(s): ${completedCount}`;

      meta.appendChild(line1);
      meta.appendChild(line2);
      meta.appendChild(line3);

      if (isSeriesCompleted) {
        const line4 = document.createElement("div");
        line4.className = "history-meta-line";
        line4.textContent = `Completed Series: ${formatShortDate(mostRecent)}`;
        meta.appendChild(line4);
      }

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn btn-teal-pill btn-small";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        historyActiveSeries = seriesName;
        renderHistoryList();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn-danger-pill btn-small";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => {
        if (!confirm(`Delete "${seriesName}" history? This will remove all completed workouts for this series.`)) return;
        purgeHistorySeries(seriesName);
        if (seriesName === getActiveSeriesName()) {
          resetProgrammeProgress();
        }
        historyActiveSeries = null;
        renderHistoryList();
      });

      const reuseBtn = document.createElement("button");
      reuseBtn.type = "button";
      reuseBtn.className = "btn btn-outline-teal-pill btn-small";
      reuseBtn.textContent = "Reuse";
      reuseBtn.addEventListener("click", () => {
        const proposed = makeCopySeriesName(seriesName);
        const nextName = prompt(`Reuse as a new series?\n\nEnter a name for the copied series:`, proposed);
        if (nextName === null) return; // user cancelled
        ensureSeriesRegistryEntry(nextName, Date.now());
        setActiveSeriesName(nextName);

        // Start the copied series from a fresh progress state (history remains with the source series)
        resetProgrammeProgress();

        // Route back into workouts (Week 1, Day 1)
        showScreen("screen-workout");
        currentWeek = 1;
        setActiveWeekTab(1);
        const sel = document.getElementById("workout-day-select");
        if (sel) sel.value = "0";
        renderWorkoutDay(0);
        syncWorkoutCompletionUI();

        historyActiveSeries = null;
        renderHistoryList();
      });

      actions.appendChild(openBtn);
      actions.appendChild(deleteBtn);
      actions.appendChild(reuseBtn);

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(actions);

      list.appendChild(card);
    });

    return;
  }

  // Series detail view
  const header = document.createElement("div");
  header.className = "history-series-header";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "btn btn-secondary";
  backBtn.textContent = "Back to series";
  backBtn.addEventListener("click", () => {
    historyActiveSeries = null;
    renderHistoryList();
  });

  const hTitle = document.createElement("div");
  hTitle.className = "history-series-title";
  hTitle.textContent = historyActiveSeries;

  header.appendChild(backBtn);
  header.appendChild(hTitle);
  list.appendChild(header);

  // Hard de-duplication guardrail: only show one entry per series + week + day.
  const seriesEntries = dedupeHistoryLog(
    entries
      .filter((e) => (e.series || getActiveSeriesName()) === historyActiveSeries)
      .map((e) => ({
        series: historyActiveSeries,
        week: Number(e.week),
        dayIndex: Number(e.dayIndex),
        completedAt: Number(e.completedAt || 0)
      }))
  );

  seriesEntries.forEach((e) => {
      const card = document.createElement("div");
      card.className = "history-card";

      const title = document.createElement("div");
      title.className = "history-title";
      const displayDay = getDisplayDayNumber(e.dayIndex);
      title.textContent = `Week ${e.week} • Day ${displayDay}`;

      const meta = document.createElement("div");
      meta.className = "history-meta";
      meta.textContent = formatCompletedDate(e.completedAt);

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const openBtn = document.createElement("button");
      openBtn.type = "button";
    openBtn.className = "btn btn-teal-pill btn-small";
      openBtn.textContent = "Open";
      openBtn.addEventListener("click", () => {
        // Ensure the correct series is active before opening a workout from history.
        // Without this, custom series entries may incorrectly open the Sklar programme.
        try { setActiveSeriesName(historyActiveSeries); } catch (_) {}
        showScreen("screen-workout");
        currentWeek = e.week;
        setActiveWeekTab(currentWeek);
        currentDayIndex = e.dayIndex;
        const select = document.getElementById("workout-day-select");
        if (select) select.value = String(currentDayIndex);
        renderWorkoutDay(currentDayIndex);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn btn-danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        if (!confirm("Delete this workout record? This will clear logged sets and completion status for that day.")) return;
        resetDay(e.week, e.dayIndex);
        renderHistoryList();
      });

      actions.appendChild(openBtn);
      actions.appendChild(delBtn);

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(actions);

      list.appendChild(card);
    });
}

  // Week tabs
  const weekTabs = document.querySelectorAll(".week-tab");
  let currentWeek = 1;
  let currentDayIndex = 0;
let durationTicker = null;

  function setActiveWeekTab(week) {
    weekTabs.forEach((tab) => tab.classList.toggle("week-tab--active", parseInt(tab.dataset.week, 10) === week));
  }

  weekTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const w = parseInt(tab.dataset.week, 10);
      if (!Number.isNaN(w)) {
        currentWeek = w;
        setActiveWeekTab(w);

        // If the user has chosen "Next incomplete" behaviour, jump to the first incomplete
        // day in the selected week (prevents returning to already-completed days).
        if (getContinueMode() === "next") {
          currentDayIndex = findFirstIncompleteDayInWeek(w);
          const sel = document.getElementById("workout-day-select");
          if (sel) sel.value = String(currentDayIndex);
        }

        renderWorkoutDay(currentDayIndex);
      }
    });
  });

  // Workout elements
  const workoutDaySelect = document.getElementById("workout-day-select");
  const workoutThemeBadge = document.getElementById("workout-theme-badge");
  const workoutProgramName = document.getElementById("workout-program-name");
  const workoutGoal = document.getElementById("workout-goal");
  const workoutExerciseList = document.getElementById("workout-exercise-list");
  const workoutCompletedBadge = document.getElementById("workout-completed-badge");

  function getCurrentDayState() {
    const state = getWorkoutState();
    return ensureDayState(state, currentWeek, currentDayIndex);
  }

  function isCurrentDayCompleted() {
    return !!getCurrentDayState()?.completed;
  }

  function syncWorkoutCompletionUI() {
    const completed = isCurrentDayCompleted();

    // Visual overlay on cards
    workoutExerciseList?.classList.toggle("workout-day--completed", completed);
    if (workoutExerciseList) workoutExerciseList.dataset.completed = completed ? "true" : "false";

    // Completed pill: grey when incomplete, teal when complete
    if (workoutCompletedBadge) {
      workoutCompletedBadge.classList.toggle("is-complete", completed);
      workoutCompletedBadge.classList.toggle("is-incomplete", !completed);
    }

    // Bottom button label + style
    const completeBtn = document.querySelector(".workout-complete");
    if (completeBtn) {
      if (completed) {
         completeBtn.textContent = "Edit Completed Workout";
         completeBtn.classList.remove("btn-teal");
         completeBtn.classList.add("btn-danger-pill");
      } else {
        completeBtn.textContent = "Complete Workout";
        completeBtn.classList.remove("btn-danger-pill");
        completeBtn.classList.add("btn-teal");
      }
    }
    // Reuse-week button is only relevant for custom programmes
    
  }


  const summaryVolumeEl = document.getElementById("summary-volume");
  const summaryRepsEl = document.getElementById("summary-reps");
  const summaryCaloriesEl = document.getElementById("summary-calories");
  const summaryProgressEl = document.getElementById("summary-progress");
  const summaryDurationEl = document.getElementById("summary-duration");

  // -------------------------
  // Calorie estimate helpers
  // -------------------------
  // Constraint: do not require the user to enter bodyweight.
  // If we have a saved value, we use it; otherwise we use a conservative default.
  function getEstimatedBodyWeightKg() {
    try {
      const profile = readJSON(STORAGE_KEYS.profile, null);
      if (!profile || typeof profile !== "object") return 75;

      // Support a few possible fields without requiring schema changes.
      const raw = profile.weightKg ?? profile.weight_kg ?? profile.weight ?? null;
      const n = raw === null ? NaN : parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) return 75;

      // If the stored value is likely pounds, convert.
      // We treat values > 200 as lbs unless an explicit unit is provided.
      const unit = (profile.weightUnit || profile.units || "").toString().toLowerCase();
      if (unit.includes("lb") || (!unit && n > 200)) return lbToKg(n);
      return n;
    } catch (_) {
      return 75;
    }
  }

  function normaliseIntensityToMET(intensityRaw) {
    const s = (intensityRaw || "").toString().trim().toLowerCase();
    if (!s) return 6; // default "moderate"

    // Numeric scales: 1–10 or similar.
    const n = parseFloat(s);
    if (Number.isFinite(n)) {
      // 1–3 low, 4–6 moderate, 7–8 hard, 9–10 very hard
      if (n <= 3) return 4;
      if (n <= 6) return 6;
      if (n <= 8) return 8;
      return 10;
    }

    if (s.includes("easy") || s.includes("low") || s.includes("zone 1") || s.includes("zone1")) return 4;
    if (s.includes("moderate") || s.includes("medium") || s.includes("steady") || s.includes("zone 2") || s.includes("zone2")) return 6;
    if (s.includes("hard") || s.includes("high") || s.includes("vigorous") || s.includes("zone 3") || s.includes("zone3")) return 8;
    if (s.includes("sprint") || s.includes("max") || s.includes("all out") || s.includes("zone 4") || s.includes("zone4") || s.includes("zone 5") || s.includes("zone5")) return 10;
    return 6;
  }

  function estimateCardioCaloriesForSet(exerciseName, minutes, inclineRaw, intensityRaw) {
    const t = parseFloat(minutes);
    if (!Number.isFinite(t) || t <= 0) return 0;

    const baseMET = (() => {
      const n = (exerciseName || "").toString().toLowerCase();
      if (n.includes("tread") || n.includes("incline")) return 6;
      if (n.includes("bike") || n.includes("cycle")) return 5.5;
      if (n.includes("row")) return 6;
      if (n.includes("stair") || n.includes("climber")) return 7;
      if (n.includes("ski")) return 6.5;
      return 6;
    })();

    let met = baseMET;
    met += (normaliseIntensityToMET(intensityRaw) - 6) * 0.7; // intensity influences MET, tempered

    const inc = parseFloat((inclineRaw || "").toString().replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(inc) && inc > 0) {
      // gentle incline/elevation adjustment (clamped)
      met += Math.min(3, inc * 0.2);
    }

    met = Math.max(2.5, Math.min(14, met));

    const bw = getEstimatedBodyWeightKg();
    // Standard MET formula: kcal/min = MET * 3.5 * kg / 200
    const kcal = (met * 3.5 * bw / 200) * t;
    return Number.isFinite(kcal) ? kcal : 0;
  }

  function estimateResistanceCalories(totalVolumeKg, totalReps) {
    // Heuristic: volume correlates with time-under-tension and effort.
    // Tuned to stay conservative and avoid unrealistic spikes.
    const v = Math.max(0, parseFloat(totalVolumeKg) || 0);
    const r = Math.max(0, parseFloat(totalReps) || 0);
    const kcal = (v * 0.007) + (r * 0.2);
    return Number.isFinite(kcal) ? kcal : 0;
  }



  // -------------------------
  // Workout duration helpers
  // -------------------------
  function ensureWorkoutStarted() {
    const state = getWorkoutState();
    const ds = ensureDayState(state, currentWeek, currentDayIndex);
    if (ds.completed) return; // do not re-start completed workouts
    if (!ds.startedAt) {
      ds.startedAt = Date.now();
      saveWorkoutState(state);
    }
  }

  function formatDurationFromSeconds(totalSec) {
    const s = Math.max(0, Math.floor(Number(totalSec) || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${String(mins).padStart(2, "0")}m`;
    return `${mins}m`;
  }

  function updateDurationFooterOnly() {
    if (!summaryDurationEl) return;
    const state = getWorkoutState();
    const ds = ensureDayState(state, currentWeek, currentDayIndex);

    // Prefer stored duration once completed; otherwise show live elapsed time since start.
    if (ds.durationSec !== null && ds.durationSec !== undefined) {
      summaryDurationEl.textContent = formatDurationFromSeconds(ds.durationSec);
      return;
    }
    if (ds.startedAt) {
      const liveSec = (Date.now() - Number(ds.startedAt)) / 1000;
      summaryDurationEl.textContent = formatDurationFromSeconds(liveSec);
      return;
    }
    summaryDurationEl.textContent = "—";
  }

// Set editor overlay
  const setEditOverlay = document.getElementById("set-edit-overlay");
  const setEditExercise = document.getElementById("set-edit-exercise");
  const setEditWeight = document.getElementById("set-edit-weight");
  const setEditReps = document.getElementById("set-edit-reps");
  const setEditCancel = document.getElementById("set-edit-cancel");
  const setEditSave = document.getElementById("set-edit-save");

  // Start workout timer on first meaningful input (reps/weight edit).
  // This is deliberately lightweight and does not alter set completion logic.
  [setEditWeight, setEditReps].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      ensureWorkoutStarted();
    });
    el.addEventListener("change", () => {
      ensureWorkoutStarted();
    });
    el.addEventListener("focus", () => {
      ensureWorkoutStarted();
    });
  });


  let currentEditWeightPill = null;
  let currentEditRepsPill = null;
  let currentEditContext = null;

  // iOS-only: prevent Safari auto-scrolling/jumping when the keyboard opens inside the set editor.
  // This is a UI/UX mitigation only and should not affect Android.
  const TM_IS_IOS = (() => {
    try {
      const ua = navigator.userAgent || "";
      const isAppleMobile = /iPad|iPhone|iPod/.test(ua);
      // iPadOS 13+ reports itself as Mac; detect touch-capable Mac as iPad.
      const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      return isAppleMobile || isTouchMac;
    } catch (_) {
      return false;
    }
  })();

  let tmIosScrollLockY = 0;
  let tmIosScrollLocked = false;

  function tmIosLockBodyScroll() {
    if (!TM_IS_IOS || tmIosScrollLocked) return;
    tmIosScrollLockY = window.scrollY || 0;
    tmIosScrollLocked = true;

    // Freeze the page behind the overlay. This prevents iOS Safari from jumping the document
    // when the keyboard opens/focus changes inside the modal.
    document.body.style.position = "fixed";
    document.body.style.top = `-${tmIosScrollLockY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
  }

  function tmIosUnlockBodyScroll() {
    if (!TM_IS_IOS || !tmIosScrollLocked) return;
    tmIosScrollLocked = false;

    // Restore body scroll position exactly.
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.left = "";
    document.body.style.right = "";
    document.body.style.width = "";

    window.scrollTo(0, tmIosScrollLockY || 0);
  }

  function openSetEditor(exerciseName, weightPill, repsPill, context) {
    if (isCurrentDayCompleted()) {
      alert("This workout is marked as completed. Tap 'Edit Completed Workout' to make changes.");
      return;
    }
    currentEditWeightPill = weightPill;
    currentEditRepsPill = repsPill;
    currentEditContext = context;

    setEditExercise.textContent = exerciseName;
    const units = getActiveUnits();
    const unit = getWeightUnitLabel(units);
    const weightLabel = document.getElementById("set-edit-weight-label");
    if (weightLabel) weightLabel.textContent = `Weight (${unit})`;
    if (setEditWeight) {
      setEditWeight.step = (units === "imperial") ? "1" : "0.5";
      setEditWeight.placeholder = (units === "imperial") ? "e.g. 90" : "e.g. 40";
    }
    setEditWeight.value = (weightPill.dataset.valueDisplay || weightPill.dataset.value || "");
    setEditReps.value = repsPill.dataset.value || "";

    // iOS only: lock body scroll to prevent anchor-jump when the keyboard opens.
    tmIosLockBodyScroll();

    setEditOverlay.classList.add("set-edit-overlay--active");
  }

  function closeSetEditor() {
    currentEditWeightPill = null;
    currentEditRepsPill = null;
    currentEditContext = null;
    setEditOverlay.classList.remove("set-edit-overlay--active");

    // iOS only: restore body scroll position.
    tmIosUnlockBodyScroll();
  }

  setEditCancel?.addEventListener("click", closeSetEditor);
  setEditOverlay?.addEventListener("click", (e) => { if (e.target === setEditOverlay) closeSetEditor(); });

  // Info modal
  const infoOverlay = document.getElementById("exercise-info-overlay");
  const infoName = document.getElementById("exercise-info-name");
  const infoMuscles = document.getElementById("exercise-info-muscles");
  const infoDesc = document.getElementById("exercise-info-description");
  const infoClose = document.getElementById("exercise-info-close");

  function openExerciseInfo(exercise) {
    const info = exerciseDescriptions[exercise.name] || {};
    infoName.textContent = exercise.name;
    if (info.muscles) {
      infoMuscles.textContent = `Muscles: ${info.muscles}`;
      infoMuscles.style.display = "block";
    } else {
      infoMuscles.textContent = "";
      infoMuscles.style.display = "none";
    }
    const meta = exerciseLibrary[exercise.name] || {};
    const category = meta.category || findCategoryForExercise(exercise.name);
    const equip = meta.equipment ? `Equipment: ${meta.equipment}` : "";
    const catLine = category ? `Category: ${category}` : "";
    const fallbackLines = [catLine, equip].filter(Boolean).join(" • ");
    const fallback = fallbackLines ? `${fallbackLines}.` : "";
    infoDesc.textContent = info.description || exercise.notes || fallback || "No additional description is available yet.";
    infoOverlay.classList.add("set-edit-overlay--active");
  }
  function closeExerciseInfo() { infoOverlay.classList.remove("set-edit-overlay--active"); }
  infoClose?.addEventListener("click", closeExerciseInfo);
  infoOverlay?.addEventListener("click", (e) => { if (e.target === infoOverlay) closeExerciseInfo(); });

  // Exercise edit modal
  const editOverlay = document.getElementById("exercise-edit-overlay");
  const editCurrent = document.getElementById("exercise-edit-current");
  const editSetsWrap = document.getElementById("exercise-edit-sets-wrap");
  const editSetsRow = document.getElementById("exercise-edit-sets-row");
  const editSuggested = document.getElementById("exercise-edit-suggested");
  const editCategoryRow = document.getElementById("exercise-edit-category-row");
  const editCategoryList = document.getElementById("exercise-edit-category-list");
  const editCancel = document.getElementById("exercise-edit-cancel");
  const editClose = document.getElementById("exercise-edit-close");

  let editContext = null; // { dayRef, exRef, titleEl, exIndex }

  function cancelExerciseEdit() {
    // If the user tapped the Sklar "+" button but decides not to add anything,
    // remove the placeholder extra exercise rather than persisting "New Exercise".
    try {
      const activeSeries = getActiveSeriesName();
      const isSklar = activeSeries === DEFAULT_SERIES_NAME;
      const ex = editContext?.exRef;
      if (isSklar && ex && ex.__isExtra && ex.__pendingExtra && ex.__extraId) {
        const st = getWorkoutState();
        const dayState = ensureDayState(st, currentWeek, currentDayIndex);
        const extras = Array.isArray(dayState.extraExercises) ? dayState.extraExercises : [];
        dayState.extraExercises = extras.filter((e) => e?.__extraId !== ex.__extraId);
        // Clean up any set logs accidentally created for this index
        const exKey = String(editContext?.exIndex ?? "");
        if (dayState.exercises && exKey in dayState.exercises) delete dayState.exercises[exKey];
        saveWorkoutState(st);
      }
    } catch (_) {}

    closeExerciseEdit();
    renderWorkoutDay(currentDayIndex);
  }

  function closeExerciseEdit() {
    editContext = null;
    if (editSetsWrap) editSetsWrap.style.display = "none";
    if (editSetsRow) editSetsRow.innerHTML = "";
    editOverlay.classList.remove("set-edit-overlay--active");
  }
  editCancel?.addEventListener("click", cancelExerciseEdit);
  editClose?.addEventListener("click", cancelExerciseEdit);
  editOverlay?.addEventListener("click", (e) => { if (e.target === editOverlay) cancelExerciseEdit(); });

  function applyExerciseSwap(newName) {
    if (!editContext) return;

    // Critical UX safeguard: changing an exercise must never silently delete user-entered data.
    // Behaviour:
    // 1) If there is no logged input for this slot, proceed with the swap.
    // 2) If there is logged input, confirm the swap, then ask whether to delete or keep the data.
    //    - Keep is the default (deletion requires explicit confirmation).
    try {
      const activeSeriesForPrompt = getActiveSeriesName();
      const weekForPrompt = editContext.week ?? currentWeek;
      const dayIdxForPrompt = editContext.dayIndex ?? currentDayIndex;
      const exIdxForPrompt = editContext.exIndex;
      const exKeyForPrompt = String(exIdxForPrompt);

      const stForPrompt = getWorkoutState(activeSeriesForPrompt);
      const dayStateForPrompt = ensureDayState(stForPrompt, weekForPrompt, dayIdxForPrompt);
      const exStateForPrompt = dayStateForPrompt?.exercises?.[exKeyForPrompt];
      const setsForPrompt = exStateForPrompt?.sets || {};

      const hasAnyLoggedInput = Object.values(setsForPrompt).some((s) => {
        if (!s || typeof s !== "object") return false;
        return (
          (s.w && String(s.w).trim() !== "") ||
          (s.r && String(s.r).trim() !== "") ||
          (s.t && String(s.t).trim() !== "") ||
          (s.inc && String(s.inc).trim() !== "") ||
          (s.inten && String(s.inten).trim() !== "")
        );
      });

      if (hasAnyLoggedInput) {
        const oldName = (editContext.exRef?.name || "this exercise").toString();
        const proceed = confirm(`Change exercise from "${oldName}" to "${newName}"?\n\nThis slot already has logged inputs.`);
        if (!proceed) return;

        const deleteData = confirm(
          `Do you want to delete the logged inputs for "${oldName}"?\n\nOK = Delete logged inputs\nCancel = Keep logged inputs (recommended)`
        );

        if (deleteData) {
          // Delete only the entered set data for this exercise slot.
          // This does not affect any saved workout logs elsewhere.
          if (dayStateForPrompt.exercises && exKeyForPrompt in dayStateForPrompt.exercises) {
            delete dayStateForPrompt.exercises[exKeyForPrompt];
          }
          saveWorkoutState(stForPrompt, activeSeriesForPrompt);
        }
      }
    } catch (_) {
      // If anything goes wrong in the safeguard flow, fall back to swapping without deleting.
    }
    // Persist exercise swaps.
    // - Sklar: persist an exercise-name override per week/day/slot so edits stick offline
    //   and remain consistent across views.
    // - Custom: persist to the week-scoped override template (week independence feature).
    try {
      const activeSeries = getActiveSeriesName();
      const isSklar = activeSeries === DEFAULT_SERIES_NAME;
      if (!isSklar) {
        const week = editContext.week ?? currentWeek;
        const dayIdx = editContext.dayIndex ?? currentDayIndex;
        const exIdx = editContext.exIndex;

        const weekTpl = ensureCustomWeekOverride(activeSeries, week);
        if (weekTpl?.[dayIdx]?.exercises?.[exIdx]) {
          weekTpl[dayIdx].exercises[exIdx].name = newName;
          // Keep local reference consistent so the overlay and re-render match.
          editContext.exRef.name = newName;
          const st = getWorkoutState(activeSeries);
          if (!st.customWeekOverrides || typeof st.customWeekOverrides !== "object") st.customWeekOverrides = {};
          st.customWeekOverrides[String(week)] = weekTpl;
          saveWorkoutState(st, activeSeries);
        } else {
          editContext.exRef.name = newName;
        }
      } else {
        editContext.exRef.name = newName;
      }
    } catch (_) {
      editContext.exRef.name = newName;
    }

    // Always persist the exercise-name override for this slot (all series).
    // This avoids "it changed but didn't stick" regressions due to template cloning.
    try {
      const series = getActiveSeriesName();
      const week = editContext.week ?? currentWeek;
      const dayIdx = editContext.dayIndex ?? currentDayIndex;
      const exIdx = editContext.exIndex;
      setExerciseNameOverride(series, week, dayIdx, exIdx, newName);

      // If this is a custom programme edit in Week 1, also mirror the change into the
      // saved programme definition so the builder "sheet" view stays in sync.
      if (series !== DEFAULT_SERIES_NAME && Number(week) === 1) {
        mirrorWeek1ExerciseNameToCustomDefinition(series, dayIdx, exIdx, newName);
      }
    } catch (_) {}
    // If this was a pending extra exercise, it is now confirmed.
    if (editContext.exRef.__pendingExtra) delete editContext.exRef.__pendingExtra;
    editContext.titleEl.textContent = newName;

    // If this is an extra exercise added to the Sklar programme, persist the change.
    try {
      const activeSeries = getActiveSeriesName();
      if (activeSeries === DEFAULT_SERIES_NAME && editContext.exRef && editContext.exRef.__isExtra) {
        const st = getWorkoutState();
        ensureDayState(st, currentWeek, currentDayIndex);
        saveWorkoutState(st);
      }
    } catch (_) {}

    closeExerciseEdit();
    renderWorkoutDay(currentDayIndex);
  }

  function renderCategoryList(categoryName) {
    editCategoryList.innerHTML = "";
    const list = exerciseCategories[categoryName] || [];
    if (!list.length) {
      const p = document.createElement("p");
      p.className = "exercise-edit-empty";
      p.textContent = "No exercises defined for this category yet.";
      editCategoryList.appendChild(p);
      return;
    }
    list.forEach((name) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exercise-edit-option";
      btn.textContent = name;
      btn.addEventListener("click", () => applyExerciseSwap(name));
      editCategoryList.appendChild(btn);
    });
  }
  function findCategoryForExercise(exerciseName) {
    const meta = exerciseLibrary[exerciseName];
    if (meta?.category) return meta.category;

    for (const [cat, list] of Object.entries(exerciseCategories)) {
      if (Array.isArray(list) && list.includes(exerciseName)) return cat;
    }
    return null;
  }

  function buildAutoAlternatives(exerciseName, categoryName, limit = 8) {
    const list = exerciseCategories[categoryName] || [];
    return list.filter((n) => n !== exerciseName).slice(0, limit);
  }


  function openExerciseEdit(dayRef, exRef, titleEl, exIndex) {
    if (isCurrentDayCompleted()) {
      alert("This workout is marked as completed. Tap 'Edit Completed Workout' to make changes.");
      return;
    }
    editContext = { dayRef, exRef, titleEl, exIndex, week: currentWeek, dayIndex: currentDayIndex };

    editCurrent.textContent = exRef.name;
    editSuggested.innerHTML = "";
    editCategoryRow.innerHTML = "";
    editCategoryList.innerHTML = "";

    // Sets selector
    // - Sklar: stored in workout state per exercise instance
    // - Custom programmes: stored per week snapshot so weeks become independent once edited
    if (editSetsWrap && editSetsRow) {
      const activeSeries = getActiveSeriesName();
      const isSklar = activeSeries === DEFAULT_SERIES_NAME;
      const isCustom = !isSklar;

      editSetsWrap.style.display = (isSklar || isCustom) ? "flex" : "none";
      editSetsRow.innerHTML = "";

      let currentSets = 4;
      if (isSklar) {
        const state = getWorkoutState();
        ensureDayState(state, currentWeek, currentDayIndex);
        const exState = getExerciseState(state, currentWeek, currentDayIndex, exIndex);
        currentSets = Number.isFinite(parseInt(exState.setCount, 10))
          ? Math.min(10, Math.max(1, parseInt(exState.setCount, 10)))
          : 4;
      } else {
        // Custom: prefer the exercise definition's setCount
        const defCnt = Number.isFinite(parseInt(exRef.setCount, 10))
          ? Math.min(10, Math.max(1, parseInt(exRef.setCount, 10)))
          : 4;
        currentSets = defCnt;
      }

      for (let n = 1; n <= 10; n++) {
        const pill = document.createElement("button");
        pill.type = "button";
        pill.className = "exercise-edit-sets-pill" + (n === currentSets ? " exercise-edit-sets-pill--active" : "");
        pill.textContent = String(n);
        pill.addEventListener("click", () => {
          if (isSklar) {
            const state = getWorkoutState();
            ensureDayState(state, currentWeek, currentDayIndex);
            const exState = getExerciseState(state, currentWeek, currentDayIndex, exIndex);
            exState.setCount = n;
            saveWorkoutState(state);
          } else {
            // Custom programmes: apply per-week snapshot so later-week edits do not mutate earlier weeks.
            const seriesName = getActiveSeriesName();
            const weekTpl = ensureCustomWeekOverride(seriesName, currentWeek);
            try {
              if (weekTpl?.[currentDayIndex]?.exercises?.[exIndex]) {
                weekTpl[currentDayIndex].exercises[exIndex].setCount = n;
                const st = getWorkoutState(seriesName);
                if (!st.customWeekOverrides || typeof st.customWeekOverrides !== "object") st.customWeekOverrides = {};
                st.customWeekOverrides[String(currentWeek)] = weekTpl;
                saveWorkoutState(st, seriesName);
              }
            } catch (_) {}
          }

          closeExerciseEdit();
          renderWorkoutDay(currentDayIndex);
          const day = getProgramForWeek(currentWeek)[currentDayIndex];
          updateWorkoutSummary(day);
        });
        editSetsRow.appendChild(pill);
      }
    }

    const meta = exerciseLibrary[exRef.name];
    const categoryName = findCategoryForExercise(exRef.name);
    const curatedAlternatives = meta?.alternatives || [];
    const alternatives = curatedAlternatives.length ? curatedAlternatives : (categoryName ? buildAutoAlternatives(exRef.name, categoryName, 8) : []);
    if (alternatives.length) {
      alternatives.forEach((name) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "exercise-edit-option";
        btn.textContent = name;
        btn.addEventListener("click", () => applyExerciseSwap(name));
        editSuggested.appendChild(btn);
      });
    } else {
      const p = document.createElement("p");
      p.className = "exercise-edit-empty";
      p.textContent = "No curated alternatives yet. Browse by category below.";
      editSuggested.appendChild(p);
    }

    Object.keys(exerciseCategories).forEach((catName) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "exercise-edit-category-pill";
      pill.textContent = catName;
      pill.addEventListener("click", () => {
        editCategoryRow.querySelectorAll(".exercise-edit-category-pill").forEach((p) => p.classList.remove("exercise-edit-category-pill--active"));
        pill.classList.add("exercise-edit-category-pill--active");
        renderCategoryList(catName);
      });
      editCategoryRow.appendChild(pill);
    });

    if (categoryName) {
      const pills = editCategoryRow.querySelectorAll(".exercise-edit-category-pill");
      pills.forEach((p) => {
        if (p.textContent === categoryName) {
          p.classList.add("exercise-edit-category-pill--active");
          renderCategoryList(categoryName);
        }
      });
    }

    editOverlay.classList.add("set-edit-overlay--active");
  }

  // Compute expected total sets for the current day.
  // Sklar defaults to 4, but can be overridden per exercise via Exercise Edit.
  function expectedTotalSetsForDay(day) {
    // For Sklar, include any extra exercises the user has added for this specific day.
    const activeSeries = getActiveSeriesName();
    let exercises = day?.exercises || [];
    if (activeSeries === DEFAULT_SERIES_NAME) {
      try {
        const st = getWorkoutState();
        const dayState = ensureDayState(st, currentWeek, currentDayIndex);
        const extras = Array.isArray(dayState.extraExercises) ? dayState.extraExercises : [];
        exercises = exercises.concat(extras);
      } catch (_) {}
    }
    if (!exercises.length) return 0;
    if (activeSeries === DEFAULT_SERIES_NAME) {
      const state = getWorkoutState();
      ensureDayState(state, currentWeek, currentDayIndex);
      let total = 0;
      exercises.forEach((_, exIndex) => {
        const exState = getExerciseState(state, currentWeek, currentDayIndex, exIndex);
        const cnt = Number.isFinite(parseInt(exState.setCount, 10))
          ? Math.min(10, Math.max(1, parseInt(exState.setCount, 10)))
          : 4;
        total += cnt;
      });
      return total;
    }

    // Custom programmes store setCount on the exercise definition
    return exercises.reduce((acc, ex) => {
      const cnt = Number.isFinite(parseInt(ex.setCount, 10))
        ? Math.min(10, Math.max(1, parseInt(ex.setCount, 10)))
        : 4;
      return acc + cnt;
    }, 0);
  }

  function updateWorkoutSummary(day) {
    const state = getWorkoutState();
    const dayState = ensureDayState(state, currentWeek, currentDayIndex);

    // Build an index->exercise map so we can treat cardio sets differently.
    let exercisesForIndex = [];
    try {
      const activeSeries = getActiveSeriesName();
      if (activeSeries === DEFAULT_SERIES_NAME) {
        const removed = Array.isArray(dayState.removedBaseIndices) ? dayState.removedBaseIndices : [];
        const base = (day?.exercises || []).map((ex, idx) => (removed.includes(idx) ? null : ex));
        const extras = Array.isArray(dayState.extraExercises) ? dayState.extraExercises : [];
        exercisesForIndex = base.concat(extras).filter(Boolean);
      } else {
        exercisesForIndex = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
      }
    } catch (_) {
      exercisesForIndex = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
    }

    let totalVolume = 0;
    let totalReps = 0;
    let totalCardioKcal = 0;
    let completedSets = 0;

    const exEntries = dayState.exercises || {};
    Object.keys(exEntries).forEach((exKey) => {
      const exIndex = parseInt(exKey, 10);
      const exName = (Number.isFinite(exIndex) && exercisesForIndex[exIndex]) ? (exercisesForIndex[exIndex].name || "") : "";
      const cardio = isCardioExercise(exName);
      const sets = exEntries[exKey]?.sets || {};
      Object.keys(sets).forEach((sKey) => {
        const s = sets[sKey] || {};
        if (cardio) {
          const tVal = parseFloat(s.t);
          const inten = (s.inten || "").toString().trim();
          const inc = s.inc;
          if (Number.isFinite(tVal) && tVal > 0 && inten) {
            completedSets += 1;
            totalCardioKcal += estimateCardioCaloriesForSet(exName, tVal, inc, inten);
          }
        } else {
          const wVal = parseFloat(s.w);
          const rVal = parseFloat(s.r);
          if (Number.isFinite(wVal) && wVal >= 0 && Number.isFinite(rVal) && rVal > 0) {
            completedSets += 1;
            totalVolume += wVal * rVal;
            totalReps += rVal;
          }
        }
      });
    });

    const expected = expectedTotalSetsForDay(day);
        const unit = getWeightUnitLabel(getActiveUnits());
    summaryVolumeEl.textContent = totalVolume > 0 ? `${totalVolume.toFixed(0)} ${unit}` : `0 ${unit}`;
    summaryRepsEl.textContent = totalReps > 0 ? String(totalReps) : "0";
    const resistanceKcal = estimateResistanceCalories(totalVolume, totalReps);
    const kcal = resistanceKcal + totalCardioKcal;
    if (summaryCaloriesEl) summaryCaloriesEl.textContent = kcal > 0 ? `${Math.round(kcal)}` : "0";
    summaryProgressEl.textContent = `${completedSets}/${expected}`;
    updateDurationFooterOnly();
  }

  // Save set edits
  setEditSave?.addEventListener("click", () => {
    if (!currentEditContext) { closeSetEditor(); return; }

    try { ensureWorkoutStarted(); } catch (_) {}

    const wRaw = (setEditWeight.value || "").trim();
    const rRaw = (setEditReps.value || "").trim();

    const wSuggestion = currentEditWeightPill?.dataset?.suggestion || "";
    const rSuggestion = currentEditRepsPill?.dataset?.suggestion || "";

    // If user leaves fields blank, commit suggested values for a faster workflow
    const units = getActiveUnits();
    const wDisplay = wRaw || wSuggestion || "";
    const wKg = wDisplay ? toKgFromDisplayWeight(wDisplay, units) : "";
    const w = wDisplay;
    const r = rRaw || rSuggestion || "";
    // Keep DOM state in sync so other UI actions (e.g., equipment switching)
    // do not appear to reset entered values.
    // - dataset.value stores the persisted weight in kg.
    // - dataset.valueDisplay is only used to prefill the editor with what the user typed.
    currentEditWeightPill.dataset.valueDisplay = w;
    currentEditWeightPill.dataset.valueKg = wKg;
    currentEditWeightPill.dataset.value = wKg || "";
    currentEditRepsPill.dataset.value = r;

    if (w) {
      currentEditWeightPill.textContent = formatWeightPill(wKg || "", currentEditContext?.equipmentCode);
      currentEditWeightPill.classList.remove("input-pill--suggested");
    } else if (wSuggestion) {
      currentEditWeightPill.textContent = formatWeightPill(currentEditWeightPill?.dataset?.suggestionKg || "", currentEditContext?.equipmentCode);
      currentEditWeightPill.classList.add("input-pill--suggested");
    } else {
      currentEditWeightPill.textContent = getWeightUnitLabel(getActiveUnits());
      currentEditWeightPill.classList.remove("input-pill--suggested");
    }

    if (r) {
      currentEditRepsPill.textContent = `${r} reps`;
      currentEditRepsPill.classList.remove("input-pill--suggested");
    } else if (rSuggestion) {
      currentEditRepsPill.textContent = `${rSuggestion} reps`;
      currentEditRepsPill.classList.add("input-pill--suggested");
    } else {
      currentEditRepsPill.textContent = "reps";
      currentEditRepsPill.classList.remove("input-pill--suggested");
    }

    // Persist
    const state = getWorkoutState();
    const { week, dayIndex, exIndex, setIndex } = currentEditContext;
    const setState = getSetState(state, week, dayIndex, exIndex, setIndex);
    setState.w = wKg;
    setState.r = r;
    saveWorkoutState(state);

    // UI-only: visually mark an exercise card as completed once all sets are logged.
    try {
      const card = currentEditWeightPill?.closest?.(".exercise-card");
      if (card) {
        const setCount = card.querySelectorAll(".set-cell").length;
        updateExerciseCardCompletion(card, state, week, dayIndex, exIndex, setCount, false);
      }
    } catch (_) {}

    closeSetEditor();

    const day = getProgramForWeek(currentWeek)[currentDayIndex];
    updateWorkoutSummary(day);
  });

  // -------------------------
  // Cardio set editor (time + incline + intensity)
  // -------------------------
  const cardioEditOverlay = document.getElementById("cardio-edit-overlay");
  const cardioEditExercise = document.getElementById("cardio-edit-exercise");
  const cardioEditSetLabel = document.getElementById("cardio-edit-setlabel");
  const cardioEditTime = document.getElementById("cardio-edit-time");
  const cardioEditIncline = document.getElementById("cardio-edit-incline");
  const cardioEditIntensity = document.getElementById("cardio-edit-intensity");
  const cardioEditCancel = document.getElementById("cardio-edit-cancel");
  const cardioEditSave = document.getElementById("cardio-edit-save");

  let currentCardioPills = null; // { timePill, inclinePill, intensityPill }
  let currentCardioContext = null; // { week, dayIndex, exIndex, setIndex }

  function openCardioEditor(exerciseName, timePill, inclinePill, intensityPill, context) {
    if (!cardioEditOverlay) return;
    currentCardioPills = { timePill, inclinePill, intensityPill };
    currentCardioContext = context || null;

    // Title
    if (cardioEditExercise) cardioEditExercise.textContent = exerciseName || "";
    if (cardioEditSetLabel) cardioEditSetLabel.textContent = (context && Number.isFinite(context.setIndex)) ? `Set ${context.setIndex + 1}` : "";

    // Prefill from saved state (preferred) then fall back to pill datasets.
    const state = getWorkoutState();
    const setState = (context && context.week != null)
      ? getSetState(state, context.week, context.dayIndex, context.exIndex, context.setIndex)
      : {};

    const t = (setState?.t ?? timePill?.dataset?.value ?? "").toString();
    const inc = (setState?.inc ?? inclinePill?.dataset?.value ?? "").toString();
    const inten = (setState?.inten ?? intensityPill?.dataset?.value ?? "").toString();

    if (cardioEditTime) cardioEditTime.value = t;
    if (cardioEditIncline) cardioEditIncline.value = inc;
    if (cardioEditIntensity) cardioEditIntensity.value = inten;

    cardioEditOverlay.classList.add("set-edit-overlay--active");
    cardioEditOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => { try { cardioEditTime?.focus(); } catch (_) {} }, 40);
  }

  function closeCardioEditor() {
    currentCardioPills = null;
    currentCardioContext = null;
    cardioEditOverlay?.classList.remove("set-edit-overlay--active");
    cardioEditOverlay?.setAttribute("aria-hidden", "true");
  }

  cardioEditCancel?.addEventListener("click", closeCardioEditor);
  cardioEditOverlay?.addEventListener("click", (e) => { if (e.target === cardioEditOverlay) closeCardioEditor(); });

  cardioEditSave?.addEventListener("click", () => {
    if (!currentCardioPills || !currentCardioContext) { closeCardioEditor(); return; }

    const tRaw = (cardioEditTime?.value || "").trim();
    const incRaw = (cardioEditIncline?.value || "").trim();
    const intenRaw = (cardioEditIntensity?.value || "").trim();

    // Update pill datasets + text
    const { timePill, inclinePill, intensityPill } = currentCardioPills;
    timePill.dataset.value = tRaw;
    inclinePill.dataset.value = incRaw;
    intensityPill.dataset.value = intenRaw;

    timePill.textContent = tRaw ? `${tRaw} min` : "time";
    inclinePill.textContent = incRaw ? `incline ${incRaw}` : "incline";
    intensityPill.textContent = intenRaw ? intenRaw : "intensity";

    timePill.classList.toggle("input-pill--suggested", !tRaw);
    inclinePill.classList.toggle("input-pill--suggested", !incRaw);
    intensityPill.classList.toggle("input-pill--suggested", !intenRaw);

    // Persist
    const state = getWorkoutState();
    const { week, dayIndex, exIndex, setIndex } = currentCardioContext;
    const setState = getSetState(state, week, dayIndex, exIndex, setIndex);
    setState.t = tRaw;
    setState.inc = incRaw;
    setState.inten = intenRaw;
    // Ensure resistance keys do not accidentally mark completion for cardio
    if ("w" in setState) delete setState.w;
    if ("r" in setState) delete setState.r;
    saveWorkoutState(state);

    // UI-only completion styling
    try {
      const card = timePill?.closest?.(".exercise-card");
      if (card) {
        const setCount = card.querySelectorAll(".set-cell").length;
        const exName = card.querySelector(".exercise-title")?.textContent || "";
        updateExerciseCardCompletion(card, state, week, dayIndex, exIndex, setCount, isCardioExercise(exName));
      }
    } catch (_) {}

    closeCardioEditor();
    const day = getProgramForWeek(currentWeek)[currentDayIndex];
    updateWorkoutSummary(day);
  });

  // Equipment select enabled + highlighted default
  function buildEquipmentRow(card, defaultEquip, onChange) {
    const equipmentRow = document.createElement("div");
    equipmentRow.className = "equipment-pill-row";
    const options = ["DB", "BB", "KB", "BW", "MC"];

    options.forEach((code) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "equipment-pill";
      pill.textContent = code;
      pill.dataset.equipmentCode = code;
      if (code === defaultEquip) {
        pill.classList.add("equipment-pill--active");
        card.dataset.equipment = code;
      }

      pill.addEventListener("click", () => {
        // Allow change
        equipmentRow.querySelectorAll(".equipment-pill").forEach((p) => p.classList.remove("equipment-pill--active"));
        pill.classList.add("equipment-pill--active");
        card.dataset.equipment = code;
        onChange?.(code);
      });

      equipmentRow.appendChild(pill);
    });

    return equipmentRow;
  }


  function refreshCardSuggestions(card, ex, exIndex, dayIndex, equipCode) {
    // Recompute suggestions for this exercise card when equipment changes.
    const profile = readJSON(STORAGE_KEYS.profile, null);
    const profileWeightKg = profile?.units === "imperial"
      ? (Number(profile.weight) * 0.453592)
      : Number(profile?.weight);

    const targetReps = getTargetRepsFromPrescription(ex.prescription) || 8;
    const oneRMBase = getOneRMBasedSuggestion(ex.name, targetReps, equipCode);
    const baseSuggestionKg = oneRMBase ? null : null;
    const baseSuggestion = oneRMBase || (() => {
      const kgStr = profileFallbackSuggestionKg(ex.name, profileWeightKg, equipCode);
      const kgNum = parseFloat(kgStr);
      if (!kgStr) return "";
      if (getActiveUnits() === "imperial") {
        return formatSuggestedWeightFromKg(Number.isFinite(kgNum) ? kgNum : 0, equipCode) || "";
      }
      return kgStr;
    })();

    const stPrev = getWorkoutState(); // for progression lookup
    const prevDayState = currentWeek > 1 ? ensureDayState(stPrev, currentWeek - 1, dayIndex) : null;

    const weightPills = card.querySelectorAll(".set-weight-pill");
    const repsPills = card.querySelectorAll(".set-reps-pill");

	    const maxSets = Math.min(weightPills.length, repsPills.length);
	    for (let setIndex = 0; setIndex < maxSets; setIndex++) {
      const wPill = weightPills[setIndex];
      const rPill = repsPills[setIndex];
      if (!wPill || !rPill) continue;

      // Only update suggestions if user has not entered a value
      const hasUserW = (wPill.dataset.value || "") !== "";
      const hasUserR = (rPill.dataset.value || "") !== "";

      const suggestionR = String(targetReps);

      let suggestionW = "";
      if (isCoreOrBW(ex.name)) {
        suggestionW = "00";
      } else if (currentWeek > 1) {
        const prevSet = prevDayState?.exercises?.[String(exIndex)]?.sets?.[String(setIndex)];
        const prevW = prevSet?.w;
        const prevR = prevSet?.r;
        if (prevW && prevR && meetsTargetReps(prevR, targetReps)) {
          const inc = getWeightIncrementInUserUnits(equipCode, getActiveUnits());
          const wNum = parseFloat(prevW);
          if (Number.isFinite(wNum) && inc > 0) {
            const next = roundToUserIncrement(wNum + inc, equipCode, getActiveUnits());
            suggestionW = next ? String(next) : String(wNum);
          } else {
            suggestionW = String(prevW);
          }
        } else {
          suggestionW = baseSuggestion;
        }
      } else {
        suggestionW = baseSuggestion;
      }

      // Persist suggestions on the pill datasets
      wPill.dataset.suggestionKg = String(suggestionW ?? "");
            const units2 = getActiveUnits();
            wPill.dataset.suggestion = toDisplayWeightFromKg(suggestionW, units2);
      rPill.dataset.suggestion = suggestionR;

	      if (hasUserW) {
	        // User has entered a weight: keep it visible and reformat for the newly-selected equipment.
	        wPill.textContent = formatWeightPill(wPill.dataset.value || "", equipCode);
	        wPill.classList.remove("input-pill--suggested");
	      } else {
	        // No user weight: show suggestion / placeholder.
	        if (suggestionW !== "") {
	          wPill.textContent = formatWeightPill(String(suggestionW ?? ""), equipCode);
	          wPill.classList.add("input-pill--suggested");
	        } else {
	          wPill.textContent = getWeightUnitLabel(getActiveUnits());
	          wPill.classList.remove("input-pill--suggested");
	        }
	      }

	      if (hasUserR) {
	        // User has entered reps: keep them visible.
	        rPill.textContent = `${rPill.dataset.value} reps`;
	        rPill.classList.remove("input-pill--suggested");
	      } else {
	        rPill.textContent = `${suggestionR} reps`;
	        rPill.classList.add("input-pill--suggested");
	      }
    }
  }

  // -------------------------
  // UI-only completion styling
  // -------------------------
  function isExerciseCompleteForUI(state, week, dayIndex, exIndex, setCount, isCardio) {
    try {
      const dayState = ensureDayState(state, week, dayIndex);
      const exKey = String(exIndex);
      const sets = dayState?.exercises?.[exKey]?.sets || {};

      // An exercise is considered "complete" for styling purposes only if:
      // - Resistance: every set has both a weight (kg) value and a reps value.
      // - Cardio: every set has a time value and an intensity value.
      for (let i = 0; i < setCount; i++) {
        const s = sets[String(i)] || {};
        if (isCardio) {
          const tVal = parseFloat(s.t);
          const inten = (s.inten || "").toString().trim();
          if (!Number.isFinite(tVal) || tVal <= 0) return false;
          if (!inten) return false;
        } else {
          const wVal = parseFloat(s.w);
          const rVal = parseFloat(s.r);
          if (!Number.isFinite(wVal) || wVal < 0) return false;
          if (!Number.isFinite(rVal) || rVal <= 0) return false;
        }
      }
      return setCount > 0;
    } catch (_) {
      return false;
    }
  }

  function updateExerciseCardCompletion(card, state, week, dayIndex, exIndex, setCount, isCardio) {
    const done = isExerciseCompleteForUI(state, week, dayIndex, exIndex, setCount, !!isCardio);
    card.classList.toggle("exercise-card--completed", !!done);
  }

  // Render workout day
  function renderWorkoutDay(dayIndex) {
    const program = getProgramForWeek(currentWeek);
    let idx = parseInt(dayIndex, 10);
    if (!Number.isFinite(idx)) idx = 0;

    let day = program[idx];
    if (!day) {
      // Safety fallback: do not leave stale cards rendered while the UI shows a different day.
      idx = 0;
      day = program[idx];
      if (!day) return;
      const sel = document.getElementById("workout-day-select");
      if (sel) sel.value = String(idx);
    } else {
      const sel = document.getElementById("workout-day-select");
      if (sel && sel.value !== String(idx)) sel.value = String(idx);
    }

    currentDayIndex = idx;
    
    setLastViewedWorkout(currentWeek, currentDayIndex);

    const activeSeries = getActiveSeriesName();

    // Ensure the Edit pill visibility stays in sync when switching programmes/days.
    try { syncWorkoutEditProgramButton(); } catch (_) {}

    // For custom programmes, hide the theme badge (avoid the extra green pill).
    if (workoutThemeBadge) {
      const isCustom = activeSeries !== DEFAULT_SERIES_NAME;
      workoutThemeBadge.hidden = isCustom;
      workoutThemeBadge.textContent = isCustom ? "" : (day.theme || "");
    }

    // Subheading text beneath the programme title
    if (workoutGoal) {
      workoutGoal.textContent = (activeSeries === DEFAULT_SERIES_NAME) ? day.goal : "";
    }

    // Programme title (shown above day selector)
    if (workoutProgramName) {
      workoutProgramName.textContent = (activeSeries === DEFAULT_SERIES_NAME)
        ? "Sklar 6-Week Strength & Hypertrophy"
        : activeSeries;
    }


    // Ensure state structure exists
    const state = getWorkoutState();
    const dayState = ensureDayState(state, currentWeek, dayIndex);
    saveWorkoutState(state);

    // Profile weight in kg
    const profile = readJSON(STORAGE_KEYS.profile, null);
    const profileWeightKg = profile?.units === "imperial"
      ? (Number(profile.weight) * 0.453592)
      : Number(profile?.weight);

    workoutExerciseList.innerHTML = "";

    // Sklar only: allow users to add extra exercises to a prescribed day (stored per week/day).
    const isSklarProgramme = (activeSeries === DEFAULT_SERIES_NAME);
    // Back-compat: older saves will not have this field.
    if (!Array.isArray(dayState.removedBaseIndices)) dayState.removedBaseIndices = [];
    const removedBaseIndices = dayState.removedBaseIndices;
    const extraExercises = isSklarProgramme && Array.isArray(dayState.extraExercises) ? dayState.extraExercises : [];
    // Mark extras for persistence hooks in the edit overlay.
    extraExercises.forEach((ex) => { if (ex && typeof ex === "object") ex.__isExtra = true; });
    const baseExercises = (day.exercises || []);
    const baseCount = baseExercises.length;
    // Keep indices stable for saved set data by inserting nulls for removed base exercises.
    const renderExercises = baseExercises.map((ex, idx) => (removedBaseIndices.includes(idx) ? null : ex)).concat(extraExercises);

    renderExercises.forEach((ex, exIndex) => {
      if (!ex) return;

      // Apply any persisted exercise-name override for this slot.
      // This is critical for offline-safe persistence and cross-view consistency.
      try {
        const overrideName = getExerciseNameOverride(dayState, exIndex);
        if (overrideName) ex.name = overrideName;
      } catch (_) {}
      const card = document.createElement("div");
      card.className = "exercise-card";

      // Header
      const header = document.createElement("div");
      header.className = "exercise-card-header";

      const topRow = document.createElement("div");
      topRow.className = "exercise-header-top-row";

      const meta = exerciseLibrary[ex.name];
      const defaultEquip = meta?.equipment || "MC";

      // Persisted equipment choice per week/day/exercise
      const exState = getExerciseState(state, currentWeek, dayIndex, exIndex);
      const selectedEquip = exState.equipment || defaultEquip;

      const title = document.createElement("p");
      title.className = "exercise-title";
      title.textContent = ex.name;

      const equipmentRow = buildEquipmentRow(card, selectedEquip, (code) => {
        // Save equipment choice and refresh suggestions in-place (do NOT re-render the whole day)
        exState.equipment = code;
        saveWorkoutState(state);
        refreshCardSuggestions(card, ex, exIndex, dayIndex, code);
      });

      const linksRow = document.createElement("div");
      linksRow.className = "exercise-header-links-row";

      const links = document.createElement("div");
      links.className = "exercise-header-links";

      const infoBtn = document.createElement("button");
      infoBtn.type = "button";
      infoBtn.textContent = "Info";
      infoBtn.addEventListener("click", () => openExerciseInfo(ex));

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openExerciseEdit(day, ex, title, exIndex));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-btn";
      delBtn.setAttribute("aria-label", "Delete exercise");
      delBtn.innerHTML = getTrashIconSVG();
      delBtn.addEventListener("click", () => {
        // Keep behaviour consistent with other edits: do not mutate a completed workout unless the user is editing it.
        if (isCurrentDayCompleted()) {
          alert("This workout is completed. Tap ‘Edit Completed Workout’ to make changes.");
          return;
        }
        const ok = window.confirm("Are you sure you want to delete this exercise? This will remove it from this week’s day only.");
        if (!ok) return;

        const st = getWorkoutState();
        const ds = ensureDayState(st, currentWeek, dayIndex);
        if (!Array.isArray(ds.removedBaseIndices)) ds.removedBaseIndices = [];

        if (exIndex < baseCount) {
          // Base programme exercise: mark it as removed for this week/day without shifting indices.
          if (!ds.removedBaseIndices.includes(exIndex)) ds.removedBaseIndices.push(exIndex);
          // Optional cleanup of set data for this slot (safe to leave, but helps keep state tidy).
          try { if (ds.exercises && ds.exercises[String(exIndex)]) delete ds.exercises[String(exIndex)]; } catch (_) {}
        } else {
          // Extra exercise added via '+' (Sklar-only)
          const extraIdx = exIndex - baseCount;
          if (Array.isArray(ds.extraExercises) && ds.extraExercises[extraIdx]) {
            ds.extraExercises.splice(extraIdx, 1);
          }
          // Clean up any set data for this extra slot.
          try { if (ds.exercises && ds.exercises[String(exIndex)]) delete ds.exercises[String(exIndex)]; } catch (_) {}
        }

        saveWorkoutState(st);
        renderWorkoutDay(dayIndex);
      });

      links.appendChild(infoBtn);
      links.appendChild(editBtn);
      links.appendChild(delBtn);
      linksRow.appendChild(links);

      topRow.appendChild(equipmentRow);
      topRow.appendChild(linksRow);

      header.appendChild(topRow);
      header.appendChild(title);
      card.appendChild(header);

      if (ex.notes) {
        const note = document.createElement("p");
        note.className = "exercise-note";
        note.textContent = `Note: ${ex.notes}`;
        card.appendChild(note);
      }

      // Sets grid (4)
      const setsGrid = document.createElement("div");
      setsGrid.className = "sets-grid";

      const equipCode = card.dataset.equipment || defaultEquip;
      const targetReps = getTargetRepsFromPrescription(ex.prescription) || 8; // safe default

      // Base suggestion: 1RM if mapped, else profile fallback with caps
const oneRMBase = getOneRMBasedSuggestion(ex.name, targetReps, equipCode);
const baseSuggestion = oneRMBase || (() => {
  const kgStr = profileFallbackSuggestionKg(ex.name, profileWeightKg, equipCode);
  if (!kgStr) return "";
  if (getActiveUnits() === "imperial") {
    const kgNum = parseFloat(kgStr);
    return formatSuggestedWeightFromKg(Number.isFinite(kgNum) ? kgNum : 0, equipCode) || "";
  }
  return kgStr;
})();

      // Progressive overload: if week>1, use last week's logged weight when successful
      function progressedSuggestion(setIndex) {
        // Core/BW stays 00
        if (isCoreOrBW(ex.name)) return "00";

        const wNow = String(currentWeek);
        if (currentWeek <= 1) return baseSuggestion;

        const prevState = getWorkoutState();
        const prevDayState = ensureDayState(prevState, currentWeek - 1, dayIndex);
        const prevSet = prevDayState?.exercises?.[String(exIndex)]?.sets?.[String(setIndex)];

        const prevW = prevSet?.w;
        const prevR = prevSet?.r;

        if (prevW && prevR && meetsTargetReps(prevR, targetReps)) {
          const inc = getWeightIncrementInUserUnits(equipCode, getActiveUnits());
          const wNum = parseFloat(prevW);
          if (Number.isFinite(wNum) && inc > 0) {
            const next = roundToUserIncrement(wNum + inc, equipCode, getActiveUnits());
            return next ? String(next) : String(wNum);
          }
          return String(prevW);
        }

        // If no previous or didn't meet target, keep base suggestion
        return baseSuggestion;
      }

      const activeSeries = getActiveSeriesName();
      const setCount = (activeSeries === DEFAULT_SERIES_NAME)
        ? (Number.isFinite(parseInt(exState.setCount, 10)) ? Math.min(10, Math.max(1, parseInt(exState.setCount, 10))) : 4)
        : (Number.isFinite(parseInt(ex.setCount, 10)) ? Math.min(10, Math.max(1, parseInt(ex.setCount, 10))) : 4);

      const isCardio = isCardioExercise(ex.name);

      for (let setIndex = 0; setIndex < setCount; setIndex++) {
        const cell = document.createElement("div");
        cell.className = "set-cell";

        const label = document.createElement("div");
        label.className = "set-label";
        label.textContent = `Set ${setIndex + 1}:`;

        const fields = document.createElement("div");
        fields.className = "set-fields";

        // Load saved state
        const st = getWorkoutState();
        const saved = getSetState(st, currentWeek, dayIndex, exIndex, setIndex);

        if (isCardio) {
          const timePill = document.createElement("button");
          timePill.type = "button";
          timePill.className = "input-pill input-pill--small set-time-pill";

          const inclinePill = document.createElement("button");
          inclinePill.type = "button";
          inclinePill.className = "input-pill input-pill--small set-incline-pill";

          const intensityPill = document.createElement("button");
          intensityPill.type = "button";
          intensityPill.className = "input-pill input-pill--small set-intensity-pill";

          timePill.dataset.value = saved.t || "";
          inclinePill.dataset.value = saved.inc || "";
          intensityPill.dataset.value = saved.inten || "";

          timePill.textContent = saved.t ? `${saved.t} min` : "time";
          inclinePill.textContent = saved.inc ? `incline ${saved.inc}` : "incline";
          intensityPill.textContent = saved.inten ? `${saved.inten}` : "intensity";

          timePill.classList.toggle("input-pill--suggested", !saved.t);
          inclinePill.classList.toggle("input-pill--suggested", !saved.inc);
          intensityPill.classList.toggle("input-pill--suggested", !saved.inten);

          const context = { week: currentWeek, dayIndex, exIndex, setIndex };
          const open = () => openCardioEditor(ex.name, timePill, inclinePill, intensityPill, context);
          timePill.addEventListener("click", open);
          inclinePill.addEventListener("click", open);
          intensityPill.addEventListener("click", open);

          fields.appendChild(timePill);
          fields.appendChild(inclinePill);
          fields.appendChild(intensityPill);
        } else {
          const weightPill = document.createElement("button");
          weightPill.type = "button";
          weightPill.className = "input-pill input-pill--small set-weight-pill";

          const repsPill = document.createElement("button");
          repsPill.type = "button";
          repsPill.className = "input-pill input-pill--small set-reps-pill";

          const suggestionW = progressedSuggestion(setIndex) || (isCoreOrBW(ex.name) ? "00" : "");
          const suggestionR = String(targetReps);

          weightPill.dataset.suggestion = suggestionW;
          repsPill.dataset.suggestion = suggestionR;

          weightPill.dataset.value = saved.w || "";
          repsPill.dataset.value = saved.r || "";

          // Render weight pill (NO parentheses)
          if (saved.w !== "") {
            weightPill.textContent = formatWeightPill(saved.w, exState?.equipment || defaultEquip);
            weightPill.classList.remove("input-pill--suggested");
          } else if (suggestionW !== "") {
            weightPill.textContent = formatWeightPill(suggestionW, exState?.equipment || defaultEquip);
            weightPill.classList.add("input-pill--suggested");
          } else {
            weightPill.textContent = getWeightUnitLabel(getActiveUnits());
            weightPill.classList.remove("input-pill--suggested");
          }

          // Render reps pill
          if (saved.r !== "") {
            repsPill.textContent = `${saved.r} reps`;
            repsPill.classList.remove("input-pill--suggested");
          } else if (suggestionR) {
            repsPill.textContent = `${suggestionR} reps`;
            repsPill.classList.add("input-pill--suggested");
          } else {
            repsPill.textContent = "reps";
            repsPill.classList.remove("input-pill--suggested");
          }

	          // Build context at click-time so equipment changes do not desync the editor.
	          const getEquipNow = () => {
	            try {
	              const stNow = getWorkoutState();
	              const exStNow = getExerciseState(stNow, currentWeek, dayIndex, exIndex);
	              return exStNow?.equipment || defaultEquip;
	            } catch (_) {
	              return defaultEquip;
	            }
	          };

	          weightPill.addEventListener("click", () => openSetEditor(ex.name, weightPill, repsPill, {
	            week: currentWeek,
	            dayIndex,
	            exIndex,
	            setIndex,
	            equipmentCode: getEquipNow()
	          }));
	          repsPill.addEventListener("click", () => openSetEditor(ex.name, weightPill, repsPill, {
	            week: currentWeek,
	            dayIndex,
	            exIndex,
	            setIndex,
	            equipmentCode: getEquipNow()
	          }));

          fields.appendChild(weightPill);
          fields.appendChild(repsPill);
        }

        cell.appendChild(label);
        cell.appendChild(fields);
        setsGrid.appendChild(cell);
      }

      card.appendChild(setsGrid);

      // UI-only: visually distinguish completed exercises (all sets logged).
      try {
        updateExerciseCardCompletion(card, state, currentWeek, dayIndex, exIndex, setCount, isCardio);
      } catch (_) {}

      workoutExerciseList.appendChild(card);
    });

    // Sklar only: minimal '+' button at the bottom to add an extra exercise for tracking.
    if (isSklarProgramme) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "add-exercise-btn";
      addBtn.textContent = "+ add exercise";
      addBtn.setAttribute("aria-label", "Add exercise");

      // Keep it non-invasive: no adding if the day is currently marked as completed.
      addBtn.addEventListener("click", () => {
        if (isCurrentDayCompleted()) {
          alert("This workout is marked as completed. Tap 'Edit Completed Workout' to make changes.");
          return;
        }

        const st = getWorkoutState();
        const ds = ensureDayState(st, currentWeek, currentDayIndex);
        if (!Array.isArray(ds.extraExercises)) ds.extraExercises = [];

        const newEx = {
          name: "New Exercise",
          prescription: "4 x 8",
          notes: "",
          __isExtra: true,
          __extraId: `extra_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          __pendingExtra: true
        };
        ds.extraExercises.push(newEx);
        saveWorkoutState(st);

        // Re-render then jump straight into the existing Exercise Edit overlay for quick selection.
        renderWorkoutDay(currentDayIndex);
        setTimeout(() => {
          try {
            const titles = document.querySelectorAll(".exercise-card .exercise-title");
            const titleEl = titles[titles.length - 1];
            if (titleEl) openExerciseEdit(day, newEx, titleEl, (day.exercises || []).length + ds.extraExercises.length - 1);
          } catch (_) {}
        }, 0);
      });

      workoutExerciseList.appendChild(addBtn);
    }

    updateWorkoutSummary(day);
    syncWorkoutCompletionUI();
  }

  window.renderWorkoutDay = renderWorkoutDay;

  
// Workout header action (top-right button): Reset current day (with confirmation)
const workoutHeaderActionBtn = document.querySelector(".workout-day-header .workout-reset-day");
if (workoutHeaderActionBtn) {
  workoutHeaderActionBtn.textContent = "Reset Day";
  workoutHeaderActionBtn.addEventListener("click", () => {
      const dayNumber = getDisplayDayNumber(currentDayIndex);
      if (confirm(`Reset Week ${currentWeek}, Day ${dayNumber}? This will clear all logged sets for this day.`)) {
          resetDay(currentWeek, currentDayIndex);
          renderWorkoutDay(currentDayIndex);
      }
    });
}

// Quick route to edit the active custom programme (adds exercises/days)
const workoutEditProgramBtn = document.getElementById("workout-edit-program");
if (workoutEditProgramBtn) {
  workoutEditProgramBtn.addEventListener("click", () => {
    const active = getActiveSeriesName();
    if (active === DEFAULT_SERIES_NAME) return;
    const program = loadCustomProgramForSeries(active);
    if (!program) {
      alert("Could not load this programme for editing.");
      return;
    }
    // Load into the draft store so the builder can render/edit.
    writeCustomProgramDraft({ name: program.name, days: program.days, updatedAt: Date.now() });
    // Keep the builder aligned to the current day where possible.
    showScreen("screen-custom-builder");

    const daySel = document.getElementById("custom-day-select");
    if (daySel) {
      const d = Math.min(7, Math.max(1, currentDayIndex + 1));
      daySel.value = String(d);
    }

    syncProgramDraftUI();
    renderCustomBuilderForCurrentDay();
  });
}

workoutDaySelect?.addEventListener("change", () => {
    const idx = parseInt(workoutDaySelect.value, 10);
    if (!Number.isNaN(idx)) renderWorkoutDay(idx);
  });

  // 1RM inputs
  const oneRmCards = document.querySelectorAll(".one-rm-card");
  oneRmCards.forEach((card) => {
    const w = card.querySelector(".one-rm-weight");
    const r = card.querySelector(".one-rm-reps");
    const out = card.querySelector(".one-rm-result-value");
    function update() {
      const units = getActiveUnits();
      const wNum = parseFloat(w.value);
      const rNum = parseFloat(r.value);
      if (!Number.isFinite(wNum) || wNum <= 0 || !Number.isFinite(rNum) || rNum <= 0) { out.textContent = "—"; return; }
      const weightKg = (units === "imperial") ? lbToKg(wNum) : wNum;
      const estKg = estimateOneRM(weightKg, rNum);
      if (!estKg) { out.textContent = "—"; return; }
      const estDisplay = (units === "imperial") ? kgToLb(estKg) : estKg;
      out.textContent = `${estDisplay.toFixed(1)} ${getWeightUnitLabel(units)}`;
    }
    w?.addEventListener("input", update);
    r?.addEventListener("input", update);
  });

  
  // 1RM equipment selector (persisted locally)
  const oneRMEquipMap = readJSON(STORAGE_KEYS.oneRMEquip, {});
  oneRmCards.forEach((card) => {
    const key = card.dataset.exercise;
    const row = card.querySelector(".one-rm-equip");
    if (!row) return;

    // Apply saved selection if present
    const saved = oneRMEquipMap[key];
    if (saved) {
      row.querySelectorAll(".equipment-pill").forEach((b) => b.classList.remove("equipment-pill--active"));
      const btn = row.querySelector(`.equipment-pill[data-equip="${saved}"]`);
      if (btn) btn.classList.add("equipment-pill--active");
    }

    row.addEventListener("click", (e) => {
      const btn = e.target.closest(".equipment-pill");
      if (!btn) return;
      const code = btn.getAttribute("data-equip");
      if (!code) return;

      row.querySelectorAll(".equipment-pill").forEach((b) => b.classList.remove("equipment-pill--active"));
      btn.classList.add("equipment-pill--active");

      oneRMEquipMap[key] = code;
      writeJSON(STORAGE_KEYS.oneRMEquip, oneRMEquipMap);
    });
  });

// Save 1RMs
  document.getElementById("btn-1rm-save")?.addEventListener("click", () => {
    const data = {};
    let hasAny = false;

    oneRmCards.forEach((card) => {
      const key = card.dataset.exercise;
      const out = card.querySelector(".one-rm-result-value");
      const units = getActiveUnits();
      const val = out && out.textContent !== "—" ? parseFloat(String(out.textContent).replace(/[^0-9.\-]/g, "")) : null;
      const valKg = (val !== null && Number.isFinite(val)) ? ((units === "imperial") ? lbToKg(val) : val) : null;
      data[key] = (valKg !== null && Number.isFinite(valKg)) ? valKg : null;
      if (data[key] !== null) hasAny = true;
    });

    writeJSON(STORAGE_KEYS.oneRM, data);

    if (!hasAny) {
      alert("Please enter at least one lift to save your 1 Rep Max values.");
      return;
    }

    // Notify the app so any derived suggestions can refresh without wiping logged data.
    // This keeps existing history untouched while recalculating future (and current unlogged) suggestions.
    try { document.dispatchEvent(new CustomEvent("trackmate:oneRMUpdated")); } catch (_) {}
    enterWorkoutFromEntryPoint();
  });

  // Complete workout (toggle)
  // - If not completed: marks completed and applies grey overlay + "Completed" pill + button label change
  // - If already completed: unlocks editing for that day (sets completed=false)


  document.querySelector(".workout-complete")?.addEventListener("click", () => {
    const state = getWorkoutState();
    const dayState = ensureDayState(state, currentWeek, currentDayIndex);

    const dayNumber = getDisplayDayNumber(currentDayIndex);

    if (!dayState.completed) {
      dayState.completed = true;
      dayState.completedAt = Date.now();
      // Workout duration (start on first reps/weight input; end on completion)
      if (!dayState.startedAt) dayState.startedAt = dayState.completedAt;
      dayState.endedAt = dayState.completedAt;
      dayState.durationSec = Math.max(0, Math.floor((dayState.endedAt - dayState.startedAt) / 1000));

      // Custom programme safety: snapshot the week template the moment a day is marked complete.
      // This prevents later edits or programme definition changes from mutating completed workouts.
      try {
        const series = getActiveSeriesName();
        if (series !== DEFAULT_SERIES_NAME) {
          if (!state.customWeekOverrides || typeof state.customWeekOverrides !== "object") state.customWeekOverrides = {};
          const wKey = String(currentWeek);
          if (!Array.isArray(state.customWeekOverrides[wKey])) {
            state.customWeekOverrides[wKey] = deepClone(getProgramWeekTemplateForSeries(series));
          }
        }
      } catch (_) {}
      saveWorkoutState(state);
      // Write a dedicated history entry (supports Reuse without losing Past Workouts)
      appendHistoryLog({
        series: getActiveSeriesName(),
        week: currentWeek,
        dayIndex: currentDayIndex,
        completedAt: dayState.completedAt,
        durationSec: dayState.durationSec
      });
      const durTxt = dayState.durationSec !== null ? formatDurationFromSeconds(dayState.durationSec) : "";
      alert(`Saved. Week ${currentWeek}, Day ${dayNumber} marked complete.${durTxt ? " Time: " + durTxt : ""}`);
    } else {
      dayState.completed = false;
      dayState.completedAt = null;
      dayState.endedAt = null;
      dayState.durationSec = null;
      saveWorkoutState(state);
      // Remove any saved history entry for this day (prevents duplicates when re-completing).
      removeHistoryLogEntry(getActiveSeriesName(), currentWeek, currentDayIndex);
      alert(`Editing enabled. Week ${currentWeek}, Day ${dayNumber} is now unlocked.`);
    }

    const day = getProgramForWeek(currentWeek)[currentDayIndex];
    updateWorkoutSummary(day);
    syncWorkoutCompletionUI();
  });

  // -------------------------
  // Hamburger menu
  // -------------------------
  const workoutMenu = document.getElementById("workout-menu");
  const menuButtons = document.querySelectorAll(".workout-menu-button");
  const menuClose = document.getElementById("workout-menu-close");
  const menuNav = workoutMenu?.querySelector(".workout-menu-nav");

  function openWorkoutMenu() {
    workoutMenu?.classList.add("workout-menu--open");
    document.body.classList.add("tm-menu-open");
  }
  function closeWorkoutMenu() {
    workoutMenu?.classList.remove("workout-menu--open");
    document.body.classList.remove("tm-menu-open");
  }
  window.closeWorkoutMenu = closeWorkoutMenu;

  // Always start with the menu closed (also handles bfcache restores)
  closeWorkoutMenu();
  window.addEventListener("pageshow", () => closeWorkoutMenu());

  menuButtons.forEach((b) => b.addEventListener("click", openWorkoutMenu));
  menuClose?.addEventListener("click", closeWorkoutMenu);
  workoutMenu?.addEventListener("click", (e) => { if (e.target === workoutMenu) closeWorkoutMenu(); });

  // Ensure Settings is at bottom (if present). We do this by re-ordering nodes once.
  function moveSettingsToBottom() {
    if (!menuNav) return;
    const buttons = Array.from(menuNav.querySelectorAll(".workout-menu-link"));
    const settingsBtn = buttons.find((btn) => (btn.dataset.menuAction || "") === "settings");
    if (!settingsBtn) return;

    // Add divider if not present
    if (!menuNav.querySelector(".workout-menu-divider")) {
      const divider = document.createElement("div");
      divider.className = "workout-menu-divider";
      menuNav.appendChild(divider);
    } else {
      // Move existing divider to just before settings
      const divider = menuNav.querySelector(".workout-menu-divider");
      menuNav.appendChild(divider);
    }

    menuNav.appendChild(settingsBtn);
  }

  // Menu actions
  menuNav?.addEventListener("click", (e) => {
    const btn = e.target.closest(".workout-menu-link");
    if (!btn) return;
    const action = btn.dataset.menuAction;
    if (!action) return;

    if (action === "back-to-workout") {
      closeWorkoutMenu();
      showScreen("screen-workout");
    } else if (action === "profile") {
      closeWorkoutMenu();
      showScreen("screen-profile");
      loadProfileIntoForm();
    } else if (action === "programs") {
      closeWorkoutMenu();
      showScreen("screen-programs");
    } else if (action === "settings") {
      closeWorkoutMenu();
      showScreen("screen-settings");
    } else if (action === "equipment-key") {
      closeWorkoutMenu();
      showScreen("screen-equipment-key");
    } else if (action === "history") {
      closeWorkoutMenu();
      openHistoryLanding();
    } else if (action === "home") {
      closeWorkoutMenu();
      showScreen("screen-welcome");
    }
  });

  moveSettingsToBottom();

  // Continue behaviour selector (Settings)
  const continueModeSelect = document.getElementById("settings-continue-mode");
  if (continueModeSelect) {
    continueModeSelect.value = getContinueMode();
    continueModeSelect.addEventListener("change", () => {
      setContinueMode(continueModeSelect.value);
    });
  }

  // Settings screen actions
  document.querySelectorAll("[data-settings-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-settings-action");
      if (action === "edit-profile") {
        showScreen("screen-profile");
        loadProfileIntoForm();
      } else if (action === "edit-program") {
        const active = getActiveSeriesName();
        if (active !== DEFAULT_SERIES_NAME) {
          const program = loadCustomProgramForSeries(active);
          if (program) {
            writeCustomProgramDraft({ name: program.name, days: program.days, updatedAt: Date.now() });
            syncProgramDraftUI();
            const daySel = document.getElementById("custom-day-select");
            if (daySel) daySel.value = String(Math.min(7, Math.max(1, currentDayIndex + 1)));
            showScreen("screen-custom-builder");
            renderCustomBuilderForCurrentDay();
            return;
          }
        }
        showScreen("screen-programs");
      } else if (action === "reset-all") {
        if (confirm("Reset all TrackMate data? This cannot be undone.")) {
          Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
          window.location.reload();
        }
      } else if (action === "units") {
        // Route to profile units for now
        showScreen("screen-profile");
        loadProfileIntoForm();
      }
    });
  });

  // Initial render
  renderWorkoutDay(0);
});