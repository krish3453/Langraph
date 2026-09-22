import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

import { z } from "zod";


/* =========================
   SHARED STATE
========================= */

const State = new StateSchema({
    question: z.string(),
    context: z.string(),
    answer: z.string()
});


/* =========================
   SUBGRAPH
========================= */

const retrieveNode = async (
    state: typeof State.State
) => {

    console.log("🔍 Subgraph: retrieving...");

    return {
        context: "PostgreSQL ECONNREFUSED means the application cannot connect to the PostgreSQL server."
    };
};

const ragSubgraph = new StateGraph(State)
    .addNode("retrieve", retrieveNode)
    .addEdge(START, "retrieve")
    .addEdge("retrieve", END)
    .compile();


/* =========================
   MAIN GRAPH
========================= */

const ragNode = async (
    state: typeof State.State
) => {

    console.log("📚 Main graph: calling RAG subgraph...");

    const result = await ragSubgraph.invoke(state);

    return {
        context: result.context
    };
};


const answerNode = async (
    state: typeof State.State
) => {

    console.log("🤖 Main graph: generating answer...");

    return {
        answer: `Answer: ${state.context}`
    };
};


const mainGraph = new StateGraph(State)
    .addNode("rag", ragNode)
    .addNode("generateAnswer", answerNode)

    .addEdge(START, "rag")
    .addEdge("rag", "generateAnswer")
    .addEdge("generateAnswer", END)

    .compile();


/* =========================
   RUN
========================= */

const result = await mainGraph.invoke({
    question: "Why am I getting ECONNREFUSED?",
    context: "",
    answer: ""
});

console.log("\nFinal result:");
console.log(result);