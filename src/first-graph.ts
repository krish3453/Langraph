import { z } from "zod";

import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";


const State = new StateSchema({
    question: z.string(),
    answer: z.string()
});


const retrieveNode = async (
    state: typeof State.State
) => {

    console.log("\n--- RETRIEVE NODE ---");

    console.log("Question:", state.question);
    console.log("Answer:", state.answer);

    return {
        answer: "PostgreSQL is a relational database."
    };
};


const generateNode = async (
    state: typeof State.State
) => {

    console.log("\n--- GENERATE NODE ---");

    console.log("Question:", state.question);
    console.log("Answer:", state.answer);

    return {
        answer: `${state.answer} It is commonly used for backend applications.`
    };
};


const graph = new StateGraph(State)

    .addNode("retrieve", retrieveNode)

    .addNode("generate", generateNode)

    .addEdge(START, "retrieve")

    .addEdge("retrieve", "generate")

    .addEdge("generate", END)

    .compile();


const result = await graph.invoke({
    question: "What is PostgreSQL?",
    answer: ""
});


console.log("\n===== FINAL STATE =====");

console.log(result);