import "dotenv/config";

import {
    StateGraph,
    StateSchema,
    START,
    END,
    Command
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
// 3. Router Schema
// ========================================

const RouteSchema = z.object({
    route: z.enum(["rag", "database", "both"])
});

const router = model.withStructuredOutput(RouteSchema);


// ========================================
// 4. Router Node
// ========================================

const routerNode = async (
    state: typeof State.State
) => {

    console.log("\n🧠 Deciding what information is needed...");

    const result = await router.invoke([
        {
            role: "system",
            content: `
You are a router for a Developer Copilot.

Choose exactly one route.

rag:
Use when the question needs technical documentation,
troubleshooting information, error explanations,
or knowledge-base information.

database:
Use when the question asks about the current
PostgreSQL database health or status.

both:
Use when the question requires BOTH:
1. technical documentation
2. current PostgreSQL status

For example:

"Why am I getting ECONNREFUSED when connecting
to PostgreSQL, and is PostgreSQL currently healthy?"

should use both.
`
        },
        {
            role: "user",
            content: state.question
        }
    ]);

    console.log(`Route: ${result.route}`);


    if (result.route === "rag") {

        return new Command({
            update: {
                route: "rag"
            },
            goto: "rag"
        });
    }


    if (result.route === "database") {

        return new Command({
            update: {
                route: "database"
            },
            goto: "database"
        });
    }


    return new Command({
        update: {
            route: "both"
        },
        goto: ["rag", "database"]
    });
};


// ========================================
// 5. RAG Node
// ========================================

const ragNode = async (
    state: typeof State.State
) => {

    console.log("\n🔍 Searching Qdrant...");

    const docs = await retriever.invoke(
        state.question
    );

    const retrievedInfo = docs
        .map((doc, index) => {
            return `Document ${index + 1}:\n${doc.pageContent}`;
        })
        .join("\n\n");

    console.log(
        `Retrieved ${docs.length} documents.`
    );

    return {
        retrievedInfo
    };
};


// ========================================
// 6. Database Tool
// ========================================

const getDatabaseStatus = async () => {

    console.log(
        "\n🔧 Executing database status tool..."
    );

    // Simulated database health check
    return "PostgreSQL is running. Connection is healthy.";
};


// ========================================
// 7. Database Node
// ========================================

const databaseNode = async () => {

    const result =
        await getDatabaseStatus();

    return {
        databaseInfo: result
    };
};


// ========================================
// 8. Join Node
// ========================================

const joinNode = async (
    state: typeof State.State
) => {

    console.log("\n🔗 Combining information...");

    return {};
};


// ========================================
// 9. Generate Node
// ========================================

const generateNode = async (
    state: typeof State.State
) => {

    console.log(
        "\n🤖 Generating final answer..."
    );

    const response = await model.invoke([
        {
            role: "system",
            content: `
You are a Developer Copilot.

Answer the user's question using the available information.

Use technical documentation when available.

Use current database status when available.

If both are available, combine them.

Do not invent technical facts.

If information is missing, clearly say so.
`
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Technical Documentation:
${state.retrievedInfo || "Not retrieved."}

Current Database Status:
${state.databaseInfo || "Not checked."}
`
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// ========================================
// 10. Build Graph
// ========================================

const graph = new StateGraph(State)

    // -------------------------
    // Nodes
    // -------------------------

    .addNode(
        "router",
        routerNode,
        {
            ends: ["rag", "database"]
        }
    )

    .addNode("rag", ragNode)

    .addNode("database", databaseNode)

    .addNode("join", joinNode)

    .addNode("generate", generateNode)


    // -------------------------
    // Start
    // -------------------------

    .addEdge(
        START,
        "router"
    )


    // -------------------------
    // Individual routes
    // -------------------------

    .addEdge(
        "rag",
        "join"
    )

    .addEdge(
        "database",
        "join"
    )


    // -------------------------
    // Join → Generate
    // -------------------------

    .addEdge(
        "join",
        "generate"
    )


    // -------------------------
    // Generate → END
    // -------------------------

    .addEdge(
        "generate",
        END
    )


    .compile();


// ========================================
// 11. Run
// ========================================

const result = await graph.invoke({

    question:
        "Why am I getting ECONNREFUSED when connecting to PostgreSQL, and is my PostgreSQL database currently healthy?",

    route: "rag",

    retrievedInfo: "",

    databaseInfo: "",

    answer: ""
});


// ========================================
// 12. Output
// ========================================

console.log("\n================================");
console.log("FINAL ANSWER");
console.log("================================\n");

console.log(result.answer);


console.log("\n================================");
console.log("STATE");
console.log("================================");

console.log(
    "Route:",
    result.route
);

console.log(
    "Documentation retrieved:",
    result.retrievedInfo
        ? "YES"
        : "NO"
);

console.log(
    "Database checked:",
    result.databaseInfo
        ? "YES"
        : "NO"
);