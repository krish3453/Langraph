import "dotenv/config";

import { z } from "zod";
import {
    StateGraph,
    StateSchema,
    START,
    END
} from "@langchain/langgraph";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";


// -------------------------
// STATE
// -------------------------

const State = new StateSchema({
    question: z.string(),
    route: z.string(),
    answer: z.string()
});


// -------------------------
// LLM
// -------------------------

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.6-flash",
    temperature: 0
});


// -------------------------
// STRUCTURED OUTPUT
// -------------------------

const RouteSchema = z.object({
    route: z.enum(["technical", "general"])
});

const classifier = model.withStructuredOutput(RouteSchema);


// -------------------------
// CLASSIFIER NODE
// -------------------------

const classifyNode = async (
    state: typeof State.State
) => {

    console.log("\n--- CLASSIFY NODE ---");

    console.log("Question:", state.question);

    const result = await classifier.invoke([
        {
            role: "system",
            content:
                "Classify the user's question. Return technical for programming, software, database, server, API, debugging, or infrastructure questions. Return general for other questions."
        },
        {
            role: "user",
            content: state.question
        }
    ]);

    console.log("LLM Route:", result.route);

    return {
        route: result.route
    };
};


// -------------------------
// TECHNICAL NODE
// -------------------------

const technicalNode = async (
    state: typeof State.State
) => {

    console.log("\n--- TECHNICAL NODE ---");

    const response = await model.invoke([
        {
            role: "system",
            content:
                "You are a technical support assistant. Explain technical problems clearly and give practical troubleshooting steps."
        },
        {
            role: "user",
            content: state.question
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// -------------------------
// GENERAL NODE
// -------------------------

const generalNode = async (
    state: typeof State.State
) => {

    console.log("\n--- GENERAL NODE ---");

    const response = await model.invoke([
        {
            role: "system",
            content:
                "You are a helpful general-purpose assistant. Answer the user's question clearly and accurately."
        },
        {
            role: "user",
            content: state.question
        }
    ]);

    return {
        answer: response.content.toString()
    };
};


// -------------------------
// GRAPH
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
// RUN
// -------------------------

const result = await graph.invoke({
    question: "Why is the sky blue?",
    route: "",
    answer: ""
});


console.log("\n===== FINAL STATE =====");

console.log(result);