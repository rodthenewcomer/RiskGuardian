const fs = require('fs');
let code = fs.readFileSync('src/components/pages/AIChatPage.tsx', 'utf8');

// 1. Remove processNaturalLanguage logic and assets map (lines 35-589)
const splitLine1 = "// ─────────────────────────────────────────────────────────────────\n// Asset resolution — verbal aliases + symbol detection";
const splitLine2 = "// ─────────────────────────────────────────────────────────────────\n// Suggestion chips";
if (code.includes(splitLine1) && code.includes(splitLine2)) {
    code = code.substring(0, code.indexOf(splitLine1)) + code.substring(code.indexOf(splitLine2));
}

// 2. Add imports
code = code.replace(
    "import {\n    calcSmartPositionSize, calcProfitTarget, analyzeRiskGuardian,\n    analyzeBehavior, optimizeTakeProfit, generateDailyReport,\n    analyzeConsistency, analyzeStrategy,\n} from '@/ai/RiskAI';",
    "import {\n    analyzeRiskGuardian, analyzeBehavior,\n    ChatCard, processNaturalLanguage\n} from '@/ai/RiskAI';"
);
code = code.replace(
    "import { useAppStore, getTradingDay, getFuturesSpec, FUTURES_SPECS } from '@/store/appStore';",
    "import { useAppStore, getTradingDay } from '@/store/appStore';"
);

// 3. Remove isMobile uses
code = code.replace("const [isMobile, setIsMobile] = useState(false);", "");
code = code.replace(/useEffect\(\(\) => \{\n\s+const check = \(\) => setIsMobile\(window\.innerWidth < 640\);\n\s+check\(\);\n\s+window\.addEventListener\('resize', check\);\n\s+return \(\) => window\.removeEventListener\('resize', check\);\n\s+\}, \[\]\);/g, "");

// Replace inline styled padding with classes
code = code.replace(/padding: isMobile \? '10px 14px' : '13px 20px',/g, "");
code = code.replace(/padding: isMobile \? '10px 14px' : '12px 20px',/g, "");
code = code.replace(/padding: isMobile \? '11px 14px' : '12px 20px',/g, "");
code = code.replace(/padding: isMobile \? '10px 12px' : '11px 16px',/g, "");
code = code.replace(/padding: isMobile \? '10px 12px' : '11px 14px',/g, "");
code = code.replace(/padding: isMobile \? '7px 14px' : '8px 20px',/g, "");

code = code.replace("style={{", "className={styles.header} style={{");
code = code.replace(/gridTemplateColumns: isMobile[^,]+,/g, "");
code = code.replace("style={{ display: 'grid',", "className={styles.contextStrip} style={{ display: 'grid',");

// Context Card Strip loop div
code = code.replace(/borderRight: isMobile[^,]+,/g, "");
code = code.replace(/borderBottom: isMobile[^,]+,/g, "");
// We'll trust the structural CSS to apply

// font sizes
code = code.replace(/fontSize: isMobile \? 15 : 17/g, "/* fontSize deferred to CSS */");
code = code.replace(/maxWidth: isUser \? \(isMobile \? '85%' : '72%'\) : '100%'/g, "maxWidth: isUser ? undefined : '100%'");

// Rename AI COACH 
code = code.replace("AI COACH", "ALGORITHMIC RISK COPILOT");

// Suggestions click handler to populate
code = code.replace(
    /onClick=\{\(\) => handleSend\(s.text\)\}/g,
    "onClick={() => setInput(s.text)}"
);

fs.writeFileSync('src/components/pages/AIChatPage.tsx', code);
