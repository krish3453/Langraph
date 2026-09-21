import { z } from "zod";
import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

const State = new StateSchema({
    question: z.string(),
    route: z.string(),
    answer: z.string()
});


// -------------------------
// 1. CLASSIFY NODE
// -------------------------

const classifyNode = async (
    state: typeof State.State
) => {

    console.log("\n--- CLASSIFY NODE ---");
    console.log("Question:", state.question);

    const question = state.question.toLowerCase();

    const technicalKeywords = [
        "postgresql",
        "database",
        "node.js",
        "node",
        "api",
        "error",
        "server",
        "redis",
        "docker",
        "code"
    ];

    const isTechnical = technicalKeywords.some(
        keyword => question.includes(keyword)
    );

    const route = isTechnical
        ? "technical"
        : "general";

    console.log("Route:", route);

    return {
        route
    };
};


// -------------------------
// 2. TECHNICAL NODE
// -------------------------

const technicalNode = async (
    state: typeof State.State
) => {

    console.log("\n--- TECHNICAL NODE ---");

    return {
        answer: `Technical request detected: "${state.question}"`
    };
};


// -------------------------
// 3. GENERAL NODE
// -------------------------

const generalNode = async (
    state: typeof State.State
) => {

    console.log("\n--- GENERAL NODE ---");

    return {
        answer: `General request detected: "${state.question}"`
    };
};


// -------------------------
// 4. BUILD GRAPH
// -------------------------

const graph = new StateGraph(State)

    .addNode("classify", classifyNode)

    .addNode("technical", technicalNode)

    .addNode("general", generalNode)

    .addEdge(START, "classify")

    .addConditionalEdges(
        "classify",

        (state) => state.route,

        {
            technical: "technical",
            general: "general"
        }
    )

    .addEdge("technical", END)

    .addEdge("general", END)

    .compile();


// -------------------------
// 5. RUN GRAPH
// -------------------------

const result = await graph.invoke({
    question: "What is the difference between TCP and UDP?",
    route: "",
    answer: ""
});

console.log("\n===== FINAL STATE =====");
console.log(result);