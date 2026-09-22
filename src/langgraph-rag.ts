import "dotenv/config";

import { StateGraph, StateSchema, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

import { retriever } from "./qdrant-retriever.js";


// ===============================
// 1. Define Graph State
// ===============================

const State = new StateSchema({
    question: z.string(),
    retrievedInfo: z.string(),
    answer: z.string()
});


// ===============================
// 2. Model
// ===============================

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash-lite",
    temperature: 0
});


// ===============================
// 3. Retrieve Node
// ===============================

const retrieveNode = async (state: typeof State.State) => {

    console.log("\n Retrieving from Qdrant...");

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


// ===============================
// 4. Generate Node
// ===============================

const generateNode = async (state: typeof State.State) => {

    console.log("\n Generating answer...");

    const response = await model.invoke([
        {
            role: "system",
            content: `
You are a technical support assistant.

Answer the user's question using ONLY the retrieved information.

If the retrieved information does not contain enough information,
say that you do not have enough information.
`
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Retrieved Information:
${state.retrievedInfo}
`
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// ===============================
// 5. Build Graph
// ===============================

const graph = new StateGraph(State)

    .addNode("retrieve", retrieveNode)
    .addNode("generate", generateNode)

    .addEdge(START, "retrieve")
    .addEdge("retrieve", "generate")
    .addEdge("generate", END)

    .compile();


// ===============================
// 6. Run Graph
// ===============================

const result = await graph.invoke({
    question: "Why is my Node.js application getting ECONNREFUSED?",
    retrievedInfo: "",
    answer: ""
});


console.log("\n===============================");
console.log("FINAL ANSWER");
console.log("===============================\n");

console.log(result.answer);