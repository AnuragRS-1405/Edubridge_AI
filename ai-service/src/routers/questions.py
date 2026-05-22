import asyncio
import json
import os
import random
import re
import string
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

ANSWER_KEYS = {"A", "B", "C", "D"}
DIFFICULTIES = ["beginner", "intermediate", "expert"]
PLACEHOLDER_PATTERNS = [
    r"common misconception",
    r"partially correct",
    r"best fits the engineering principle",
    r"unrelated implementation detail",
    r"correct answer related",
    r"plausible but incorrect",
    r"option that best",
    r"placeholder",
    r"what is the role of",
    r"option [a-d]",
    r"answer [a-d]",
    r"incorrect answer",
    r"none of the above",
    r"all of the above",
]

MODEL_CACHE: Dict[str, Any] = {"checked_at": 0.0, "models": []}


class GenerateQuestionsRequest(BaseModel):
    domain: str
    skills: List[str] = []
    difficulty: Optional[str] = None
    previous_context: Optional[List[Dict[str, Any]]] = None


def clean_skill(skill: str) -> str:
    return re.sub(r"\s+", " ", skill.replace("_", " ").strip()) or "General Software Engineering"


def normalize_skill(skill: str) -> str:
    normalized = clean_skill(skill).lower().replace("&", " and ").replace("/", " ")
    normalized = re.sub(r"[^a-z0-9+#.]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()

    aliases = {
        "html css": "html/css",
        "html and css": "html/css",
        "cloud platforms": "cloud",
        "cloud devops": "cloud",
        "machine learning": "machine learning",
        "ml": "machine learning",
        "node": "node.js",
        "nodejs": "node.js",
        "node js": "node.js",
        "js": "javascript",
        "ts": "typescript",
    }
    return aliases.get(normalized, normalized)


def _strip_markdown_fences(content: str) -> str:
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*", "", content, flags=re.IGNORECASE)
    content = re.sub(r"\s*```$", "", content)
    return content.strip()


def _balanced_json_candidates(content: str) -> List[str]:
    candidates: List[str] = []
    stack: List[str] = []
    start: Optional[int] = None
    in_string = False
    escape = False

    for index, char in enumerate(content):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue

        if char in "[{":
            if not stack:
                start = index
            stack.append("]" if char == "[" else "}")
        elif char in "]}":
            if stack and stack[-1] == char:
                stack.pop()
                if not stack and start is not None:
                    candidates.append(content[start:index + 1])
                    start = None
            else:
                stack = []
                start = None

    return candidates


def _repair_json_candidate(candidate: str) -> str:
    candidate = _strip_markdown_fences(candidate)
    candidate = candidate.replace("\ufeff", "")
    candidate = candidate.replace("“", '"').replace("”", '"').replace("’", "'")
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
    return candidate


def _coerce_question_array(parsed: Any) -> List[dict]:
    if isinstance(parsed, dict):
        if isinstance(parsed.get("questions"), list):
            parsed = parsed["questions"]
        elif isinstance(parsed.get("items"), list):
            parsed = parsed["items"]
    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    raise ValueError("Model response was not a JSON array")


def parse_json_array(content: str) -> List[dict]:
    content = _strip_markdown_fences(content)
    candidates = [content, *_balanced_json_candidates(content)]
    errors: List[str] = []

    for candidate in dict.fromkeys(candidates):
        repaired = _repair_json_candidate(candidate)
        if not repaired:
            continue
        try:
            parsed = json.loads(repaired)
            questions = _coerce_question_array(parsed)
            print(f"[questions] JSON parsed count={len(questions)}")
            return questions
        except Exception as exc:
            errors.append(str(exc))

    print(f"[questions] JSON parse failed errors={errors[:3]} raw_preview={content[:500]!r}")
    raise ValueError("Model response did not contain a valid JSON question array")


def has_placeholder_text(value: str) -> bool:
    lower = value.lower()
    return any(re.search(pattern, lower) for pattern in PLACEHOLDER_PATTERNS)


def skill_relevance_score(text: str, skill: str) -> int:
    normalized_skill = normalize_skill(skill)
    if normalized_skill in {"general", "general software engineering"}:
        return 1

    aliases = {
        "html/css": ["html", "css"],
        "node.js": ["node", "node.js", "express"],
        "machine learning": ["machine learning", "model", "dataset", "feature", "training"],
        "cloud": ["cloud", "iam", "load balancer", "scaling", "region"],
    }
    terms = aliases.get(normalized_skill, [token for token in re.split(r"\s+", normalized_skill) if len(token) > 1])
    lower_text = text.lower()
    return sum(1 for term in terms if term and term in lower_text)


def validate_question(raw: Dict[str, Any], fallback_skill: str, difficulty: str) -> Optional[Dict[str, Any]]:
    question = str(raw.get("question", "")).strip()
    options = raw.get("options")
    correct_answer = str(raw.get("correct_answer") or raw.get("correctAnswer") or "").strip().upper()
    explanation = str(raw.get("explanation", "")).strip()
    skill = clean_skill(str(raw.get("skill") or fallback_skill))

    if not question or len(question) < 28 or has_placeholder_text(question):
        print(f"[questions] validation rejected question text skill={fallback_skill} preview={question[:140]!r}")
        return None
    if isinstance(options, list) and len(options) == 4:
        options = {key: re.sub(r"^[A-D][).]\s*", "", str(value).strip()) for key, value in zip(["A", "B", "C", "D"], options)}
    if not isinstance(options, dict) or set(options.keys()) != ANSWER_KEYS:
        print(f"[questions] validation rejected options shape skill={fallback_skill} options={options!r}")
        return None
    if correct_answer not in ANSWER_KEYS:
        print(f"[questions] validation rejected correct answer skill={fallback_skill} correct={correct_answer!r}")
        return None
    if not explanation or len(explanation) < 24 or has_placeholder_text(explanation):
        print(f"[questions] validation rejected explanation skill={fallback_skill} preview={explanation[:140]!r}")
        return None

    cleaned_options = {key: str(options[key]).strip() for key in ["A", "B", "C", "D"]}
    option_values = [value.lower() for value in cleaned_options.values()]
    if any(not value or len(value) < 2 or has_placeholder_text(value) for value in cleaned_options.values()):
        print(f"[questions] validation rejected placeholder/empty option skill={fallback_skill}")
        return None
    if len(set(option_values)) != 4:
        print(f"[questions] validation rejected duplicate options skill={fallback_skill} options={cleaned_options!r}")
        return None

    combined_text = f"{question} {' '.join(cleaned_options.values())} {explanation} {skill}".lower()
    if re.search(r"\b(role|purpose|use)\b", question.lower()) and len(question.split()) < 10:
        print(f"[questions] validation rejected vague question skill={fallback_skill} question={question[:140]!r}")
        return None
    if not re.search(r"\b(code|query|hook|state|index|api|request|schema|container|process|type|model|test|memory|render|function|component|class|pipeline|deployment|permission|thread|cache|join|route|error|latency|security|transaction|package|module|dataset|feature|kernel|shell|selector|endpoint|promise|async|docker|linux|cloud|sql|react|python|java|rust|typescript|javascript|css|html)\b", combined_text):
        print(f"[questions] validation rejected non-technical question skill={fallback_skill} question={question[:140]!r}")
        return None
    if skill_relevance_score(combined_text, fallback_skill) == 0:
        print(f"[questions] validation rejected skill mismatch expected={fallback_skill} model_skill={skill} question={question[:140]!r}")
        return None

    return {
        "question": question,
        "options": cleaned_options,
        "correct_answer": correct_answer,
        "correctAnswer": correct_answer,
        "explanation": explanation,
        "skill": clean_skill(fallback_skill),
        "difficulty": difficulty,
    }


def allocate_skills(skills: List[str], count: int, offset: int = 0) -> List[str]:
    usable_skills = [clean_skill(skill) for skill in skills] or ["General Software Engineering"]
    return [usable_skills[(offset + index) % len(usable_skills)] for index in range(count)]


def build_prompt(domain: str, target_skills: List[str], difficulty: str, previous_context: Optional[List[Dict[str, Any]]]) -> str:
    prior_questions = []
    for item in previous_context or []:
        question = str(item.get("question", "")).strip()
        if question:
            prior_questions.append(question[:180])

    skill_plan = [{"questionNumber": index + 1, "skill": skill} for index, skill in enumerate(target_skills)]

    return f"""
You are EduBridge-AI's senior technical assessment generator.
Generate exactly {len(target_skills)} realistic technical multiple-choice questions.

Assessment domain: {domain}
Difficulty: {difficulty}
Skill coverage plan: {json.dumps(skill_plan)}
Previous questions to avoid repeating: {json.dumps(prior_questions[:8])}

Difficulty contract:
- beginner: syntax, APIs, common primitives, basic behavior, simple code reading
- intermediate: debugging, implementation choices, framework behavior, data flow, query behavior, testing
- expert: architecture, scaling, security, performance, operations, reliability, system design

Hard rules:
- Return ONLY a valid JSON array. No markdown. No ```json fences. No notes before or after JSON.
- Follow the skill coverage plan exactly: one question per listed skill, in order.
- Ask concrete technical questions, not career-definition questions.
- Prefer code snippets, API behavior, query behavior, configuration, debugging, or architecture trade-offs.
- Each question must explicitly depend on its assigned skill and the difficulty.
- Each object must have exactly these keys: question, options, correctAnswer, explanation, skill, difficulty.
- options must be an object with exactly A, B, C, D.
- correctAnswer must be one of "A", "B", "C", or "D".
- Exactly one option must be correct.
- Distractors must be believable technical mistakes for the same skill, not generic filler.
- Never use placeholder phrases, "all of the above", "none of the above", or vague options.
- Explanations must mention the concrete technical reason.
- Keep each option under 18 words unless code is required.

Required JSON shape:
[
  {{
    "question": "In React, which hook stores local component state and schedules a re-render when its setter is called?",
    "options": {{"A": "useEffect", "B": "useState", "C": "useMemo", "D": "useCallback"}},
    "correctAnswer": "B",
    "explanation": "useState stores local state and React re-renders the component when the setter updates that state.",
    "skill": "React",
    "difficulty": "{difficulty}"
  }}
]
"""


async def get_available_ollama_models() -> List[str]:
    now = time.time()
    if MODEL_CACHE["models"] and now - float(MODEL_CACHE["checked_at"]) < 60:
        return list(MODEL_CACHE["models"])

    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(f"{ollama_url}/api/tags")
            response.raise_for_status()
        models = [
            item.get("name")
            for item in response.json().get("models", [])
            if isinstance(item, dict) and item.get("name")
        ]
        MODEL_CACHE.update({"checked_at": now, "models": models})
        print(f"[questions] Ollama installed models={models}")
        return models
    except Exception as exc:
        print(f"[questions] unable to inspect Ollama models: {exc}")
        MODEL_CACHE.update({"checked_at": now, "models": []})
        return []


def configured_models() -> List[str]:
    requested = [
        os.getenv("OLLAMA_MODEL", "qwen2.5:3b"),
        os.getenv("OLLAMA_FALLBACK_MODEL", "llama3:latest"),
        "qwen2.5:3b",
        "llama3:latest",
    ]
    return [model for model in dict.fromkeys(model.strip() for model in requested if model and model.strip())]


def filter_available_models(requested: List[str], available: List[str]) -> List[str]:
    if not available:
        return []

    available_set = set(available)
    selected = [model for model in requested if model in available_set]
    if not selected:
        print(f"[questions] none of configured models are installed requested={requested} installed={available}")
    skipped = [model for model in requested if model not in available_set]
    if skipped:
        print(f"[questions] skipping unavailable Ollama models={skipped}")
    return selected


async def call_ollama(prompt: str, model: str, expected_count: int) -> str:
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    num_predict = min(1400, max(350, 350 * expected_count))
    async with httpx.AsyncClient(timeout=float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))) as client:
        response = await client.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": 0.2,
                    "top_p": 0.8,
                    "num_predict": num_predict,
                    "repeat_penalty": 1.05,
                },
            },
        )
        response.raise_for_status()
    raw = str(response.json().get("response", ""))
    print(f"[questions] raw Ollama response model={model} chars={len(raw)} preview={raw[:500]!r}")
    return raw


class SkillFormatter(string.Formatter):
    def get_value(self, key, args, kwargs):
        if key == "skill":
            return kwargs["skill"]
        return "{" + str(key) + "}"


def safe_skill_format(value: str, skill: str) -> str:
    return SkillFormatter().format(value, skill=skill)


async def generate_with_ollama(domain: str, target_skills: List[str], difficulty: str, previous_context: Optional[List[Dict[str, Any]]]) -> List[dict]:
    available_models = await get_available_ollama_models()
    models = filter_available_models(configured_models(), available_models)
    if not models:
        print(f"[questions] no available Ollama model for difficulty={difficulty}; using non-LLM fallback")
        return []

    generated: List[dict] = []
    seen = set()
    remaining_skills = list(target_skills)
    max_rounds = 2

    for round_index in range(max_rounds):
        if not remaining_skills:
            break

        model = models[min(round_index, len(models) - 1)]
        prompt = build_prompt(domain, remaining_skills, difficulty, previous_context)

        try:
            print(
                f"[questions] generating difficulty={difficulty} round={round_index + 1}/{max_rounds} "
                f"count={len(remaining_skills)} model={model}"
            )
            content = await call_ollama(prompt, model, len(remaining_skills))
            parsed = parse_json_array(content)
            accepted_this_round: List[dict] = []
            accepted_slot_indexes = set()

            for index, raw in enumerate(parsed[:len(remaining_skills)]):
                skill = remaining_skills[index] if index < len(remaining_skills) else remaining_skills[len(accepted_this_round) % len(remaining_skills)]
                question = validate_question(raw, skill, difficulty)
                if not question:
                    continue
                question_key = re.sub(r"\W+", " ", question["question"].lower()).strip()
                if question_key in seen:
                    print(f"[questions] validation rejected duplicate question skill={skill} question={question['question'][:140]!r}")
                    continue
                seen.add(question_key)
                accepted_this_round.append(question)
                accepted_slot_indexes.add(index)

            if accepted_this_round:
                generated.extend(accepted_this_round)
                remaining_skills = [skill for index, skill in enumerate(remaining_skills) if index not in accepted_slot_indexes]
                print(
                    f"[questions] accepted={len(accepted_this_round)} total={len(generated)} "
                    f"remaining={len(remaining_skills)} difficulty={difficulty}"
                )
            else:
                print(f"[questions] validation rejected all model questions for difficulty={difficulty} round={round_index + 1}")
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            print(f"[questions] Ollama HTTP failure model={model} status={status} difficulty={difficulty}: {exc}")
            if status == 404 and model in models:
                continue
        except Exception as exc:
            print(f"[questions] Ollama generation failed model={model} difficulty={difficulty}: {exc}")

        if remaining_skills and round_index + 1 < max_rounds:
            delay = 0.25 * (2 ** round_index)
            print(f"[questions] retrying failed question slots after {delay:.2f}s difficulty={difficulty}")
            await asyncio.sleep(delay)

    return generated


def q(question: str, options: Dict[str, str], correct: str, explanation: str) -> Dict[str, Any]:
    return {
        "question": question,
        "options": options,
        "correct_answer": correct,
        "correctAnswer": correct,
        "explanation": explanation,
    }


QUESTION_BANK: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
    "react": {
        "beginner": [
            q("In React, which hook stores local component state and schedules a re-render when the setter changes the value?", {"A": "useEffect", "B": "useState", "C": "useMemo", "D": "useRef"}, "B", "useState stores component-local state and its setter tells React to render with the updated value."),
            q("What should be used as a stable key when rendering a list of React components from database records?", {"A": "The array index even if items can be reordered", "B": "A random value generated during render", "C": "The database id for each record", "D": "The visible text of the row"}, "C", "A stable id lets React preserve component identity correctly across inserts, deletes, and reordering."),
            q("Which JSX expression correctly passes a numeric prop named count?", {"A": "<Badge count=\"3\" />", "B": "<Badge count={3} />", "C": "<Badge count: 3 />", "D": "<Badge count=(3) />"}, "B", "Curly braces pass the JavaScript number 3, while quotes pass a string."),
        ],
        "intermediate": [
            q("A React component refetches data endlessly after render. Which dependency array is most likely causing the loop?", {"A": "[] on an effect that fetches once", "B": "[userId] when only userId controls the request", "C": "[data] when the effect updates data inside itself", "D": "No dependency array on a pure event handler"}, "C", "If an effect depends on data and also updates data, each update can trigger the effect again."),
            q("A child component wrapped in React.memo still re-renders because a callback prop changes every render. Which hook can stabilize the callback identity?", {"A": "useCallback", "B": "useId", "C": "useLayoutEffect", "D": "useDeferredValue"}, "A", "useCallback memoizes a function reference until its dependencies change."),
            q("Which state update is safest when the next value depends on the previous value?", {"A": "setCount(count + 1)", "B": "setCount(previous => previous + 1)", "C": "count = count + 1", "D": "setCount(() => count = count + 1)"}, "B", "Functional updates avoid stale closures by receiving the latest committed state value."),
        ],
        "expert": [
            q("In a large React app, which change most directly reduces unnecessary renders caused by global context updates?", {"A": "Move every component into one provider", "B": "Split context by update frequency and consumed data", "C": "Replace all props with context", "D": "Store context values in localStorage"}, "B", "Splitting context limits re-render scope because consumers only subscribe to the specific context they read."),
            q("A Next.js page has a client-only interactive chart below mostly static content. Which architecture improves first load while preserving interactivity?", {"A": "Make the entire route a client component", "B": "Server-render the static shell and load the chart as a client component", "C": "Disable hydration for the route", "D": "Render the chart only inside middleware"}, "B", "Keeping static content server-rendered reduces client JavaScript while the chart remains interactive as a client component."),
            q("Which React performance issue is most likely when a component creates large derived arrays during every render?", {"A": "The browser skips reconciliation", "B": "CPU time increases even when source data is unchanged", "C": "Hooks stop preserving order", "D": "CSS modules are regenerated"}, "B", "Expensive derived data should be memoized or moved so unchanged inputs do not repeat heavy computation."),
        ],
    },
    "node.js": {
        "beginner": [
            q("In Node.js, what does async file reading with fs.promises.readFile avoid blocking?", {"A": "The event loop thread", "B": "Only the package manager", "C": "The JSON parser", "D": "The operating system clock"}, "A", "Asynchronous I/O lets Node keep the event loop responsive while the file operation completes."),
            q("Which Express code sends a JSON response with HTTP status 201?", {"A": "res.json(201, data)", "B": "res.status(201).json(data)", "C": "res.sendStatus(data, 201)", "D": "return 201.json(data)"}, "B", "Express chains status before json to set the status code and serialize the body."),
            q("What does package.json primarily define for a Node.js project?", {"A": "Dependencies, scripts, and package metadata", "B": "Only compiled machine code", "C": "MongoDB indexes", "D": "Browser cookies"}, "A", "package.json records dependencies, runnable scripts, package metadata, and tool configuration."),
        ],
        "intermediate": [
            q("An Express error thrown inside an async route is not reaching the error middleware. What is the safest fix?", {"A": "Catch it and call next(error)", "B": "Ignore the promise rejection", "C": "Restart the server inside the route", "D": "Send two responses"}, "A", "Async errors must be passed to Express error handling unless the framework version/wrapper handles rejected promises."),
            q("Which Node.js pattern prevents CPU-heavy JSON processing from delaying all incoming requests?", {"A": "Run the work synchronously in the request handler", "B": "Move CPU-heavy work to a worker thread or external job", "C": "Increase console.log calls", "D": "Use a larger HTTP header"}, "B", "CPU-bound work can block the event loop, so worker threads or background jobs keep request handling responsive."),
            q("Why should API input validation run before database writes in an Express service?", {"A": "It reduces invalid state and rejects bad payloads before persistence", "B": "It makes every query faster automatically", "C": "It replaces authentication", "D": "It disables CORS"}, "A", "Validation protects downstream logic and persistence from malformed or unsafe input."),
        ],
        "expert": [
            q("A Node.js API has high p95 latency during traffic spikes. Which measurement best shows event-loop saturation?", {"A": "Event loop delay histogram", "B": "Number of CSS files", "C": "Git branch count", "D": "Average variable name length"}, "A", "Event loop delay directly indicates whether JavaScript execution or synchronous work is blocking request progress."),
            q("Which design improves reliability for sending emails after a successful API write?", {"A": "Send the email synchronously before the database commit", "B": "Use an outbox/job queue with retry and idempotency", "C": "Trust the browser to send it", "D": "Store the SMTP password in the response"}, "B", "A durable queue or outbox decouples side effects and allows safe retries after persistence succeeds."),
            q("What is the main risk of storing per-user session data only in Node.js process memory?", {"A": "Sessions disappear on restart and do not work across multiple instances", "B": "JSON cannot be parsed", "C": "TLS stops working", "D": "Static files become larger"}, "A", "Process-local state is lost on restart and is not shared across scaled server instances."),
        ],
    },
    "javascript": {
        "beginner": [
            q("What is logged by this JavaScript code?\n```javascript\nconst values = [1, 2, 3];\nconsole.log(values.map(v => v * 2)[1]);\n```", {"A": "1", "B": "2", "C": "4", "D": "6"}, "C", "map returns [2, 4, 6], and index 1 is the second value, 4."),
            q("Which declaration creates a block-scoped variable that can be reassigned?", {"A": "const", "B": "let", "C": "var", "D": "static"}, "B", "let is block-scoped and allows reassignment, unlike const."),
            q("Which expression checks both value and type equality in JavaScript?", {"A": "a == b", "B": "a = b", "C": "a === b", "D": "a ~= b"}, "C", "Strict equality compares without type coercion."),
        ],
        "intermediate": [
            q("Why does this code log 0 before the promise result?\n```javascript\nlet total = 0;\nPromise.resolve(5).then(v => total = v);\nconsole.log(total);\n```", {"A": "Promise callbacks run in a later microtask", "B": "Promise.resolve always fails", "C": "let prevents assignment", "D": "console.log clears variables"}, "A", "The synchronous log runs before the promise continuation updates total."),
            q("Which array method is best for transforming every item into a new array?", {"A": "map", "B": "forEach", "C": "some", "D": "find"}, "A", "map returns a new array containing the transformed result for each input item."),
            q("What problem can optional chaining solve?", {"A": "Accessing nested properties safely when an intermediate value may be null or undefined", "B": "Encrypting object fields", "C": "Sorting arrays automatically", "D": "Creating CSS selectors"}, "A", "Optional chaining short-circuits property access instead of throwing on nullish intermediate values."),
        ],
        "expert": [
            q("Which technique helps avoid blocking the browser main thread with a large JavaScript computation?", {"A": "Move the computation into a Web Worker", "B": "Wrap it in a larger object", "C": "Use more nested callbacks", "D": "Rename the function"}, "A", "Web Workers run JavaScript off the main UI thread, preserving responsiveness."),
            q("A module has side effects at import time. Why can that hurt testability and bundling?", {"A": "It makes imports execute behavior before callers can configure or isolate it", "B": "It prevents all syntax highlighting", "C": "It disables source maps", "D": "It forces HTTP/1"}, "A", "Import-time effects are hard to control in tests and can reduce tree-shaking opportunities."),
            q("Which issue can appear when many closures retain references to large objects after UI cleanup?", {"A": "Memory remains reachable and cannot be garbage-collected", "B": "Numbers become strings", "C": "Promises stop resolving", "D": "CSS specificity doubles"}, "A", "Closures keep captured objects alive while the closure itself remains reachable."),
        ],
    },
    "typescript": {
        "beginner": [
            q("Which TypeScript type annotation describes an array of strings?", {"A": "string[]", "B": "array<strings>", "C": "String.list", "D": "strings"}, "A", "string[] is the standard shorthand for an array whose elements are strings."),
            q("What does TypeScript check before the code runs?", {"A": "Static type compatibility", "B": "Database availability", "C": "CPU temperature", "D": "Network latency"}, "A", "TypeScript performs static analysis and type checking during development/build."),
            q("Which keyword defines a reusable object shape in TypeScript?", {"A": "interface", "B": "route", "C": "packet", "D": "layout"}, "A", "interface declares a reusable structural type for objects and classes."),
        ],
        "intermediate": [
            q("Which type is safer than any when accepting an unknown external API response?", {"A": "unknown", "B": "never", "C": "void", "D": "symbol"}, "A", "unknown forces narrowing before use, while any bypasses type checking."),
            q("What does a discriminated union commonly use to narrow variants?", {"A": "A shared literal property such as kind or type", "B": "A random number field", "C": "A CSS class name", "D": "The file name"}, "A", "A shared literal discriminator lets TypeScript narrow to the correct variant in control flow."),
            q("Why is `as SomeType` risky after parsing JSON?", {"A": "It asserts a type without validating runtime data", "B": "It always changes the object shape", "C": "It encrypts the payload", "D": "It prevents imports"}, "A", "Type assertions do not validate external data, so runtime checks are still needed."),
        ],
        "expert": [
            q("Which TypeScript feature is best for deriving a union of property names from an object type?", {"A": "keyof", "B": "await", "C": "namespace import only", "D": "private"}, "A", "keyof T produces a union of keys from type T."),
            q("A shared package exports broad any types. What is the likely downstream effect?", {"A": "Consumers lose useful compile-time safety across service boundaries", "B": "Runtime becomes faster automatically", "C": "MongoDB indexes are deleted", "D": "CSS stops loading"}, "A", "any erases type information and allows incorrect values to pass through compilation."),
            q("When should a generic constraint like `<T extends { id: string }>` be used?", {"A": "When the function needs every T to have an id property", "B": "When all values should become strings", "C": "Only for React components", "D": "To disable inference"}, "A", "The constraint preserves generic flexibility while guaranteeing the properties the implementation uses."),
        ],
    },
    "python": {
        "beginner": [
            q("What does this Python code print?\n```python\nitems = [1, 2, 3]\nprint(items[0])\n```", {"A": "0", "B": "1", "C": "2", "D": "3"}, "B", "Python lists are zero-indexed, so index 0 returns the first value."),
            q("Which Python structure stores key-value pairs?", {"A": "dict", "B": "tuple only", "C": "range", "D": "set only"}, "A", "A dict maps keys to values."),
            q("Which keyword defines a function in Python?", {"A": "func", "B": "def", "C": "lambda only", "D": "method"}, "B", "def declares a named Python function."),
        ],
        "intermediate": [
            q("Why is a mutable default argument like `def add(item, items=[])` risky?", {"A": "The same list is reused across calls", "B": "Python refuses to import the file", "C": "The list is copied on every call", "D": "It disables exceptions"}, "A", "Default arguments are evaluated once, so the mutable object can retain values between calls."),
            q("Which construct is most appropriate for opening a file and ensuring it closes?", {"A": "with open(path) as file:", "B": "while open(path):", "C": "global open(path)", "D": "try import file"}, "A", "A context manager closes the file when the block exits, including on errors."),
            q("What does a list comprehension primarily improve?", {"A": "Creating a transformed list clearly and concisely", "B": "Changing CPU architecture", "C": "Bypassing type checks in every language", "D": "Opening network ports"}, "A", "List comprehensions express common filter/map list construction patterns directly."),
        ],
        "expert": [
            q("Which approach helps a Python web API handle CPU-bound image processing without blocking request workers?", {"A": "Move processing to a worker queue or separate process", "B": "Run it synchronously in every request", "C": "Store images in environment variables", "D": "Disable logging"}, "A", "CPU-bound work should be isolated from request handling to protect latency and throughput."),
            q("Why can excessive use of broad `except Exception` harm production debugging?", {"A": "It can hide specific failure modes and lose useful context", "B": "It makes strings immutable", "C": "It disables imports", "D": "It prevents function calls"}, "A", "Catching too broadly without logging or re-raising can mask the root cause."),
            q("What is the main benefit of dependency injection in a Python service?", {"A": "It makes dependencies replaceable for tests and configuration", "B": "It removes the need for functions", "C": "It turns lists into dicts", "D": "It guarantees faster CPU instructions"}, "A", "Injected dependencies can be swapped with mocks or alternate implementations without rewriting business logic."),
        ],
    },
    "sql": {
        "beginner": [
            q("Which SQL clause filters rows before aggregation?", {"A": "WHERE", "B": "HAVING", "C": "ORDER BY", "D": "LIMIT"}, "A", "WHERE filters source rows before GROUP BY and aggregation run."),
            q("Which query selects only name and email from a users table?", {"A": "SELECT name, email FROM users;", "B": "GET name email users;", "C": "FIND users.name.email;", "D": "SELECT users WHERE name,email;"}, "A", "SELECT lists columns and FROM names the table."),
            q("What does an INNER JOIN return?", {"A": "Only rows with matching join keys in both tables", "B": "Every row from both tables regardless of keys", "C": "Only duplicate columns", "D": "A database backup"}, "A", "INNER JOIN keeps rows where the join condition matches on both sides."),
        ],
        "intermediate": [
            q("Which SQL clause filters grouped aggregate results such as `COUNT(*) > 5`?", {"A": "WHERE", "B": "HAVING", "C": "JOIN", "D": "OFFSET"}, "B", "HAVING filters after grouping and can reference aggregate expressions."),
            q("A query on `users.email` is slow and filters by exact email. What usually helps most?", {"A": "An index on users.email", "B": "Adding more SELECT columns", "C": "Removing the WHERE clause", "D": "Sorting randomly"}, "A", "An index can allow the database to find matching email values without scanning all rows."),
            q("Why should application code use parameterized SQL queries?", {"A": "To prevent SQL injection and handle values safely", "B": "To make every query return JSON", "C": "To skip database authentication", "D": "To delete unused tables"}, "A", "Parameters separate SQL structure from user-provided values."),
        ],
        "expert": [
            q("Which signal from EXPLAIN most strongly suggests a missing useful index?", {"A": "A full table scan on a large filtered table", "B": "A short query name", "C": "A lowercase keyword", "D": "A semicolon at the end"}, "A", "Large scans for selective filters often indicate the optimizer lacks a useful index."),
            q("What problem can a transaction isolation level help control?", {"A": "Concurrent reads and writes seeing inconsistent data", "B": "CSS rendering", "C": "HTTP compression", "D": "Source map generation"}, "A", "Isolation levels define how concurrent transactions observe and affect each other's data."),
            q("For a high-write table, what is a trade-off of adding many indexes?", {"A": "Reads may improve but writes become more expensive", "B": "All writes become free", "C": "The table stops accepting SELECT", "D": "Column types disappear"}, "A", "Each index must be maintained on writes, increasing write cost and storage."),
        ],
    },
    "docker": {
        "beginner": [
            q("Which Dockerfile instruction copies project files into an image?", {"A": "COPY", "B": "PORT", "C": "RUNNER", "D": "IMAGE"}, "A", "COPY adds files from the build context into the image filesystem."),
            q("What does `docker run -p 8080:80 app` do?", {"A": "Maps host port 8080 to container port 80", "B": "Deletes port 80", "C": "Builds two images", "D": "Disables networking"}, "A", "The left side is the host port and the right side is the container port."),
            q("What is the purpose of a Docker image?", {"A": "It packages filesystem layers and metadata used to start containers", "B": "It stores only runtime logs", "C": "It replaces source control", "D": "It is a DNS record"}, "A", "An image is the immutable template Docker uses to create containers."),
        ],
        "intermediate": [
            q("Why should dependency installation appear before copying frequently changing source files in a Dockerfile?", {"A": "To improve layer cache reuse", "B": "To hide build errors", "C": "To disable package locks", "D": "To expose all ports"}, "A", "Stable dependency layers can be reused when only application source changes."),
            q("A container exits immediately after start. What should you inspect first?", {"A": "Container logs and the configured command/entrypoint", "B": "The monitor brightness", "C": "The GitHub avatar", "D": "The CSS color palette"}, "A", "Logs and entrypoint/command reveal crashes or processes that finish immediately."),
            q("What does a multi-stage Docker build commonly reduce?", {"A": "Final image size and unnecessary build tools", "B": "Network security", "C": "Source code readability", "D": "The need for testing"}, "A", "Build dependencies can stay in earlier stages while the final stage contains only runtime artifacts."),
        ],
        "expert": [
            q("Which practice reduces risk when running containers in production?", {"A": "Run as a non-root user and use minimal base images", "B": "Put secrets in the Dockerfile", "C": "Disable health checks", "D": "Mount the host root filesystem everywhere"}, "A", "Least privilege and smaller images reduce the impact and surface area of compromise."),
            q("What is the production value of a container health check?", {"A": "It lets orchestration detect unhealthy instances and replace or restart them", "B": "It compresses images", "C": "It changes the application language", "D": "It disables logs"}, "A", "Health checks give the platform an application-level readiness/liveness signal."),
            q("Why should Docker images be pinned or built from trusted digests in regulated environments?", {"A": "To make builds reproducible and reduce supply-chain drift", "B": "To make containers run without a kernel", "C": "To remove all dependencies", "D": "To avoid HTTP status codes"}, "A", "Pinned images prevent unexpected upstream changes from silently altering builds."),
        ],
    },
    "machine learning": {
        "beginner": [
            q("In supervised machine learning, what does the label represent?", {"A": "The target value the model learns to predict", "B": "The CPU brand used for training", "C": "The file extension of the dataset", "D": "The chart color for the feature"}, "A", "A label is the known output used to train or evaluate supervised predictions."),
            q("Which split is commonly used to estimate how a trained model performs on unseen data?", {"A": "Test set", "B": "Package lock", "C": "Docker layer", "D": "CSS reset"}, "A", "The test set is held out from training so it can estimate generalization."),
        ],
        "intermediate": [
            q("A model performs very well on training data but poorly on validation data. What is the most likely issue?", {"A": "Overfitting", "B": "Correct normalization", "C": "Perfect generalization", "D": "Too many labels in the test report"}, "A", "Overfitting means the model learned training-specific patterns that do not generalize."),
            q("Why should feature scaling be fit on the training set before transforming validation data?", {"A": "To avoid leaking validation distribution information into training", "B": "To make labels disappear", "C": "To disable cross-validation", "D": "To make every feature categorical"}, "A", "Fitting preprocessing on validation data leaks information and can inflate evaluation results."),
        ],
        "expert": [
            q("A deployed model's input distribution changes over time while code stays the same. What should monitoring detect?", {"A": "Data drift", "B": "CSS drift", "C": "Package minification", "D": "HTTP redirects only"}, "A", "Data drift indicates production inputs no longer match the training distribution."),
            q("Which practice improves reliability when replacing a production ML model?", {"A": "Shadow or canary evaluation with rollback criteria", "B": "Delete the old model before measuring the new one", "C": "Skip monitoring after deployment", "D": "Train only on test data"}, "A", "Gradual rollout and rollback criteria reduce risk from model regressions."),
        ],
    },
    "cloud": {
        "beginner": [
            q("Which cloud concept lets an application add or remove compute capacity based on demand?", {"A": "Auto scaling", "B": "Static typing", "C": "CSS grid", "D": "Local clipboard history"}, "A", "Auto scaling adjusts compute resources as load changes."),
            q("What is an IAM policy used for in cloud platforms?", {"A": "Defining permissions for identities and resources", "B": "Changing source-code formatting", "C": "Compressing frontend bundles", "D": "Creating database rows directly"}, "A", "IAM policies define what actions principals can perform on resources."),
        ],
        "intermediate": [
            q("A cloud service works locally but fails in production with access denied. What should be checked first?", {"A": "Runtime identity permissions and resource policy", "B": "Only the CSS stylesheet", "C": "Whether the laptop is charging", "D": "The order of comments"}, "A", "Access denied failures usually come from IAM roles, policies, or resource permissions."),
            q("Why place public web servers behind a load balancer?", {"A": "To distribute traffic and support health-based routing", "B": "To store passwords in URLs", "C": "To remove TLS certificates", "D": "To disable all logs"}, "A", "Load balancers spread traffic and route around unhealthy targets."),
        ],
        "expert": [
            q("Which design improves resilience across a regional outage?", {"A": "Multi-region failover with tested data replication and DNS/routing controls", "B": "A single instance with no backup", "C": "Manual screenshots of dashboards", "D": "One hardcoded IP address in the frontend"}, "A", "Regional resilience requires redundant deployment, replicated state, and tested traffic shifting."),
            q("What is the main purpose of infrastructure as code in cloud operations?", {"A": "Versioned, reviewable, repeatable infrastructure changes", "B": "Avoiding all monitoring", "C": "Making resources impossible to delete", "D": "Replacing authentication"}, "A", "Infrastructure as code makes cloud changes reproducible and auditable."),
        ],
    },
    "linux": {
        "beginner": [
            q("Which Linux command lists files in the current directory?", {"A": "ls", "B": "cd", "C": "grep", "D": "chmod"}, "A", "ls lists directory contents."),
            q("What does `chmod +x script.sh` do?", {"A": "Adds execute permission to the script", "B": "Deletes the script", "C": "Prints the current directory", "D": "Searches inside the script"}, "A", "chmod changes file permissions, and +x adds execute permission."),
        ],
        "intermediate": [
            q("A service fails to bind to port 80 on Linux. What should you check first?", {"A": "Whether another process is using the port and whether privileges allow binding", "B": "Only the desktop wallpaper", "C": "Whether README has headings", "D": "The browser zoom level"}, "A", "Port conflicts and privileged-port permissions are common binding failures."),
            q("Which command helps find lines containing `ERROR` in an application log?", {"A": "grep ERROR app.log", "B": "mkdir ERROR app.log", "C": "chmod ERROR app.log", "D": "pwd ERROR app.log"}, "A", "grep searches text for matching patterns."),
        ],
        "expert": [
            q("High Linux load average but low CPU usage most likely suggests what should be investigated?", {"A": "I/O wait or blocked processes", "B": "CSS specificity", "C": "JavaScript variable hoisting", "D": "HTML doctype"}, "A", "Load can rise when processes wait on disk, network, or other blocking resources."),
            q("Which signal is most useful for debugging a process killed by the Linux OOM killer?", {"A": "Kernel logs showing out-of-memory events", "B": "Only frontend console warnings", "C": "The package.json name", "D": "The Git remote URL"}, "A", "Kernel logs record OOM killer decisions and the process selected for termination."),
        ],
    },
    "html/css": {
        "beginner": [
            q("Which HTML element is most appropriate for page navigation links?", {"A": "nav", "B": "canvas", "C": "script", "D": "tbody"}, "A", "nav semantically groups major navigation links."),
            q("Which CSS property changes text color?", {"A": "color", "B": "display", "C": "gap", "D": "z-index"}, "A", "The color property controls the foreground text color."),
        ],
        "intermediate": [
            q("Which CSS layout tool is best for two-dimensional rows and columns?", {"A": "CSS Grid", "B": "text-decoration", "C": "border-style only", "D": "font-weight"}, "A", "CSS Grid is designed for two-dimensional layout across rows and columns."),
            q("Why should form inputs have associated labels?", {"A": "They improve accessibility and click/focus behavior", "B": "They automatically encrypt values", "C": "They replace server validation", "D": "They disable browser rendering"}, "A", "Labels make controls understandable to assistive technology and easier to activate."),
        ],
        "expert": [
            q("A sticky header overlaps anchored content after navigation. Which CSS approach commonly fixes this?", {"A": "Use scroll-margin-top on target sections", "B": "Remove all semantic headings", "C": "Set every element to position absolute", "D": "Disable keyboard navigation"}, "A", "scroll-margin-top reserves space when scrolling an anchor into view below fixed or sticky UI."),
            q("Which issue can excessive z-index values across unrelated components create?", {"A": "Unpredictable stacking conflicts that are hard to maintain", "B": "Automatic database migrations", "C": "Faster image decoding", "D": "Guaranteed accessibility"}, "A", "Unstructured stacking contexts make overlays and focus states difficult to reason about."),
        ],
    },
    "java": {
        "beginner": [
            q("Which Java keyword creates a class that can be instantiated?", {"A": "class", "B": "package only", "C": "lambda", "D": "select"}, "A", "class declares a Java type that can define fields, methods, and constructors."),
            q("Which collection stores unique elements in Java?", {"A": "Set", "B": "List only", "C": "StringBuilder", "D": "Scanner"}, "A", "Set implementations such as HashSet store unique elements."),
        ],
        "intermediate": [
            q("Why should Java objects used as HashMap keys implement consistent equals and hashCode?", {"A": "So lookup and bucket placement remain correct", "B": "So garbage collection stops", "C": "So imports become optional", "D": "So exceptions are disabled"}, "A", "HashMap relies on hashCode and equals to find matching keys."),
            q("Which Java feature helps release files or sockets automatically after a block?", {"A": "try-with-resources", "B": "switch fallthrough", "C": "static import", "D": "raw types"}, "A", "try-with-resources closes AutoCloseable resources after the block exits."),
        ],
        "expert": [
            q("Which JVM signal is most relevant when diagnosing long application pauses?", {"A": "Garbage collection pause metrics", "B": "HTML heading count", "C": "CSS variable names", "D": "Git tag format"}, "A", "GC pauses can stop application threads and increase latency."),
            q("Why prefer bounded thread pools for server workloads?", {"A": "They prevent unbounded thread creation from exhausting resources", "B": "They make every task synchronous", "C": "They remove the need for monitoring", "D": "They disable exceptions"}, "A", "Bounded pools control concurrency and protect CPU and memory under load."),
        ],
    },
    "rust": {
        "beginner": [
            q("What does Rust's ownership system primarily prevent at compile time?", {"A": "Use-after-free and many data race errors", "B": "All network latency", "C": "Every logic bug", "D": "SQL syntax errors"}, "A", "Ownership and borrowing enforce memory-safety rules before runtime."),
            q("Which Rust keyword makes a binding mutable?", {"A": "mut", "B": "var", "C": "letmutate", "D": "change"}, "A", "Bindings are immutable by default, and mut allows reassignment or mutable borrowing where permitted."),
        ],
        "intermediate": [
            q("Why might the Rust compiler reject two simultaneous mutable references to the same value?", {"A": "To prevent aliasing that could cause unsafe mutation", "B": "To disable stack allocation", "C": "To make strings slower", "D": "To remove pattern matching"}, "A", "Rust allows either one mutable reference or multiple immutable references, preventing unsafe aliasing."),
            q("Which type is idiomatic for recoverable errors in Rust?", {"A": "Result<T, E>", "B": "Throwable", "C": "MaybeErrorString only", "D": "panic always"}, "A", "Result represents either success with T or failure with E."),
        ],
        "expert": [
            q("When should Rust async code avoid holding a mutex guard across an `.await`?", {"A": "It can block other tasks and risk deadlocks or poor scheduling", "B": "It makes compilation impossible in every case", "C": "It deletes the future", "D": "It disables ownership"}, "A", "Holding locks across await points can prevent other tasks from making progress."),
            q("What is the main advantage of zero-cost abstractions in Rust?", {"A": "High-level code can compile to efficient machine code without runtime abstraction overhead", "B": "All programs become zero bytes", "C": "The borrow checker is skipped", "D": "Network calls become free"}, "A", "Rust aims to provide expressive abstractions that optimize away to efficient low-level code."),
        ],
    },
    "statistics": {
        "beginner": [
            q("Which statistic is most affected by extreme outliers in a numeric dataset?", {"A": "Mean", "B": "Median", "C": "Mode only", "D": "Count"}, "A", "The mean uses every value, so extreme values can pull it up or down."),
            q("What does standard deviation measure?", {"A": "How spread out values are around the mean", "B": "The number of columns in a table", "C": "The largest category name", "D": "The database engine version"}, "A", "Standard deviation summarizes dispersion around the mean."),
        ],
        "intermediate": [
            q("A p-value of 0.03 with alpha 0.05 usually means what?", {"A": "Reject the null hypothesis under that threshold", "B": "The result has a 3% chance of being true", "C": "The model is always useful in production", "D": "The sample size is exactly 3"}, "A", "When p is below alpha, the result is considered statistically significant under that test threshold."),
            q("Why use a confidence interval instead of only a point estimate?", {"A": "It communicates uncertainty around the estimate", "B": "It removes the need for sampling", "C": "It guarantees causation", "D": "It makes all data normally distributed"}, "A", "Intervals show a plausible range and make uncertainty visible."),
        ],
        "expert": [
            q("Why can correlation be misleading for product decisions?", {"A": "It does not prove causation and may reflect confounders", "B": "It always proves causation", "C": "It only works on strings", "D": "It deletes outliers automatically"}, "A", "Observed correlation can arise from hidden variables or reverse causality."),
            q("What is the main reason to predefine experiment metrics before an A/B test?", {"A": "To reduce p-hacking and biased interpretation after seeing results", "B": "To make randomization unnecessary", "C": "To guarantee a positive result", "D": "To avoid collecting data"}, "A", "Predefined metrics reduce the temptation to cherry-pick favorable outcomes."),
        ],
    },
    "excel": {
        "beginner": [
            q("Which Excel formula sums the values in cells A1 through A10?", {"A": "=SUM(A1:A10)", "B": "=ADD(A1-A10)", "C": "=TOTAL A1:A10", "D": "=COUNT_TEXT(A1:A10)"}, "A", "SUM with a range adds the numeric values in that range."),
            q("What does an absolute reference like `$A$1` do when a formula is copied?", {"A": "Keeps both column A and row 1 fixed", "B": "Deletes the referenced cell", "C": "Converts the formula to text", "D": "Sorts the sheet"}, "A", "Dollar signs lock the column and row during formula copy/fill."),
        ],
        "intermediate": [
            q("Which Excel function is commonly used to look up a value by key and return a related column?", {"A": "XLOOKUP", "B": "NOW", "C": "ROUND", "D": "LEN"}, "A", "XLOOKUP searches for a key and returns a corresponding value from another range."),
            q("Why convert a data range into an Excel Table before analysis?", {"A": "Tables expand formulas and references as rows are added", "B": "Tables remove every duplicate automatically", "C": "Tables disable filters", "D": "Tables hide formulas from recalculation"}, "A", "Excel Tables provide structured references and grow with the data."),
        ],
        "expert": [
            q("A workbook is slow because thousands of formulas recalculate repeatedly. What should be investigated first?", {"A": "Volatile formulas, full-column references, and repeated expensive lookups", "B": "The worksheet tab color", "C": "Whether rows have borders", "D": "The zoom percentage"}, "A", "Volatile and overly broad formulas can trigger expensive recalculation."),
            q("Which Power Query practice improves repeatable data cleaning?", {"A": "Define typed transformation steps instead of manual copy-paste edits", "B": "Edit source CSV files by hand each time", "C": "Delete the query after loading", "D": "Turn off refresh permanently"}, "A", "Power Query steps make cleanup reproducible and refreshable."),
        ],
    },
}


GENERIC_TECHNICAL: Dict[str, List[Dict[str, Any]]] = {
    "beginner": [
        q("For {skill}, which habit most directly helps a beginner verify behavior while coding?", {"A": "Run a small example and inspect the actual output", "B": "Assume the implementation works without running it", "C": "Delete error messages before reading them", "D": "Commit secrets to make setup faster"}, "A", "Small runnable examples make {skill} behavior visible and easier to reason about."),
        q("When adding {skill} to a project, what should be checked first?", {"A": "Installation, version compatibility, and a minimal working example", "B": "Whether all unrelated files can be removed", "C": "Whether tests can be skipped permanently", "D": "Whether logs can be disabled"}, "A", "Setup and version compatibility are the foundation for using {skill} reliably."),
    ],
    "intermediate": [
        q("A feature using {skill} works locally but fails in staging. What is the best first debugging step?", {"A": "Compare configuration, versions, logs, and input data between environments", "B": "Rewrite the whole application immediately", "C": "Ignore staging because local worked", "D": "Remove authentication from every route"}, "A", "Environment differences are a common source of staging-only failures."),
        q("Which evidence best supports choosing one {skill} implementation over another?", {"A": "Measured behavior, maintainability, and failure-mode trade-offs", "B": "The shortest variable names", "C": "Whether the code avoids all tests", "D": "The number of blank lines"}, "A", "Intermediate technical choices should be justified by measured behavior and operational trade-offs."),
    ],
    "expert": [
        q("For a production system built around {skill}, which review question is most important before scaling traffic?", {"A": "Can it be observed, secured, rolled back, and recovered when dependencies fail?", "B": "Can every file be moved into one folder?", "C": "Can all logs be hidden from operators?", "D": "Can user input bypass validation?"}, "A", "Expert production review focuses on reliability, security, observability, and recovery."),
        q("What is the strongest sign that a {skill} design is ready for production growth?", {"A": "It has capacity limits, monitoring, clear ownership, and tested failure behavior", "B": "It only works with one developer's machine", "C": "It stores credentials in client code", "D": "It has no documented rollback path"}, "A", "Production-ready designs make operating and recovering the system explicit."),
    ],
}


def fallback_pool_for_skill(skill: str, difficulty: str) -> List[Dict[str, Any]]:
    normalized = normalize_skill(skill)
    if normalized in QUESTION_BANK:
        return QUESTION_BANK[normalized][difficulty]
    return GENERIC_TECHNICAL[difficulty]


def fallback_questions(target_skills: List[str], difficulty: str, existing_questions: Optional[List[dict]] = None) -> List[dict]:
    print(f"[questions] using technical fallback difficulty={difficulty} count={len(target_skills)}")
    existing_questions = existing_questions or []
    existing_text = {re.sub(r"\W+", " ", item.get("question", "").lower()).strip() for item in existing_questions}
    generated: List[dict] = []

    for index, skill in enumerate(target_skills):
        pool = fallback_pool_for_skill(skill, difficulty)
        selected = pool[index % len(pool)]
        question_text = safe_skill_format(selected["question"], skill)
        fallback_index = 0
        while re.sub(r"\W+", " ", question_text.lower()).strip() in existing_text and fallback_index < len(pool):
            selected = pool[(index + fallback_index) % len(pool)]
            question_text = safe_skill_format(selected["question"], skill)
            fallback_index += 1

        generated.append({
            "question": question_text,
            "options": {key: safe_skill_format(value, skill) for key, value in selected["options"].items()},
            "correct_answer": selected["correct_answer"],
            "correctAnswer": selected["correct_answer"],
            "explanation": safe_skill_format(selected["explanation"], skill),
            "skill": clean_skill(skill),
            "difficulty": difficulty,
        })
        existing_text.add(re.sub(r"\W+", " ", question_text.lower()).strip())

    return generated


def missing_skill_slots(target_skills: List[str], generated: List[dict]) -> List[str]:
    remaining = [clean_skill(skill) for skill in target_skills]
    for question in generated:
        skill = clean_skill(str(question.get("skill", "")))
        if skill in remaining:
            remaining.remove(skill)
        elif remaining:
            remaining.pop(0)
    return remaining


@router.post("/generate-questions")
async def generate_questions(request: GenerateQuestionsRequest):
    skills = [clean_skill(skill) for skill in request.skills if clean_skill(skill)]
    if not skills:
        skills = [clean_skill(request.domain)]

    difficulties = [request.difficulty] if request.difficulty else DIFFICULTIES
    all_questions: List[dict] = []
    allow_procedural_fallback = os.getenv("ALLOW_PROCEDURAL_QUESTION_FALLBACK", "true").lower() != "false"

    for difficulty_index, difficulty in enumerate(difficulties):
        if difficulty not in set(DIFFICULTIES):
            raise HTTPException(status_code=400, detail="difficulty must be beginner, intermediate, or expert")

        target_skills = allocate_skills(skills, 6, offset=difficulty_index * 6)
        generated = await generate_with_ollama(request.domain, target_skills, difficulty, request.previous_context)
        if len(generated) < 6:
            missing_skills = missing_skill_slots(target_skills, generated)
            if allow_procedural_fallback:
                generated.extend(fallback_questions(missing_skills, difficulty, generated))
            else:
                print(
                    f"[questions] procedural fallback disabled; returning partial generated={len(generated)} "
                    f"difficulty={difficulty}"
                )
        all_questions.extend(generated[:6])

    random.shuffle(all_questions)
    print(f"[questions] returning total={len(all_questions)} skills={sorted({q['skill'] for q in all_questions})}")
    return {"questions": all_questions, "total": len(all_questions)}
