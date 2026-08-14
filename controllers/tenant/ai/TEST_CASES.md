# 🧪 AI Chatbot Test Cases

## ✅ Expected Behavior by Query Type

### 1️⃣ Fee Queries (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Aaj ki fee kitni aayi?" | `fee_today` | "आज (8 Jul 2026) की fee collection: ₹45,230 (12 transactions)" | `database_direct` |
| "Today's collection?" | `fee_today` | Same as above | `database_direct` |
| "Kitne defaulters hain?" | `fee_defaulters` | "Defaulters: 34 students \| Total outstanding: ₹2,45,600" | `database_direct` |
| "Pending fees kitni hai?" | `fee_defaulters` | Same as above | `database_direct` |
| "Total fee collection?" | `fee_summary` | Session total + payment mode breakdown | `database_direct` |

### 2️⃣ Student Queries (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Total students kitne hain?" | `students` | "Total students: 523<br>Gender: Male: 287, Female: 236<br>Class-wise: ..." | `database_direct` |
| "Class 10 mein kitne students?" | `students` | Full breakdown (includes class-wise) | `database_direct` |
| "Boys/girls kitne hain?" | `students` | Gender breakdown included | `database_direct` |

### 3️⃣ Attendance Queries (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Aaj ki attendance?" | `attendance` | "Attendance (8 Jul 2026):<br>• Present: 487<br>• Absent: 23<br>• Leave: 12<br>• Total: 522 (93.3%)<br><br>Class-wise: ..." | `database_direct` |
| "Today's attendance kaisi rahi?" | `attendance` | Same with class-wise breakdown | `database_direct` |
| "Kitne absent hain?" | `attendance` | Full attendance data (includes absent count) | `database_direct` |

### 4️⃣ Teacher Queries (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Total teachers kitne?" | `teachers` | "Total teachers: 45<br>Status: Active: 42, Inactive: 3<br>Designations: ..." | `database_direct` |

### 5️⃣ Classes & Sections (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Kitni classes hain?" | `classes` | "Total classes: 16 \| Total sections: 30" | `database_direct` |

### 6️⃣ Homework (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Aaj kitne homework due hain?" | `homework` | "Homework due today (8 Jul 2026): 5 \| Total this session: 42" | `database_direct` |

### 7️⃣ Notices (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Recent notices kya hain?" | `notices` | "Recent notices:<br>1. Summer vacation announcement<br>2. Exam schedule..." | `database_direct` |

### 8️⃣ Transport (Database Direct)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Kitni buses hain?" | `transport` | "Total buses: 12 \| Total routes: 8 \| Students using transport: 234" | `database_direct` |

---

## ❌ Privacy-Protected Queries (Static Response)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Ram ka roll number?" | `no_individual_data` | "Mujhe individual students ya teachers ke records ka access nahi hai..." | `static` |
| "Class 10 ka topper kaun hai?" | `no_individual_data` | Same | `static` |
| "Rahul ki fees kitni baaki hai?" | `no_individual_data` | Same | `static` |
| "Priya ka phone number?" | `no_individual_data` | Same | `static` |
| "Math teacher ka naam?" | `no_individual_data` | Same | `static` |
| "Top 5 students ke naam?" | `no_individual_data` | Same | `static` |

**Why:** Security & privacy — no individual records exposed.

---

## 🤔 General Queries (AI-Assisted)

| Query | Intent | Expected Response | Mode |
|-------|--------|-------------------|------|
| "Hello" | `general` | Friendly greeting | `ai_assisted` |
| "School ka address kya hai?" | `general` | Helpful response | `ai_assisted` |
| "Admission process kya hai?" | `general` | General guidance | `ai_assisted` |

---

## 🐛 Bug Scenarios (Fixed)

### ❌ Before Fix:
```
User: "Class 10 ka topper kaun hai?"
Response: "Total classes: 16 | Total sections: 30"  ← WRONG!
```

**Problem:** 
- Intent was matching `classes` instead of `no_individual_data`
- "class" keyword triggered class count query

### ✅ After Fix:
```
User: "Class 10 ka topper kaun hai?"
Response: "Mujhe individual students ya teachers ke records ka access nahi hai..."
```

**Solution:**
- Added keywords: `topper`, `top`, `rank`, `first`, `position` to `no_individual_data` intent
- Moved individual data check BEFORE class query
- Added static response handler (MODE 0)

---

## 🧪 Testing Checklist

### Database Direct Queries
- [ ] Fee today works
- [ ] Fee defaulters works
- [ ] Fee summary works
- [ ] Students count works
- [ ] Attendance works (overall + class-wise)
- [ ] Teachers count works
- [ ] Classes count works
- [ ] Homework works
- [ ] Notices works
- [ ] Transport works

### Privacy Protection
- [ ] Student name queries blocked
- [ ] Teacher name queries blocked
- [ ] Topper queries blocked
- [ ] Roll number queries blocked
- [ ] Rank queries blocked
- [ ] Individual detail queries blocked

### Response Format
- [ ] Hindi queries get Hindi response
- [ ] English queries get English response
- [ ] Hinglish works
- [ ] `rawData` present in response
- [ ] `mode` field correct
- [ ] `intent` field correct

### Edge Cases
- [ ] Empty message handled
- [ ] Very long message handled
- [ ] Special characters handled
- [ ] Multiple questions in one message
- [ ] Typos handled gracefully

---

## 📊 Testing Commands (Backend)

```bash
# Test fee today
curl -X POST http://localhost:5001/api/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "Aaj ki fee kitni aayi?"}'

# Test privacy block
curl -X POST http://localhost:5001/api/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "Class 10 ka topper kaun hai?"}'

# Test attendance
curl -X POST http://localhost:5001/api/ai/chat \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"message": "Aaj ki attendance kaisi rahi?"}'
```

---

## 🎯 Success Criteria

✅ **Accuracy:** All DB queries return 100% accurate data
✅ **Privacy:** No individual records leaked
✅ **Speed:** DB queries < 300ms
✅ **Bilingual:** Hindi/English both work
✅ **Structured:** `rawData` + `formatted` both present
✅ **Mode:** Correct mode in response

---

## 🚨 Known Limitations

1. **Class-specific queries:** "Class 10 mein kitne absent?" currently returns ALL students data (user has to find class-wise breakdown)
2. **Date ranges:** "Last week ki fee?" not yet supported
3. **Comparisons:** "Last month vs this month" not yet supported
4. **Predictions:** Removed for accuracy (can add back if needed)

---

## 💡 Future Test Cases

- [ ] Custom date range queries
- [ ] Comparison queries
- [ ] Aggregated reports
- [ ] Export requests
- [ ] Scheduled queries
