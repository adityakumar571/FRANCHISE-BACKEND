# 🤖 SchoolCloudX AI Chatbot — HYBRID MODE

**Database-first accuracy + AI natural language understanding**

## 🎯 Architecture Philosophy

```
User Question → AI classifies intent → Direct DB query → Formatted response
                                    ↓
                              (NO AI guessing on numbers)
```

**Like Punch Software:** AI understands the question, database provides exact answer.

## 📁 File Structure

```
ai/
├── aiChatController.js      → Main entry (routes to DB or AI)
├── aiIntentClassifier.js    → Detect user intent from message
├── aiQueryExecutor.js       → ⭐ Direct DB queries (100% accurate)
├── aiSchoolDataFetcher.js   → Fetch comprehensive data (legacy)
├── aiPromptBuilder.js       → Build AI prompts (legacy)
├── aiMistralService.js      → Call Mistral API
└── README.md                → This file
```

## ⚡ Two Operating Modes

### 1️⃣ **Database Direct Mode** (Primary — 100% Accurate)

For specific data queries, **zero AI interpretation**:

**User asks:** "Aaj ki fee collection kitni hai?"

**System response:**
```
Mode: database_direct
Reply: "आज (8 Jul 2026) की fee collection: ₹45,230 (12 transactions)"
RawData: {
  type: "fee_today",
  totalCollection: 45230,
  totalTransactions: 12,
  date: "8 Jul 2026"
}
```

**Supported Intents (Direct DB):**
- `fee_today` — Today's fee collection
- `fee_defaulters` — Students with pending fees
- `fee_summary` — Total session fees + payment modes
- `students` — Total students, gender, class breakdown
- `attendance` — Today's attendance (school-wide + class-wise)
- `teachers` — Total, status, designation breakdown
- `classes` — Classes and sections count
- `homework` — Homework due today
- `notices` — Recent 5 notices
- `transport` — Buses, routes, students using transport

### 2️⃣ **AI-Assisted Mode** (Fallback)

For general queries where no specific DB query exists:

**User asks:** "School ki website kya hai?"

**System response:**
```
Mode: ai_assisted
Reply: "School ki detailed information ke liye admin panel check karein ya support team se contact karein."
```

## 🔥 Key Features

### ✅ Accuracy First
- Numbers come **directly from MongoDB**
- No AI hallucination on statistics
- Structured data + human-readable format both returned

### ✅ Real-time IST Data
- All "today" queries use **Indian Standard Time**
- Handles timezone correctly (server can be anywhere)

### ✅ Bilingual Support
- Automatically detects user language
- Responds in Hindi/English/Hinglish

### ✅ Raw Data Access
- Frontend gets both `reply` (formatted) and `rawData` (structured)
- Can build charts/graphs from `rawData`

## 📊 Example Queries & Responses

### Query 1: Fee Collection Today
```javascript
POST /api/ai/chat
{
  "message": "Aaj kitni fee aayi?"
}

// Response
{
  "reply": "आज (8 Jul 2026) की fee collection: ₹1,23,450 (28 transactions)",
  "mode": "database_direct",
  "intent": "fee_today",
  "rawData": {
    "type": "fee_today",
    "date": "8 Jul 2026",
    "totalCollection": 123450,
    "totalTransactions": 28
  }
}
```

### Query 2: Attendance
```javascript
POST /api/ai/chat
{
  "message": "Today's attendance kaisi rahi?"
}

// Response
{
  "reply": "Attendance (8 Jul 2026):
• Present: 487
• Absent: 23
• Leave: 12
• Total: 522 (93.3% attendance)

Class-wise:
• Class 10A: 42/45 present (93%), 2 absent, 1 leave
• Class 9B: 38/40 present (95%), 2 absent, 0 leave
...",
  "mode": "database_direct",
  "rawData": {
    "present": 487,
    "absent": 23,
    "byClass": [...]
  }
}
```

### Query 3: Defaulters
```javascript
POST /api/ai/chat
{
  "message": "Kitne defaulters hain?"
}

// Response
{
  "reply": "Defaulters: 34 students | Total outstanding: ₹2,45,600",
  "mode": "database_direct",
  "rawData": {
    "defaulterCount": 34,
    "totalOutstanding": 245600
  }
}
```

## 🚀 How to Add New Queries

### Step 1: Add Intent (aiIntentClassifier.js)
```javascript
if (has("exam", "marks", "result")) return "exam_results";
```

### Step 2: Add Query Function (aiQueryExecutor.js)
```javascript
export async function queryExamResults(db) {
  const Exam = getExamModel(db);
  const results = await Exam.find({...}).lean();
  
  return {
    type: "exam_results",
    totalExams: results.length,
    formatted: `Total exams: ${results.length}`
  };
}
```

### Step 3: Add to Switch Case (aiQueryExecutor.js)
```javascript
case "exam_results": return await queryExamResults(db);
```

### Step 4: Add to Supported List (aiChatController.js)
```javascript
const DIRECT_QUERY_INTENTS = [
  "fee_today", "attendance", "exam_results"  // ← Add here
];
```

Done! Now chatbot will respond with exact DB data for this intent.

## 🔐 Security & Privacy

- ❌ **Never returns individual names** (students/teachers)
- ✅ **Only aggregated statistics**
- ✅ **Session-specific data** (tenant isolation)
- ✅ **JWT authentication required**

## ⚠️ Important Notes

1. **Mode in Response** — Frontend should check `mode`:
   - `database_direct` → Trust numbers 100%
   - `ai_assisted` → General help, no data claims

2. **rawData Available** — Use for:
   - Building charts
   - Export to Excel
   - Custom formatting in frontend

3. **IST Timezone** — All dates are Indian Standard Time

4. **No Predictions** — This version returns **facts only**
   - For predictions, use legacy mode or add ML module

## 📈 Performance

- **Direct DB queries:** ~50-200ms (depends on data size)
- **AI-assisted:** ~1-3s (Mistral API call)
- **Parallel aggregations:** Used where possible

## 🔧 Environment Variables

```bash
MISTRAL_API_KEY=your_key_here    # Required for AI-assisted mode
NODE_ENV=production              # Controls error verbosity
```

## 🎯 Comparison with Legacy Mode

| Feature | Hybrid Mode (New) | Legacy Mode (Old) |
|---------|-------------------|-------------------|
| Accuracy | 100% (direct DB) | ~95% (AI can misinterpret) |
| Speed | Fast (50-200ms) | Slower (1-3s) |
| Raw Data | ✅ Yes | ❌ No |
| Predictions | ❌ No | ✅ Yes (basic) |
| Complexity | Simple queries | Complex analysis |

## 🚦 When to Use Each Mode

**Use Hybrid (Direct DB):** ✅
- Fee collection queries
- Attendance reports
- Student counts
- Teacher statistics
- Any factual data request

**Use Legacy (AI Full):** 
- Predictions ("next month kitni fee?")
- Complex comparisons
- Trend analysis
- Natural conversations

---

**Bottom Line:** AI understands the question, database answers with facts. Best of both worlds! 🎯
