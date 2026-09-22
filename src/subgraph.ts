import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

import { z } from "zod";

/* =========================
   RAG SUBGRAPH
========================= */

const RAGState = new StateSchema({
    question: z.string(),
    context: z.string()
});

const retrieveNode = async (
    state: typeof RAGState.State
) => {
    console.log("🔍 RAG: retrieving information...");

    return {
        context: `Documentation says: PostgreSQL ECONNREFUSED usually means the application cannot establish a TCP connection to PostgreSQL.`
    };
};

const ragGraph = new StateGraph(RAGState)
    .addNode("retrieve", retrieveNode)
    .addEdge(START, "retrieve")
    .addEdge("retrieve", END)
    .compile();


/* =========================
   MAIN GRAPH
========================= */

const MainState = new StateSchema({
    question: z.string(),
    context: z.string(),
    answer: z.string()
});

const ragNode = async (
    state: typeof MainState.State
) => {

    console.log("📚 Calling RAG subgraph...");

    const result = await ragGraph.invoke({
        question: state.question,
        context: ""
    });

    return {
        context: result.context
    };
};

const answerNode = async (
    state: typeof MainState.State
) => {

    console.log("🤖 Generating answer...");

    return {
        answer: `Based on the documentation: ${state.context}`
    };
};

const mainGraph = new StateGraph(MainState)
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