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
    retrievedInfo: z.string(),
    enoughInformation: z.boolean(),
    attempts: z.number(),
    answer: z.string()
});


// -------------------------
// MODEL
// -------------------------

const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash",
    temperature: 0
});


// -------------------------
// EVALUATOR
// -------------------------

const EvaluationSchema = z.object({
    enoughInformation: z.boolean(),
    reason: z.string()
});

const evaluator = model.withStructuredOutput(
    EvaluationSchema
);


// -------------------------
// RETRIEVE NODE
// -------------------------

const retrieveNode = async (
    state: typeof State.State
) => {

    console.log("\n--- RETRIEVE NODE ---");

    console.log("Attempt:", state.attempts + 1);

    return {
        retrievedInfo: `
        PostgreSQL normally listens on port 5432.
        ECONNREFUSED can occur when PostgreSQL is not running
        or the application is connecting to the wrong host or port.
        `,
        attempts: state.attempts + 1
    };
};


// -------------------------
// EVALUATE NODE
// -------------------------

const evaluateNode = async (
    state: typeof State.State
) => {

    console.log("\n--- EVALUATE NODE ---");

    const result = await evaluator.invoke([
        {
            role: "system",
            content:
                "Evaluate whether the retrieved information is sufficient to answer the question. Return enoughInformation=true only when the information is sufficient."
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Retrieved information:
${state.retrievedInfo}
`
        }
    ]);

    console.log(
        "Enough information:",
        result.enoughInformation
    );

    console.log(
        "Reason:",
        result.reason
    );

    return {
        enoughInformation: result.enoughInformation
    };
};


// -------------------------
// GENERATE NODE
// -------------------------

const generateNode = async (
    state: typeof State.State
) => {

    console.log("\n--- GENERATE NODE ---");

    const response = await model.invoke([
        {
            role: "system",
            content:
                "Answer the user's technical question using the retrieved information. Be practical and concise."
        },
        {
            role: "user",
            content: `
Question:
${state.question}

Retrieved information:
${state.retrievedInfo}
`
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

    .addNode("retrieve", retrieveNode)

    .addNode("evaluate", evaluateNode)

    .addNode("generate", generateNode)

    .addEdge(START, "retrieve")

    .addEdge("retrieve", "evaluate")

    .addConditionalEdges(
        "evaluate",

        (state) => {
            if (state.enoughInformation) {
                return "enough";
            }

            return "not_enough";
        },

        {
            enough: "generate",
            not_enough: "retrieve"
        }
    )

    .addEdge("generate", END)

    .compile();


// -------------------------
// RUN
// -------------------------

const result = await graph.invoke({
    question:
        "Why is my Node.js API getting ECONNREFUSED from PostgreSQL?",

    retrievedInfo: "",

    enoughInformation: false,

    attempts: 0,

    answer: ""
});


console.log("\n===== FINAL STATE =====");

console.log(result);