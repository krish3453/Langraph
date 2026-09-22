import "dotenv/config";

import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

import { retriever } from "./qdrant-retriever.js";


// ========================================
// 1. Graph State
// ========================================

const State = new StateSchema({
    question: z.string(),

    route: z.enum(["rag", "database", "both"]),

    retrievedInfo: z.string(),

    databaseInfo: z.string(),

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
// 3. Router
// ========================================

const RouteSchema = z.object({
    route: z.enum(["rag", "database", "both"])
});

const router = model.withStructuredOutput(RouteSchema);


const routerNode = async (
    state: typeof State.State
) => {

    console.log("\n🧠 Deciding what information is needed...");

    const result = await router.invoke([
        {
            role: "system",
            content: `
You route technical support questions.

Choose:

rag
- when the question needs technical documentation,
  troubleshooting information, explanations, or error documentation.

database
- when the question specifically asks about the
  current PostgreSQL database status or health.

both
- when the question needs both technical documentation
  and the current PostgreSQL status.
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
// 4. RAG Node
// ========================================

const ragNode = async (
    state: typeof State.State
) => {

    console.log("\n🔍 Searching Qdrant...");

    const docs = await retriever.invoke(state.question);

    const retrievedInfo = docs
        .map((doc, index) => {
            return `Document ${index + 1}:\n${doc.pageContent}`;
        })
        .join("\n\n");

    console.log(`Retrieved ${docs.length} documents.`);

    return {
        retrievedInfo
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
        databaseInfo: result
    };
};


// ========================================
// 7. Generate Node
// ========================================

const generateNode = async (
    state: typeof State.State
) => {

    console.log("\n🤖 Generating final answer...");

    const response = await model.invoke([
        {
            role: "system",
            content: `
You are a Developer Copilot.

Answer the user's question using the available information.

Use retrieved documentation when available.

Use database status information when available.

Do not invent technical facts.

If information is missing, clearly say so.
`
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Retrieved Documentation:
${state.retrievedInfo || "No documentation retrieved."}

Database Status:
${state.databaseInfo || "Database status was not checked."}
`
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// ========================================
// 8. Router → Nodes
// ========================================

const routeAfterRouter = (
    state: typeof State.State
) => {

    return state.route;
};


// ========================================
// 9. Build Graph
// ========================================

const graph = new StateGraph(State)

    .addNode("router", routerNode)
    .addNode("rag", ragNode)
    .addNode("database", databaseNode)
    .addNode("generate", generateNode)

    .addEdge(START, "router")

    .addConditionalEdges(
        "router",
        routeAfterRouter,
        {
            rag: "rag",
            database: "database",
            both: "rag"
        }
    )

    .addEdge("rag", "generate")

    .addEdge("database", "generate")

    .compile();


// ========================================
// 10. Run
// ========================================

const result = await graph.invoke({
    question:
        "Why am I getting ECONNREFUSED when connecting to PostgreSQL?",

    route: "rag",

    retrievedInfo: "",

    databaseInfo: "",

    answer: ""
});


console.log("\n================================");
console.log("FINAL ANSWER");
console.log("================================\n");

console.log(result.answer);