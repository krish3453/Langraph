import "dotenv/config";

import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";


// ========================================
// 1. Graph State
// ========================================

const State = new StateSchema({
    question: z.string(),

    route: z.enum(["database", "general"]),

    toolResult: z.string(),

    answer: z.string()
});


// ========================================
// 2. Gemini
// ========================================

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash-lite",
    temperature: 0
});


// ========================================
// 3. Structured Router
// ========================================

const RouteSchema = z.object({
    route: z.enum(["database", "general"])
});

const router = model.withStructuredOutput(RouteSchema);


// ========================================
// 4. Router Node
// ========================================

const routerNode = async (
    state: typeof State.State
) => {

    console.log("\n🧠 Deciding route...");

    const result = await router.invoke([
        {
            role: "system",
            content: `
Decide whether the user's question requires
checking PostgreSQL database status.

Return:

database
- if the question asks about PostgreSQL/database
  health, status, connection, or availability.

general
- for other questions.
`
        },
        {
            role: "user",
            content: state.question
        }
    ]);

    console.log(`Route: ${result.route}`);

    return {
        route: result.route
    };
};


// ========================================
// 5. Database Tool
// ========================================

const getDatabaseStatus = async () => {

    console.log("\n🔧 Executing database status tool...");

    return "PostgreSQL is running. Connection is healthy.";
};


// ========================================
// 6. Database Node
// ========================================

const databaseNode = async () => {

    const result = await getDatabaseStatus();

    return {
        toolResult: result
    };
};


// ========================================
// 7. Generate Node
// ========================================

const generateNode = async (
    state: typeof State.State
) => {

    console.log("\n🤖 Generating answer...");

    const response = await model.invoke([
        {
            role: "system",
            content: `
You are a technical assistant.

Answer the user's question.

If database information is available,
use it in your answer.
`
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Database information:
${state.toolResult || "No database information available."}
`
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// ========================================
// 8. Conditional Routing
// ========================================

const routeAfterDecision = (
    state: typeof State.State
) => {

    return state.route;
};


// ========================================
// 9. Build Graph
// ========================================

const graph = new StateGraph(State)

    .addNode("router", routerNode)
    .addNode("database", databaseNode)
    .addNode("generate", generateNode)

    .addEdge(START, "router")

    .addConditionalEdges(
        "router",
        routeAfterDecision,
        {
            database: "database",
            general: "generate"
        }
    )

    .addEdge("database", "generate")

    .addEdge("generate", END)

    .compile();


// ========================================
// 10. Run
// ========================================

const result = await graph.invoke({
    question: "What is the difference between TCP and UDP?",

    route: "general",

    toolResult: "",

    answer: ""
});


console.log("\n================================");
console.log("FINAL ANSWER");
console.log("================================\n");

console.log(result.answer);